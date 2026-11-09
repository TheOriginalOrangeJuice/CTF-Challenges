# Stage 1: export the map's collision boxes (server needs them for throwing-knife physics)
FROM node:20-alpine AS mapdata
WORKDIR /w
COPY static/map.js map.mjs
COPY tools/export_map.mjs export_map.mjs
RUN node export_map.mjs /w/map.mjs /w/colliders.json

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
COPY static static
COPY --from=mapdata /w/colliders.json data/colliders.json
ADD https://unpkg.com/three@0.160.0/build/three.module.js static/three.module.js
ADD https://unpkg.com/webm-muxer@5.0.3/build/webm-muxer.mjs static/webm-muxer.mjs
RUN useradd -m ctf && chown -R ctf /app && chmod 644 static/three.module.js static/webm-muxer.mjs
USER ctf
ENV FLAG="CTF{1_ju5t_h1t_4_m1ll10n_p01nt_tr1ck5h0t_0n_h1ghr1s3}"
# Shop redeem codes: "CODE:coins,CODE:coins" (override at run time with -e REDEEM_CODES=...)
ENV REDEEM_CODES="MLG:200,NOSCOPE:100,QUICKSCOPE:150,HIGHRISE:250,MOMGETTHECAMERA:1000"
EXPOSE 8080
# One worker: killcam tickets live in memory.
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "1", "--threads", "8", "app:app"]
