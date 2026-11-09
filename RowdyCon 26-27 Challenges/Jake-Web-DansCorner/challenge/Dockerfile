FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m ctf && chown -R ctf /app
USER ctf
ENV FLAG="CTF{w0_x1_hu4n_q1_z1_n1_h40}"
EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "app:app"]
