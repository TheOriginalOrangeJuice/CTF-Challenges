FROM python:3.12-alpine
WORKDIR /app
COPY server.py completion.sha256 ./
COPY public/ ./public/
USER 65534:65534
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "server.py"]
