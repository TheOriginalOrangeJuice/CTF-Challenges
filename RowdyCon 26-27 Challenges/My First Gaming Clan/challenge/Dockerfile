# TeamSpeak 3 look-alike + "[Admin] Marcel" voice challenge.
# Plain HTTP on 8080; put it behind the CTFd/instancer HTTPS proxy (browsers only allow the microphone on HTTPS origins).
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    QUERY_PORT=0 \
    FLAG=RCC{m0m_1m_1n_4_cl4n_n0w}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# runtime files only (voice clips + manifest are pre-rendered and committed)
COPY server ./server
COPY public ./public
COPY tools/solve.js ./tools/solve.js

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health | grep -q '"voice":true' || exit 1

CMD ["node", "server/index.js"]
