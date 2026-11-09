FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
COPY static ./static

RUN useradd --create-home ctf
USER ctf

EXPOSE 8080
# --preload imports the app once in the master so all workers share the same random SECRET.
CMD ["gunicorn", "--preload", "-w", "4", "-b", "0.0.0.0:8080", "server:app"]
