# Intended solutions

Each tier leaks its flag through the same mechanism: make the player fetch the
**internal** flag service (`http://127.0.0.1:9000/flag`, bound to `0.0.0.0:9000`
inside the container and never published). When the fetched bytes aren't a
video, the player reflects the response body back into the page — flag included.

**Filter:** the URL must contain the substring `youtube`, or the
player refuses it ("only YouTube links can be played"). So every payload carries
a `youtube` marker — a `#youtube` fragment (never sent to the server) for the
easy loopback URLs, and a real `youtube.com` for hard's `@` trick.

You can solve everything by hand in the browser (paste the URL, read the "server
response" box) or run the driver scripts here:

```bash
pip install -r requirements.txt
python solve_easy.py      # -> RCC{ssrf_is_easy_when_nobody_filters}
python solve_medium.py      # -> RCC{userinfo_at_trick_beats_the_allowlist}
```

(Each script takes an optional base URL, e.g. `python solve_easy.py http://localhost:5001`.)

---

## Easy — youtube gate only
No SSRF filter, so point straight at the internal service and just satisfy the
gate:

```
http://127.0.0.1:9000/flag#youtube
```

The `#youtube` fragment makes the string contain `youtube`; the fragment is
stripped before the request goes out, so the server still fetches `/flag`.