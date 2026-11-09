FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# fonts for the generated GIF text
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py gen_keys.py gen_media.py entrypoint.sh ./
COPY templates/ ./templates/
COPY static/ ./static/

# generate the RS256 keypair and the homage media at build time
RUN python gen_keys.py && python gen_media.py && chmod +x entrypoint.sh

# baked default flag (overridden at runtime by $FLAG via the entrypoint)
COPY flag.txt /flag.txt

EXPOSE 1337
ENTRYPOINT ["/app/entrypoint.sh"]
