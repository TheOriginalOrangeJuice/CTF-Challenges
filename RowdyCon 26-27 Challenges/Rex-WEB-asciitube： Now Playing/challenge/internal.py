"""Internal-only service. Bound to 0.0.0.0:9000 INSIDE the container and never
published to the host in docker-compose, so the only way to reach it is to make
the public player fetch it for you (SSRF).

Themed as the render worker's private metadata API — it just happens to also
expose the flag on /flag, the way a too-trusting internal service would.
"""
import os
from flask import Flask, jsonify

app = Flask(__name__)
FLAG = os.environ.get("FLAG", "RCC{local_default_set_FLAG_env}")
PORT = int(os.environ.get("INTERNAL_PORT", "9000"))


@app.route("/")
def root():
    return jsonify(service="asciitube-render-worker", status="ok",
                   note="internal metadata API — not for public use")


@app.route("/flag")
def flag():
    # No auth: this service assumes it is unreachable from the outside.
    return FLAG + "\n", 200, {"Content-Type": "text/plain"}


def run():
    # Threaded so it can serve the SSRF request while the player is running.
    app.run(host="0.0.0.0", port=PORT, threaded=True)


if __name__ == "__main__":
    run()
