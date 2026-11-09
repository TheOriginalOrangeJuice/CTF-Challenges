// Render worker.
//
// One worker is spawned per job so a slow or crashing render can never take the
// API process down with it. Each worker is short-lived and closes itself when
// the job is finished.

import ms from "ms";

const RESULTS_DIR = "/app/results";

interface JobMessage {
  id: string;
  ttl: string;
  note: string;
}

self.onmessage = (event: MessageEvent<JobMessage>) => {
  const { id, ttl, note } = event.data;

  try {
    // Callers give the retention window in human form ("30s", "2h", "7d").
    const retainMs = ms(ttl);
    const slug = String(note ?? "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 48) || "untitled";

    const body = [
      `job:      ${id}`,
      `note:     ${slug}`,
      `retain:   ${retainMs}ms (${ms(retainMs, { long: true })})`,
      `rendered: ok`,
      "",
    ].join("\n");

    Deno.writeTextFileSync(`${RESULTS_DIR}/${id}.txt`, body);
    (self as unknown as Worker).postMessage({ ok: true, output: `${id}.txt` });
  } catch (err) {
    // Surfaced to the caller so bad retention strings are self-explanatory.
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    });
  }

  self.close();
};
