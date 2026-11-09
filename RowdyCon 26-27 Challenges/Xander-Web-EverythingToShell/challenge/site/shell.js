(() => {
  "use strict";

  // ---------------------------------------------------------------- sandboxes

  const COMMON = {
    etc: {
      passwd:
        "root:x:0:0:root:/root:/bin/bash\n" +
        "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n" +
        "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n" +
        "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n" +
        "ctf:x:1000:1000::/home/ctf:/bin/bash\n",
      shadow: null,
      "os-release":
        'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\n' +
        'VERSION_ID="12"\nVERSION="12 (bookworm)"\nID=debian\n',
      hosts: "127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\n",
      "resolv.conf": "# egress disabled by sandbox policy\n",
    },
    home: {
      ctf: {
        ".bash_history": "ls\ncat /flag.txt\nsudo cat /flag.txt\nexit\n",
        ".bashrc": "export PS1='\\u@\\h:\\w\\$ '\nalias ll='ls -la'\n",
        "notes.txt":
          "reminder: flag is in /flag.txt but only root can read it.\n" +
          "the sandbox has no sudo, no suid binaries and no network.\n" +
          "if you got here: you are looking in the wrong place.\n",
      },
    },
    root: null,
    tmp: {},
    proc: { version: "Linux version 6.1.0-21-amd64 (debian-kernel@lists.debian.org) #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1\n" },
    usr: { bin: {}, lib: {}, local: {} },
    var: { log: null },
    "flag.txt": null,
  };

  const SANDBOXES = {
    python: {
      host: "py-sandbox-7f3c",
      home: "/app",
      repl: "python",
      app: {
        "app.py":
          "from flask import Flask, request\nfrom sandbox import run_jailed\n\napp = Flask(__name__)\n\n" +
          "@app.post('/exec')\ndef exec_():\n    return run_jailed(request.json['cmd'], lang='python')\n",
        "sandbox.py": "# seccomp + nsjail wrapper\n# see ops repo\n",
        "requirements.txt": "flask==3.0.3\ngunicorn==22.0.0\n",
        __pycache__: {},
      },
    },
    node: {
      host: "node-sandbox-2a91",
      home: "/app",
      repl: "node",
      app: {
        "server.js":
          "const express = require('express');\nconst { runJailed } = require('./sandbox');\n\n" +
          "const app = express();\napp.use(express.json());\n" +
          "app.post('/exec', (req, res) => res.send(runJailed(req.body.cmd, 'node')));\napp.listen(3000);\n",
        "sandbox.js": "// seccomp + nsjail wrapper\n// see ops repo\n",
        "package.json": '{\n  "name": "node-sandbox",\n  "version": "2.3.1",\n  "dependencies": {\n    "express": "^4.19.2"\n  }\n}\n',
        node_modules: { express: {}, "body-parser": {}, debug: {} },
      },
    },
    php: {
      host: "php-sandbox-c04e",
      home: "/var/www/html",
      repl: "php",
      app: {
        "index.php": "<?php\nrequire 'sandbox.php';\necho run_jailed($_POST['cmd'] ?? '', 'php');\n",
        "sandbox.php": "<?php\n// seccomp + nsjail wrapper\n// see ops repo\n",
        "composer.json": '{\n  "require": {\n    "php": ">=8.2"\n  }\n}\n',
      },
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function buildFs(sb) {
    const root = clone(COMMON);
    root.etc.hostname = sb.host + "\n";
    if (sb.home === "/app") {
      root.app = clone(sb.app);
    } else {
      root.var.www = { html: clone(sb.app) };
    }
    return root;
  }

  const BIN = [
    "bash", "cat", "cd", "clear", "cp", "curl", "date", "echo", "env", "exit", "find", "grep",
    "head", "help", "history", "hostname", "id", "ls", "mkdir", "mv", "nc", "node", "php",
    "ps", "pwd", "python", "python3", "rm", "sh", "sort", "su", "sudo", "tail", "touch",
    "uname", "uptime", "wc", "wget", "whoami",
  ];

  // ----------------------------------------------------------- session state

  class Session {
    constructor(lang) {
      this.lang = lang;
      this.sb = SANDBOXES[lang];
      this.fs = buildFs(this.sb);
      this.cwd = this.sb.home;
      this.mode = "bash"; // bash | python | node | php
      this.history = [];
      this.vars = {};
      this.env = {
        HOME: "/home/ctf",
        HOSTNAME: this.sb.host,
        LANG: "C.UTF-8",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        PWD: this.sb.home,
        SANDBOX_LANG: lang,
        SHELL: "/bin/bash",
        USER: "ctf",
      };
    }

    // ---- filesystem helpers

    resolve(p) {
      if (!p) return this.cwd;
      if (p === "~" || p.startsWith("~/")) p = this.env.HOME + p.slice(1);
      const parts = (p.startsWith("/") ? p : this.cwd + "/" + p).split("/");
      const out = [];
      for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") out.pop();
        else out.push(part);
      }
      return "/" + out.join("/");
    }

    // returns {node} | {denied} | {missing}
    lookup(path) {
      let node = this.fs;
      for (const part of path.split("/").filter(Boolean)) {
        if (node === null) return { denied: true };
        if (typeof node !== "object" || !(part in node)) return { missing: true };
        node = node[part];
      }
      if (node === null) return { denied: true };
      return { node };
    }

    readFile(p, cmd) {
      const r = this.lookup(this.resolve(p));
      if (r.missing) throw `${cmd}: ${p}: No such file or directory`;
      if (r.denied) throw `${cmd}: ${p}: Permission denied`;
      if (typeof r.node === "object") throw `${cmd}: ${p}: Is a directory`;
      return r.node;
    }

    // ---- bash

    prompt() {
      if (this.mode === "python") return ">>> ";
      if (this.mode === "node") return "> ";
      if (this.mode === "php") return "php > ";
      let w = this.cwd;
      if (w === this.env.HOME) w = "~";
      else if (w.startsWith(this.env.HOME + "/")) w = "~" + w.slice(this.env.HOME.length);
      return { user: `ctf@${this.sb.host}`, path: w };
    }

    exec(line) {
      line = line.trim();
      if (!line) return "";
      if (this.mode !== "bash") return this.replEval(line);
      this.history.push(line);
      return this.runLine(line);
    }

    runLine(line) {
      // Sequences: ; && ||
      const out = [];
      let status = 0;
      const seq = splitOps(line, /^(&&|\|\||;)/);
      let op = ";";
      for (let i = 0; i < seq.length; i += 2) {
        const seg = seq[i];
        if (op === "&&" && status !== 0) { op = seq[i + 1]; continue; }
        if (op === "||" && status === 0) { op = seq[i + 1]; continue; }
        const r = this.runPipeline(seg);
        if (r.out) out.push(r.out);
        status = r.status;
        op = seq[i + 1];
      }
      return out.join("\n");
    }

    runPipeline(seg) {
      if (/\/dev\/(tcp|udp)\//.test(seg) || /\bmkfifo\b/.test(seg)) {
        return { out: "bash: connect: Network is unreachable\nbash: /dev/tcp: Invalid argument", status: 1 };
      }
      const redir = seg.match(/\s*>{1,2}\s*(\S+)\s*$/);
      if (redir) {
        const target = redir[1];
        if (target === "/dev/null") seg = seg.slice(0, redir.index);
        else return { out: `bash: ${target}: Read-only file system`, status: 1 };
      }
      let stdin = null;
      let status = 0;
      const stderr = [];
      const parts = splitOps(seg, /^\|/).filter((_, i) => i % 2 === 0);
      for (const part of parts) {
        const argv = tokenize(part.trim(), this.env);
        if (!argv.length) continue;
        try {
          stdin = this.runCmd(argv, stdin);
          status = 0;
        } catch (e) {
          if (e && e.clear) throw e;
          if (String(e)) stderr.push(String(e));
          stdin = "";
          status = 1;
        }
      }
      return { out: [...stderr, stdin ?? ""].filter(Boolean).join("\n"), status };
    }

    runCmd(argv, stdin) {
      const [cmd, ...args] = argv;
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const files = args.filter((a) => !a.startsWith("-"));
      const sb = this.sb;

      switch (cmd) {
        case "help":
          return "GNU bash, version 5.2.15(1)-release (x86_64-pc-linux-gnu)\n" +
            "These shell commands are defined internally. Type `help' to see this list.\n\n" +
            " cd [dir]       echo [arg ...]    exit [n]      history\n" +
            " pwd            type name         alias         export";
        case "clear":
          throw { clear: true };
        case "pwd":
          return this.cwd;
        case "cd": {
          const target = this.resolve(files[0] || "~");
          const r = this.lookup(target);
          if (r.missing) throw `bash: cd: ${files[0]}: No such file or directory`;
          if (r.denied) throw `bash: cd: ${files[0]}: Permission denied`;
          if (typeof r.node !== "object") throw `bash: cd: ${files[0]}: Not a directory`;
          this.cwd = target;
          this.env.PWD = target;
          return "";
        }
        case "ls":
          return this.ls(files.length ? files : ["."], flags.includes("a"), flags.includes("l"));
        case "cat":
          if (!files.length) return stdin ?? "";
          return files.map((f) => this.readFile(f, "cat").replace(/\n$/, "")).join("\n");
        case "head":
        case "tail": {
          const nm = args.join(" ").match(/-n\s*(\d+)|-(\d+)/) || [];
          const n = parseInt(nm[1] || nm[2] || 10, 10);
          const src = files.filter((f) => !/^\d+$/.test(f));
          const text = src.length ? this.readFile(src[0], cmd) : stdin ?? "";
          const lines = text.replace(/\n$/, "").split("\n");
          return (cmd === "head" ? lines.slice(0, n) : lines.slice(-n)).join("\n");
        }
        case "wc": {
          const text = files.length ? this.readFile(files[0], "wc") : stdin ?? "";
          const l = text ? text.replace(/\n$/, "").split("\n").length : 0;
          return flags.includes("l") ? String(l) : `${l} ${text.split(/\s+/).filter(Boolean).length} ${text.length}`;
        }
        case "sort":
          return (files.length ? this.readFile(files[0], "sort") : stdin ?? "").split("\n").sort().join("\n");
        case "grep": {
          if (!files.length) throw "Usage: grep [OPTION]... PATTERNS [FILE]...";
          const [pat, ...fs] = files;
          const text = fs.length ? this.readFile(fs[0], "grep") : stdin ?? "";
          let re;
          try { re = new RegExp(pat, flags.includes("i") ? "i" : ""); } catch { re = { test: (s) => s.includes(pat) }; }
          const hits = text.split("\n").filter((l) => re.test(l) !== flags.includes("v"));
          if (!hits.length) throw "";
          return hits.join("\n");
        }
        case "find": {
          const start = files[0] || ".";
          const name = (args.join(" ").match(/-name\s+(\S+)/) || [])[1];
          const re = name ? new RegExp("^" + name.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
          const out = [];
          const walk = (path, display, node) => {
            const base = display.split("/").pop();
            if (!re || re.test(base)) out.push(display);
            if (node === null) { out.push(`find: '${display}': Permission denied`); return; }
            if (typeof node === "object") for (const k of Object.keys(node)) walk(path + "/" + k, display.replace(/\/$/, "") + "/" + k, node[k]);
          };
          const abs = this.resolve(start);
          const r = this.lookup(abs);
          if (r.missing) throw `find: '${start}': No such file or directory`;
          walk(abs, start, r.denied ? null : r.node);
          return out.join("\n");
        }
        case "echo":
          return args.filter((a) => a !== "-n" && a !== "-e").join(" ");
        case "whoami":
          return "ctf";
        case "id":
          return "uid=1000(ctf) gid=1000(ctf) groups=1000(ctf)";
        case "hostname":
          return sb.host;
        case "uname":
          return flags.includes("a")
            ? `Linux ${sb.host} 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 (2024-05-03) x86_64 GNU/Linux`
            : "Linux";
        case "date":
          return new Date().toUTCString().replace("GMT", "UTC");
        case "uptime":
          return ` ${new Date().toTimeString().slice(0, 8)} up 13 days,  4:02,  0 users,  load average: 0.08, 0.03, 0.01`;
        case "env":
        case "printenv":
          return Object.entries(this.env).map(([k, v]) => `${k}=${v}`).join("\n");
        case "export": {
          for (const a of files) {
            const m = a.match(/^(\w+)=(.*)$/);
            if (m) this.env[m[1]] = m[2];
          }
          return "";
        }
        case "history":
          return this.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n");
        case "ps": {
          const interp = { python: "/usr/local/bin/python3 /app/app.py", node: "node /app/server.js", php: "php-fpm: pool www" }[this.lang];
          return "    PID TTY          TIME CMD\n" +
            "      1 ?        00:00:00 nsjail\n" +
            `      7 ?        00:00:02 ${interp}\n` +
            "     23 pts/0    00:00:00 bash\n" +
            `     ${40 + this.history.length} pts/0    00:00:00 ps`;
        }
        case "which":
        case "type":
          return files.map((f) => (BIN.includes(f) ? `/usr/bin/${f}` : `${f} not found`)).join("\n");
        case "sudo":
          if (flags.includes("l")) return `Sorry, user ctf may not run sudo on ${sb.host}.`;
          return "[sudo] password for ctf: \nctf is not in the sudoers file.  This incident will be reported.";
        case "su":
          return "Password: \nsu: Authentication failure";
        case "touch":
        case "mkdir":
        case "cp":
        case "mv":
          throw `${cmd}: cannot ${cmd === "mkdir" ? "create directory" : "touch"} '${files[files.length - 1] || ""}': Read-only file system`;
        case "rm":
          if (/r/.test(flags) && files.some((f) => f === "/" || f === "/*")) {
            return "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n(also: Read-only file system. nice try though.)";
          }
          throw `rm: cannot remove '${files[0] || ""}': Read-only file system`;
        case "chmod":
        case "chown":
          throw `${cmd}: changing permissions of '${files[files.length - 1] || ""}': Operation not permitted`;
        case "curl":
        case "wget": {
          const url = files[0] || "";
          if (!url) throw `${cmd}: try '${cmd} --help' for more information`;
          const host = url.replace(/^\w+:\/\//, "").split(/[/:]/)[0];
          throw cmd === "curl"
            ? `curl: (6) Could not resolve host: ${host}`
            : `--${new Date().toISOString().slice(0, 19).replace("T", " ")}--  ${url}\nResolving ${host} (${host})... failed: Temporary failure in name resolution.\nwget: unable to resolve host address '${host}'`;
        }
        case "nc":
        case "ncat":
        case "netcat":
        case "socat":
        case "ssh":
        case "telnet":
          throw `${cmd}: connect to ${files[0] || "host"}: Network is unreachable`;
        case "bash":
        case "sh":
          if (args.includes("-c")) return this.runLine(args.slice(args.indexOf("-c") + 1).join(" "));
          if (args.includes("-i") || !args.length) return "";
          return this.runLine(this.readFile(files[0], cmd));
        case "exit":
        case "logout":
          return "logout\n\n[session restored by sandbox supervisor]";
        case "python":
        case "python3":
          return this.interp("python", args, "-c");
        case "node":
          return this.interp("node", args, "-e");
        case "php":
          return this.interp("php", args, "-r");
        case "gcc":
        case "cc":
        case "make":
        case "vim":
        case "vi":
        case "nano":
        case "apt":
        case "apt-get":
        case "pip":
        case "npm":
        case "composer":
        case "git":
        default:
          throw `bash: ${cmd}: command not found`;
      }
    }

    ls(paths, all, long) {
      const blocks = [];
      for (const p of paths) {
        const r = this.lookup(this.resolve(p));
        if (r.missing) { blocks.push(`ls: cannot access '${p}': No such file or directory`); continue; }
        if (r.denied) { blocks.push(`ls: cannot open directory '${p}': Permission denied`); continue; }
        let entries;
        if (typeof r.node === "object") {
          entries = Object.keys(r.node).sort().filter((n) => all || !n.startsWith("."));
          if (all) entries = [".", "..", ...entries];
        } else {
          entries = [p];
        }
        const kind = (n) => {
          if (n === "." || n === "..") return "d";
          const v = typeof r.node === "object" ? r.node[n] : r.node;
          return v !== null && typeof v === "object" ? "d" : v === null && n !== "flag.txt" && n !== "shadow" ? "d" : "-";
        };
        const fmt = (n) => (kind(n) === "d" ? `\u0001${n}\u0002` : n);
        let text;
        if (long) {
          text = `total ${entries.length * 4}\n` + entries.map((n) => {
            const v = typeof r.node === "object" ? r.node[n] : r.node;
            const d = kind(n) === "d";
            const owner = v === null ? "root     root    " : "ctf      ctf     ";
            const mode = d ? (v === null ? "drwx------" : "drwxr-xr-x") : v === null ? "-r--------" : "-rw-r--r--";
            const size = d ? 4096 : typeof v === "string" ? v.length : 38;
            return `${mode} 1 ${owner} ${String(size).padStart(5)} Oct 28 13:37 ${fmt(n)}`;
          }).join("\n");
        } else {
          text = entries.map(fmt).join("  ");
        }
        blocks.push(paths.length > 1 ? `${p}:\n${text}` : text);
      }
      return blocks.join("\n\n");
    }

    // ---- interpreters

    interp(lang, args, codeFlag) {
      if (args.includes("--version") || args.includes("-v") || args.includes("-V")) {
        return { python: "Python 3.12.4", node: "v20.15.0", php: "PHP 8.2.20 (cli) (built: Jun 13 2024 22:20:01) (NTS)" }[lang];
      }
      const ci = args.indexOf(codeFlag);
      if (ci !== -1) {
        const prev = this.mode;
        this.mode = lang;
        try { return this.replEval(args.slice(ci + 1).join(" "), true); } finally { this.mode = prev; }
      }
      if (args.length && !(lang === "php" && args[0] === "-a")) {
        return this.readFile(args[0], lang === "python" ? "python3: can't open file" : lang) && "";
      }
      this.mode = lang;
      return {
        python: 'Python 3.12.4 (main, Jun 27 2024, 00:07:42) [GCC 12.2.0] on linux\nType "help", "copyright", "credits" or "license" for more information.',
        node: 'Welcome to Node.js v20.15.0.\nType ".help" for more information.',
        php: "Interactive shell\n",
      }[lang];
    }

    replEval(code, oneShot = false) {
      const lang = this.mode;
      code = code.trim().replace(/^['"](.*)['"]$/s, "$1");
      if (!oneShot) this.history.push(code);
      const leave = () => { this.mode = "bash"; return ""; };

      if (lang === "python" && /^(exit|quit)(\(\))?$/.test(code)) return leave();
      if (lang === "node" && /^(\.exit|process\.exit\(.*\))$/.test(code)) return leave();
      if (lang === "php" && /^(exit|quit);?$/.test(code)) return leave();

      // Anything that shells out goes straight back to "bash".
      const shell = extractShell(code, lang);
      if (shell !== null) {
        const out = this.runLine(shell);
        if (lang === "python") {
          if (/os\.system/.test(code)) return (out ? out + "\n" : "") + (oneShot ? "" : "0");
          if (/check_output/.test(code)) return oneShot ? "" : pyBytes(out + "\n");
          if (/subprocess\.(run|call|Popen)/.test(code)) return out + (oneShot ? "" : `\nCompletedProcess(args=${JSON.stringify(shell)}, returncode=0)`);
          return oneShot ? out : `'${escapeStr(out + "\n")}'`;
        }
        if (lang === "node") {
          if (oneShot) return out;
          if (/toString\(\)|encoding/.test(code)) return `'${escapeStr(out + "\n")}'`;
          return nodeBuffer(out + "\n");
        }
        return out;
      }

      const file = code.match(/(?:open|readFileSync|file_get_contents|readfile|highlight_file|show_source)\s*\(\s*['"]([^'"]+)['"]/);
      if (file) {
        let content;
        try { content = this.readFile(file[1], "cat"); } catch (e) { return this.replError(String(e).replace(/^cat: /, ""), file[1]); }
        if (lang === "python") return oneShot ? content : `'${escapeStr(content)}'`;
        if (lang === "node") return oneShot ? content : `'${escapeStr(content)}'`;
        return content;
      }

      return evalSimple(code, lang, this.vars, oneShot);
    }

    replError(msg, path) {
      const reason = msg.includes("Permission") ? "Permission denied" : "No such file or directory";
      if (this.mode === "python") {
        const cls = reason === "Permission denied" ? "PermissionError: [Errno 13]" : "FileNotFoundError: [Errno 2]";
        return `Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\n${cls} ${reason}: '${path}'`;
      }
      if (this.mode === "node") {
        const code = reason === "Permission denied" ? "EACCES" : "ENOENT";
        return `Uncaught Error: ${code}: ${reason.toLowerCase()}, open '${path}'`;
      }
      return `PHP Warning:  file_get_contents(${path}): Failed to open stream: ${reason} in php shell code on line 1`;
    }
  }

  // ---------------------------------------------------------------- helpers

  // Split on shell operators outside quotes: [seg, op, seg, op, seg...]
  function splitOps(s, opRe) {
    const out = [];
    let cur = "";
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; cur += c; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      const m = s.slice(i).match(opRe);
      if (m) { out.push(cur.trim(), m[1] || m[0]); cur = ""; i += m[0].length - 1; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  function tokenize(s, env) {
    const out = [];
    let cur = "";
    let q = null;
    let has = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === q) q = null;
        else cur += c;
      } else if (c === "'" || c === '"') {
        q = c; has = true;
      } else if (/\s/.test(c)) {
        if (cur || has) out.push(cur);
        cur = ""; has = false;
      } else {
        cur += c;
      }
    }
    if (cur || has) out.push(cur);
    return out.map((t) => t.replace(/\$\{?(\w+)\}?/g, (_, k) => env[k] ?? ""));
  }

  function extractShell(code, lang) {
    const fn = "(?:system|popen|exec|execSync|execFileSync|spawnSync|shell_exec|passthru|proc_open|check_output|getoutput|getstatusoutput|run|call|Popen)";
    const list = code.match(new RegExp(fn + "\\s*\\(\\s*\\[([^\\]]*)\\]"));
    if (list) {
      const items = [...list[1].matchAll(/(['"])(.*?)\1/g)].map((m) => m[2]);
      if (items.length) return items.join(" ");
    }
    const str = code.match(new RegExp(fn + "\\s*\\(\\s*(['\"`])(.*?)\\1"));
    if (str) return str[2];
    const tick = lang === "php" && code.match(/`([^`]+)`/);
    if (tick) return tick[1];
    return null;
  }

  function escapeStr(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  }

  function pyBytes(s) {
    return `b'${escapeStr(s)}'`;
  }

  function nodeBuffer(s) {
    const bytes = [...new TextEncoder().encode(s)];
    const shown = bytes.slice(0, 50).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    return `<Buffer ${shown}${bytes.length > 50 ? ` ... ${bytes.length - 50} more bytes` : ""}>`;
  }

  // Tiny expression evaluator: numbers, strings, variables, print/echo/console.log.
  function evalSimple(code, lang, vars, oneShot) {
    code = code.replace(/;\s*$/, "").trim();
    if (!code) return "";
    if (lang === "php") code = code.replace(/^<\?php\s*/, "");

    const errs = {
      python: (n) => `Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nNameError: name '${n}' is not defined`,
      node: (n) => `Uncaught ReferenceError: ${n} is not defined`,
      php: (n) => `PHP Warning:  Undefined constant "${n}" in php shell code on line 1`,
    };
    const syntax = {
      python: '  File "<stdin>", line 1\n    ' + code + "\n    ^\nSyntaxError: invalid syntax",
      node: "Uncaught SyntaxError: Unexpected identifier",
      php: "PHP Parse error:  syntax error, unexpected end of file in php shell code on line 1",
    };

    const value = (expr) => {
      expr = expr.trim();
      let m;
      if ((m = expr.match(/^(['"])(.*)\1$/s))) return { v: m[2], s: true };
      if (/^[\d\s+\-*/().%]+$/.test(expr) && /\d/.test(expr)) {
        try {
          const n = Function(`"use strict";return (${expr.replace(/\/\//g, "/")})`)();
          if (typeof n === "number" && isFinite(n)) return { v: n };
        } catch { /* fall through */ }
        return { syntax: true };
      }
      const name = expr.replace(/^\$/, "");
      if (/^\w+$/.test(name)) {
        if (name in vars) return vars[name];
        if (/^(True|False|None|true|false|null|undefined)$/.test(name)) return { v: name };
        return { err: errs[lang](name) };
      }
      return { syntax: true };
    };
    const show = (r, repr) => {
      if (r.err) return r.err;
      if (r.syntax) return syntax[lang];
      if (!repr || !r.s) return String(r.v);
      return `'${escapeStr(r.v)}'`;
    };

    let m;
    if ((m = code.match(/^import\s|^from\s+\w+\s+import|^(?:const|let|var)\s+\w+\s*=\s*require\(/))) return lang === "node" && !oneShot ? "undefined" : "";
    if ((m = code.match(/^(?:print\s*\((.*)\)|console\.log\s*\((.*)\)|(?:echo|print)\s+(.*))$/s))) {
      const r = value(m[1] ?? m[2] ?? m[3]);
      const out = show(r, false);
      return lang === "node" && !oneShot && !r.err && !r.syntax ? out + "\nundefined" : out;
    }
    if ((m = code.match(/^(?:(?:const|let|var)\s+)?\$?(\w+)\s*=\s*(.+)$/s))) {
      const r = value(m[2]);
      if (r.err || r.syntax) return show(r, true);
      vars[m[1]] = r;
      return lang === "node" && !oneShot ? (/^(const|let|var)/.test(code) ? "undefined" : show(r, true)) : "";
    }
    if (lang === "php") return code.startsWith("$") ? "" : syntax.php;
    if (oneShot) return "";
    return show(value(code), true);
  }

  // ------------------------------------------------------------------- UI

  const term = document.getElementById("term");
  const wtitle = document.getElementById("wtitle");
  const tabs = document.querySelectorAll(".tab");
  let session;
  let histIdx = 0;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function print(text, cls = "") {
    if (text === "" || text == null) return;
    const div = document.createElement("div");
    div.className = "line " + cls;
    div.innerHTML = esc(String(text)).replace(/\u0001(.*?)\u0002/g, '<span class="dir">$1</span>');
    term.insertBefore(div, term.lastElementChild);
  }

  function promptHtml() {
    const p = session.prompt();
    if (typeof p === "string") return `<span class="p">${esc(p)}</span>`;
    return `<span class="p">${esc(p.user)}:<span class="path">${esc(p.path)}</span>$ </span>`;
  }

  function renderInput() {
    const old = term.querySelector(".inputline");
    if (old) old.remove();
    const line = document.createElement("div");
    line.className = "line inputline";
    line.innerHTML = promptHtml() + '<input type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="terminal input">';
    term.appendChild(line);
    const input = line.querySelector("input");
    input.addEventListener("keydown", onKey);
    input.focus();
    wtitle.textContent = `ctf@${session.sb.host}: ${session.cwd}`;
    term.scrollTop = term.scrollHeight;
  }

  function submit(input) {
    const cmd = input.value;
    const echo = document.createElement("div");
    echo.className = "line";
    echo.innerHTML = promptHtml() + esc(cmd);
    term.insertBefore(echo, term.lastElementChild);
    input.disabled = true;

    // Fake round-trip so it feels like there's a backend.
    const delay = cmd.trim() ? 60 + Math.random() * 180 : 0;
    setTimeout(() => {
      try {
        const out = session.exec(cmd);
        print(out, /^(bash|ls|cat|cd|rm|find|head|tail|Traceback|Uncaught|PHP|sudo|su|curl|wget|nc)\b.*(denied|not found|No such|Error|error|Failure|failure|unreachable|Read-only|not permitted|resolve|sudoers)/.test(out) ? "err" : "");
      } catch (e) {
        if (e && e.clear) {
          term.querySelectorAll(".line:not(.inputline)").forEach((n) => n.remove());
        } else {
          print(String(e), "err");
        }
      }
      histIdx = session.history.length;
      renderInput();
    }, delay);
  }

  function complete(input) {
    const val = input.value;
    const m = val.match(/(\S*)$/);
    const word = m[1];
    const isCmd = !/\s/.test(val.trim()) && session.mode === "bash";
    let candidates;
    let prefix = word;
    let base = "";
    if (isCmd) {
      candidates = BIN;
    } else {
      const slash = word.lastIndexOf("/");
      base = slash >= 0 ? word.slice(0, slash + 1) : "";
      prefix = word.slice(slash + 1);
      const r = session.lookup(session.resolve(base || "."));
      if (!r.node || typeof r.node !== "object") return;
      candidates = Object.keys(r.node).map((k) => (r.node[k] && typeof r.node[k] === "object" ? k + "/" : k));
    }
    const hits = candidates.filter((c) => c.startsWith(prefix) && (prefix.startsWith(".") || !c.startsWith(".")));
    if (hits.length === 1) {
      input.value = val.slice(0, val.length - word.length) + base + hits[0] + (hits[0].endsWith("/") ? "" : " ");
    } else if (hits.length > 1) {
      let common = hits[0];
      for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
      if (common.length > prefix.length) input.value = val.slice(0, val.length - word.length) + base + common;
      else {
        const echo = document.createElement("div");
        echo.className = "line";
        echo.innerHTML = promptHtml() + esc(val);
        term.insertBefore(echo, term.lastElementChild);
        print(hits.join("  "));
      }
    }
  }

  function onKey(e) {
    const input = e.target;
    if (e.key === "Enter") {
      e.preventDefault();
      submit(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx > 0) input.value = session.history[--histIdx] ?? "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      histIdx = Math.min(session.history.length, histIdx + 1);
      input.value = session.history[histIdx] ?? "";
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete(input);
    } else if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      term.querySelectorAll(".line:not(.inputline)").forEach((n) => n.remove());
    } else if (e.ctrlKey && e.key === "c") {
      if (window.getSelection().toString()) return;
      e.preventDefault();
      const echo = document.createElement("div");
      echo.className = "line";
      echo.innerHTML = promptHtml() + esc(input.value) + "^C";
      term.insertBefore(echo, term.lastElementChild);
      input.value = "";
    } else if (e.ctrlKey && e.key === "d" && !input.value) {
      e.preventDefault();
      if (session.mode !== "bash") {
        session.mode = "bash";
        renderInput();
      }
    }
  }

  function boot(lang) {
    session = new Session(lang);
    histIdx = 0;
    term.innerHTML = "";
    renderInput();
    const sb = session.sb;
    print(`Connecting to ${sb.host}.sandbox.internal ...`, "dim");
    print(`Linux ${sb.host} 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 x86_64`);
    print(`\nThe programs included with the Debian GNU/Linux system are free software.\nLast login: ${new Date(Date.now() - 864e5).toUTCString()} from 10.13.37.1\n`);
    session.cwd = sb.home;
    renderInput();
  }

  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      boot(t.dataset.lang);
    })
  );
  term.addEventListener("click", () => {
    if (!window.getSelection().toString()) term.querySelector("input")?.focus();
  });

  boot("python");
})();
