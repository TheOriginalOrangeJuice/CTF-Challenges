/*
 * net.c - networking for Steal-a-Brain-Rot.
 *
 * Emscripten path: EM_ASYNC_JS helpers do `await fetch(...)` against
 * same-origin relative URLs and hand the response body back as a C string
 * (allocated with stringToNewUTF8 / malloc, freed here).  Requires the link
 * flag -sASYNCIFY (see game/build.sh).
 *
 * Desktop path: popen("curl ...") against $SABR_BASE_URL (default
 * http://localhost:8080) so the native build can be tested against the real
 * Flask server.  If curl is unavailable the call simply fails.
 */
#include "net.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ------------------------------------------------------------------------ */
/* Tiny JSON extraction - just enough for {"ok":true,"token":"..."}.         */
/* ------------------------------------------------------------------------ */

/* Find `"key"` followed by optional whitespace and ':'; return pointer to the
 * first non-space char of the value, or NULL. */
static const char *json_find_value(const char *json, const char *key)
{
    if (!json || !key) return NULL;
    char pat[64];
    size_t klen = strlen(key);
    if (klen + 3 > sizeof(pat)) return NULL;
    pat[0] = '"';
    memcpy(pat + 1, key, klen);
    pat[klen + 1] = '"';
    pat[klen + 2] = '\0';

    const char *p = json;
    while ((p = strstr(p, pat)) != NULL) {
        const char *q = p + klen + 2;
        while (*q == ' ' || *q == '\t' || *q == '\n' || *q == '\r') q++;
        if (*q == ':') {
            q++;
            while (*q == ' ' || *q == '\t' || *q == '\n' || *q == '\r') q++;
            return q;
        }
        p = q;
    }
    return NULL;
}

bool JsonGetString(const char *json, const char *key, char *out, size_t cap)
{
    if (!out || cap == 0) return false;
    out[0] = '\0';
    const char *v = json_find_value(json, key);
    if (!v || *v != '"') return false;
    v++;
    size_t n = 0;
    while (*v && *v != '"') {
        char c = *v;
        if (c == '\\' && v[1]) {        /* handle the common escapes */
            v++;
            switch (*v) {
                case 'n': c = '\n'; break;
                case 't': c = '\t'; break;
                case '"': c = '"';  break;
                case '\\': c = '\\'; break;
                case '/': c = '/';  break;
                default:  c = *v;   break; /* \uXXXX etc: keep literal char */
            }
        }
        if (n + 1 < cap) out[n++] = c;
        v++;
    }
    out[n] = '\0';
    return *v == '"';
}

bool JsonGetBool(const char *json, const char *key, bool *out)
{
    const char *v = json_find_value(json, key);
    if (!v) return false;
    if (strncmp(v, "true", 4) == 0)  { if (out) *out = true;  return true; }
    if (strncmp(v, "false", 5) == 0) { if (out) *out = false; return true; }
    return false;
}

/* Escape a string for embedding in a JSON string literal. */
static void json_escape(const char *in, char *out, size_t cap)
{
    size_t n = 0;
    for (; *in && n + 2 < cap; in++) {
        unsigned char c = (unsigned char)*in;
        if (c == '"' || c == '\\') {
            if (n + 3 >= cap) break;
            out[n++] = '\\';
            out[n++] = (char)c;
        } else if (c < 0x20) {
            continue; /* drop control chars */
        } else {
            out[n++] = (char)c;
        }
    }
    out[n] = '\0';
}

/* ------------------------------------------------------------------------ */
/* Transport: POST JSON body to a same-origin path, return body (malloc'd).  */
/* ------------------------------------------------------------------------ */
#ifdef __EMSCRIPTEN__
#include <emscripten.h>

/* Returns a malloc'd UTF-8 string (caller frees) or 0 on network failure.
 * Non-2xx responses still return the body so C can read {"ok":false}. */
EM_ASYNC_JS(char *, sabr_js_post, (const char *path, const char *body), {
    try {
        const resp = await fetch(UTF8ToString(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: UTF8ToString(body),
            credentials: "same-origin"
        });
        const text = await resp.text();
        return stringToNewUTF8(text);
    } catch (e) {
        console.error("[sabr] fetch failed:", e);
        return 0;
    }
});

EM_JS(void, sabr_js_show_flag, (const char *flag), {
    try {
        const el = document.getElementById("flag-out");
        if (el) {
            el.textContent = UTF8ToString(flag);
            el.style.display = "block";
        }
    } catch (e) { /* ignore - running without the custom shell */ }
});

static char *http_post_json(const char *path, const char *body)
{
    return sabr_js_post(path, body);
}

void NetShowFlagInPage(const char *flag)
{
    sabr_js_show_flag(flag);
}

#else /* ---------------------------- desktop ------------------------------ */

static char *http_post_json(const char *path, const char *body)
{
    const char *base = getenv("SABR_BASE_URL");
    if (!base || !*base) base = "http://localhost:8080";

    /* Body only ever contains [A-Za-z0-9_.:-{}"] plus our own escapes, but
     * single quotes must not appear inside the shell single-quoted arg. */
    if (strchr(body, '\'')) return NULL;

    char cmd[4096];
    int n = snprintf(cmd, sizeof(cmd),
        "curl -s -X POST -H 'Content-Type: application/json' -d '%s' '%s%s' 2>/dev/null",
        body, base, path);
    if (n <= 0 || (size_t)n >= sizeof(cmd)) return NULL;

    FILE *fp = popen(cmd, "r");
    if (!fp) return NULL;

    size_t cap = 4096, len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) { pclose(fp); return NULL; }
    size_t r;
    while ((r = fread(buf + len, 1, cap - len - 1, fp)) > 0) {
        len += r;
        if (len + 1 >= cap) {
            cap *= 2;
            char *nb = (char *)realloc(buf, cap);
            if (!nb) { free(buf); pclose(fp); return NULL; }
            buf = nb;
        }
    }
    buf[len] = '\0';
    pclose(fp);
    if (len == 0) { free(buf); return NULL; }
    return buf;
}

void NetShowFlagInPage(const char *flag)
{
    (void)flag;
}

#endif /* __EMSCRIPTEN__ */

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

bool NetUnlock(const char *code, char *tokenOut, size_t tokenCap)
{
    if (!code || !tokenOut || tokenCap == 0) return false;
    tokenOut[0] = '\0';

    char esc[128];
    json_escape(code, esc, sizeof(esc));
    char body[192];
    snprintf(body, sizeof(body), "{\"code\":\"%s\"}", esc);

    char *resp = http_post_json("/arena/unlock", body);
    if (!resp) {
        printf("[net] /arena/unlock: no response\n");
        return false;
    }
    printf("[net] /arena/unlock -> %s\n", resp);

    bool ok = false;
    bool good = JsonGetBool(resp, "ok", &ok) && ok &&
                JsonGetString(resp, "token", tokenOut, tokenCap) &&
                tokenOut[0] != '\0';
    free(resp);
    return good;
}

bool NetComplete(const char *token, char *flagOut, size_t flagCap)
{
    if (!token || !flagOut || flagCap == 0) return false;
    flagOut[0] = '\0';

    char esc[2048];
    json_escape(token, esc, sizeof(esc));
    char body[2048 + 32];
    snprintf(body, sizeof(body), "{\"token\":\"%s\"}", esc);

    char *resp = http_post_json("/complete", body);
    if (!resp) {
        printf("[net] /complete: no response\n");
        return false;
    }
    printf("[net] /complete -> %s\n", resp);

    bool ok = false;
    bool good = JsonGetBool(resp, "ok", &ok) && ok &&
                JsonGetString(resp, "flag", flagOut, flagCap) &&
                flagOut[0] != '\0';
    free(resp);
    return good;
}
