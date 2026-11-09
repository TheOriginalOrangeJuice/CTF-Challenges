FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root
RUN apk add --no-cache git \
 && rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf
COPY site/ /opt/site/
COPY build_repo.sh /opt/build_repo.sh
COPY entrypoint-site.sh /docker-entrypoint.d/40-build-site.sh
RUN chmod -R a+rX /opt/site && chmod 755 /opt/build_repo.sh /docker-entrypoint.d/40-build-site.sh

# Runs as uid 101; all writable state (web root, pid, temp) lives in /tmp.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
