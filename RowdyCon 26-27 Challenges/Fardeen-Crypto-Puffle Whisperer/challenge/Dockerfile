FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db AS fetch
WORKDIR /build
COPY runtime-lock.json fetch_model.py ./
RUN --mount=type=secret,id=build_ca if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca; fi; python fetch_model.py

FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db
COPY apt-lock.txt /tmp/apt-lock.txt
RUN apt-get update && xargs -a /tmp/apt-lock.txt apt-get install -y --no-install-recommends && rm -rf /var/lib/apt/lists/* /tmp/apt-lock.txt \
    && useradd --uid 10001 --create-home penguin && mkdir /data && chown penguin:penguin /data
WORKDIR /app
COPY requirements.txt ./
RUN --mount=type=secret,id=build_ca if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; pip install --no-cache-dir -r requirements.txt
COPY --from=fetch /opt/llama /opt/llama
COPY --from=fetch /opt/model /opt/model
COPY server ./server
COPY public ./public
COPY licenses /opt/licenses
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LD_LIBRARY_PATH=/opt/llama
USER penguin
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/readyz',timeout=3)"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
