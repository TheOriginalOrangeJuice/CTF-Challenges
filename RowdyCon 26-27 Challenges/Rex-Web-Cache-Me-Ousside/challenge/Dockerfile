FROM denoland/deno:2.9.5

ENV DENO_DIR=/deno-dir

WORKDIR /app
COPY app/ /app/

# Warm the module cache at build time so the container needs no registry access
# at runtime. This is the ordinary way to build a Deno image.
RUN deno cache /app/main.ts /app/worker.ts

COPY flag.txt /flag.txt

# Application code stays root-owned, so the runtime user cannot rewrite it.
# Only the two data directories the service actually writes to are handed over.
RUN mkdir -p /app/uploads /app/results \
    && chown -R root:root /app \
    && chown deno:deno /app/uploads /app/results \
    && chown -R deno:deno /deno-dir \
    && chown deno:deno /flag.txt \
    && chmod 400 /flag.txt

USER deno
EXPOSE 8000

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env=VERBOSE_ERRORS", "/app/main.ts"]
