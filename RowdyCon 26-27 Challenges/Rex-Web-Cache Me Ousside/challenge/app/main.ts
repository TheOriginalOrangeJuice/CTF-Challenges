// Snapshot Uploader - internal render API.
//
// Accepts an upload, then renders a small receipt for it in a background
// worker. Results are served back read-only from /results.

import ms from "ms";

const UPLOAD_DIR = "/app/uploads";
const RESULTS_DIR = "/app/results";
const PORT = 8000;
const STARTED = Date.now();

interface Job {
  id: string;
  status: "running" | "done" | "error";
  output?: string;
  error?: string;
}

const jobs = new Map<string, Job>();

// Difficulty knob. By default render failures return one generic message and
// the detail is kept server-side. Set VERBOSE_ERRORS=1 for the easier variant,
// which echoes the worker's stack trace to the caller and hands players the
// on-disk module layout.
const VERBOSE_ERRORS = (Deno.env.get("VERBOSE_ERRORS") ?? "0") !== "0";

/** Public projection of a job - redacts render internals when configured. */
function view(job: Job): Job {
  if (VERBOSE_ERRORS || job.status !== "error") return job;
  return { ...job, error: "render failed" };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INDEX = `<!doctype html>
<title>Snapshot Uploader</title>
<style>
  body{font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:44rem;
       margin:3rem auto;padding:0 1.5rem;background:#101216;color:#d7dae0}
  h1{font-size:1.3rem;color:#8ab4f8;margin-bottom:.2rem}
  p.sub{color:#7c8496;margin-top:0}
  code{background:#1a1d24;padding:.15rem .4rem;border-radius:3px;color:#e6c07b}
  pre{background:#1a1d24;padding:1rem;border-radius:6px;overflow-x:auto}
  hr{border:0;border-top:1px solid #262a33;margin:1.75rem 0}
</style>
<h1>Snapshot Uploader</h1>
<p class="sub">internal render API</p>
<hr>
<p>Upload a file, then render a receipt for it.</p>
<pre>POST /upload           multipart/form-data, field "file"
POST /jobs             {"ttl":"30s","note":"..."}  -> renders in a worker
GET  /jobs/&lt;id&gt;        job status
GET  /results/&lt;name&gt;   rendered output
GET  /health           uptime
GET  /openapi.yaml     machine-readable API spec (OpenAPI 3.1)</pre>
<p>Retention windows accept human durations - <code>45s</code>, <code>2h</code>, <code>7d</code>.</p>
<p>Not sure of the exact request and response shapes?
   <a href="/openapi.yaml" download>Download the OpenAPI spec</a>.</p>
`;

// Published API contract, served at GET /openapi.yaml so callers don't have to
// reverse-engineer the request shapes. Describes the documented behaviour only.
const OPENAPI = `openapi: 3.1.0
info:
  title: Snapshot Uploader API
  version: "1.0.0"
  description: >
    Internal render API. Upload a file, render a short receipt for it in a
    background worker, then read the receipt back. Retention windows accept
    human-readable durations such as "45s", "2h" or "7d".
servers:
  - url: /
paths:
  /:
    get:
      summary: HTML landing page
      responses:
        "200":
          description: HTML index
          content:
            text/html: {}
  /health:
    get:
      summary: Service health and uptime
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, example: ok }
                  uptime: { type: string, example: "3 minutes" }
  /upload:
    post:
      summary: Upload a file to be rendered later
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file:
                  type: string
                  format: binary
                  description: >
                    The file to store. The multipart part's own filename is
                    used as the stored name.
      responses:
        "200":
          description: Stored
          content:
            application/json:
              schema:
                type: object
                properties:
                  stored: { type: string, example: snapshot.bin }
                  bytes: { type: integer, example: 2048 }
        "400":
          description: Missing or malformed upload
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
        "500":
          description: Could not store upload
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
  /jobs:
    post:
      summary: Render a receipt in a background worker
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                ttl:
                  type: string
                  description: Retention window as a human-readable duration.
                  default: "30s"
                  examples: ["45s", "2h", "7d"]
                note:
                  type: string
                  description: Free-text label for the receipt.
                  default: upload
            examples:
              default:
                value: { ttl: "30s", note: "nightly snapshot" }
      responses:
        "200":
          description: Render finished
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Job" }
        "500":
          description: Render failed
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Job" }
  /jobs/{id}:
    get:
      summary: Job status
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Job
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Job" }
        "404":
          description: No such job
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
  /results/{name}:
    get:
      summary: Fetch rendered output
      parameters:
        - name: name
          in: path
          required: true
          description: Result file name. Validated server-side.
          schema:
            type: string
            pattern: "^[A-Za-z0-9._-]{1,64}$"
      responses:
        "200":
          description: Rendered output
          content:
            text/plain: {}
        "400":
          description: Bad result name
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
        "404":
          description: Not found
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
components:
  schemas:
    Job:
      type: object
      properties:
        id: { type: string, example: "a1b2c3d4" }
        status: { type: string, enum: [running, done, error] }
        output: { type: string, example: "a1b2c3d4.txt" }
        error: { type: string }
    Error:
      type: object
      properties:
        error: { type: string }
`;

/** Spawn a fresh worker for this job and wait for it to report back. */
function runJob(job: Job, ttl: string, note: string): Promise<void> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
      type: "module",
    });

    let settled = false;
    const finish = (patch: Partial<Job>) => {
      if (settled) return;
      settled = true;
      Object.assign(job, patch);
      try {
        worker.terminate();
      } catch { /* already gone */ }
      resolve();
    };

    worker.onmessage = (event) => {
      const data = event.data ?? {};
      if (data.ok) finish({ status: "done", output: data.output });
      else finish({ status: "error", error: data.error ?? "render failed" });
    };

    worker.onerror = (event) => {
      event.preventDefault();
      finish({ status: "error", error: event.message ?? "worker crashed" });
    };

    // Guard against a worker that never reports back.
    setTimeout(() => finish({ status: "error", error: "render timed out" }), 10_000);

    worker.postMessage({ id: job.id, ttl, note });
  });
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/") {
    return new Response(INDEX, { headers: { "content-type": "text/html" } });
  }

  if (req.method === "GET" && path === "/health") {
    return json({ status: "ok", uptime: ms(Date.now() - STARTED, { long: true }) });
  }

  if (req.method === "GET" && (path === "/openapi.yaml" || path === "/openapi.yml")) {
    return new Response(OPENAPI, {
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "content-disposition": 'attachment; filename="warm-cache-openapi.yaml"',
      },
    });
  }

  if (req.method === "POST" && path === "/upload") {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ error: "expected multipart/form-data" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "missing form field 'file'" }, 400);
    }

    const dest = `${UPLOAD_DIR}/${file.name}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
      const parent = dest.slice(0, dest.lastIndexOf("/"));
      await Deno.mkdir(parent, { recursive: true });
      await Deno.writeFile(dest, bytes);
    } catch (err) {
      return json({ error: `could not store upload: ${err}` }, 500);
    }

    return json({ stored: file.name, bytes: bytes.length });
  }

  if (req.method === "POST" && path === "/jobs") {
    const body = await req.json().catch(() => ({}));
    const id = crypto.randomUUID().slice(0, 8);
    const job: Job = { id, status: "running" };
    jobs.set(id, job);

    await runJob(job, String(body.ttl ?? "30s"), String(body.note ?? "upload"));
    if (job.status === "error" && !VERBOSE_ERRORS) {
      console.error(`job ${job.id} failed: ${job.error}`);
    }
    return json(view(job), job.status === "error" ? 500 : 200);
  }

  if (req.method === "GET" && path.startsWith("/jobs/")) {
    const job = jobs.get(path.slice("/jobs/".length));
    return job ? json(view(job)) : json({ error: "no such job" }, 404);
  }

  if (req.method === "GET" && path.startsWith("/results/")) {
    const name = path.slice("/results/".length);
    // Results are attacker-reachable, so the name is validated strictly.
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(name) || name.includes("..")) {
      return json({ error: "bad result name" }, 400);
    }
    try {
      const data = await Deno.readFile(`${RESULTS_DIR}/${name}`);
      return new Response(data, { headers: { "content-type": "text/plain" } });
    } catch {
      return json({ error: "not found" }, 404);
    }
  }

  return json({ error: "not found" }, 404);
}

await Deno.mkdir(UPLOAD_DIR, { recursive: true });
await Deno.mkdir(RESULTS_DIR, { recursive: true });

console.log(`snapshot-uploader listening on :${PORT}`);
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);
