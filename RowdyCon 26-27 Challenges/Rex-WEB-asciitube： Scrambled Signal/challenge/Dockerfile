FROM python:3.12-slim

# ffmpeg: yt-dlp muxing. libgl/libglib: OpenCV runtime deps (even headless
# pulls in libglib). ca-certificates for HTTPS fetches.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libglib2.0-0 libgl1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# deno: yt-dlp uses it to solve YouTube's JS signature/n challenges. Without a
# JS runtime on PATH, YouTube playback fails with "Requested format is not
# available". The EJS solver script itself is fetched at runtime from GitHub
# (--remote-components ejs:github), so the container needs outbound to github.com.
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Bake the hardcoded "caught" video into the image so the gag plays from local
# disk with no runtime network. Non-fatal if the build host can't reach
# YouTube/GitHub — the app fetches it once on first use instead. yt-dlp/deno
# caches are deleted afterward so only the final clip remains installed.
ARG CAUGHT_VIDEO_URL=https://www.youtube.com/watch?v=9lNZ_Rnr7Jc
RUN mkdir -p /app/media && \
    if yt-dlp --no-playlist --quiet --no-warnings --remote-components ejs:github \
         --max-filesize 60M -f "bv*[height<=?480]/b[height<=?480]/b" \
         -S "res:360,codec:h264,ext:mp4" \
         -o "/app/media/caught.%(ext)s" "$CAUGHT_VIDEO_URL"; then \
      for f in /app/media/caught.*; do \
        [ "$f" = /app/media/caught.mp4 ] || mv "$f" /app/media/caught.mp4; \
      done; \
    else \
      echo "WARN: caught-video prefetch failed; will fetch at runtime"; \
    fi; \
    rm -rf /root/.cache/yt-dlp /root/.cache/deno; \
    ls -la /app/media

# Public player. The internal flag service (0.0.0.0:9000) is started by app.py
# in-process and is deliberately NOT exposed here.
EXPOSE 5000
CMD ["python", "app.py"]
