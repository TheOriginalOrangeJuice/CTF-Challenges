# Self-contained netcat service for the "Double It" pwn challenge.
#
# Build (from the DOUBLE_IT/ directory, i.e. the build context):
#   docker build -t double_it -f server/Dockerfile .
#
# Run (put the REAL flag in via an env/secret or bind mount, NOT baked in
# if you can avoid it; here we show the simple baked-in form for a CTF):
#   docker run --rm -p 1337:1337 -e FLAG='flag{real_one_here}' double_it
#
# Players then:  nc <host> 1337

FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev socat \
 && rm -rf /var/lib/apt/lists/*

# Unprivileged user to run the service.
RUN useradd -m -s /usr/sbin/nologin ctf

WORKDIR /chal
COPY src/double_it.c /chal/src/double_it.c
COPY Makefile /chal/Makefile

# Build inside the image so the served binary matches the source exactly.
RUN make && cp double_it /chal/double_it

# Entrypoint writes the real flag from $FLAG (default is a placeholder) and
# launches the forking socat service as the unprivileged user.
COPY server/entrypoint.sh /chal/entrypoint.sh
RUN chmod +x /chal/entrypoint.sh && chown -R ctf:ctf /chal

EXPOSE 1337
USER ctf
ENTRYPOINT ["/chal/entrypoint.sh"]
