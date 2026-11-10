/*
 * net.h - the ONLY two backend calls the game makes (see API_CONTRACT.md).
 *
 * Both calls are synchronous from C's point of view.  Under Emscripten they
 * are implemented with EM_ASYNC_JS + fetch() and rely on -sASYNCIFY so the
 * wasm stack is suspended while the browser awaits the response.  On desktop
 * they shell out to curl (for local testing against the Flask server).
 */
#ifndef SABR_NET_H
#define SABR_NET_H

#include <stdbool.h>
#include <stddef.h>

/* POST /arena/unlock  {"code":"<code>"}  ->  {"ok":true,"token":"..."}
 * Returns true and fills tokenOut on success. */
bool NetUnlock(const char *code, char *tokenOut, size_t tokenCap);

/* POST /complete  {"token":"<token>"}  ->  {"ok":true,"flag":"RCC{...}"}
 * Returns true and fills flagOut on success. */
bool NetComplete(const char *token, char *flagOut, size_t flagCap);

/* Mirror the flag into the HTML page (#flag-out in shell.html) so the player
 * can select/copy it.  No-op on desktop. */
void NetShowFlagInPage(const char *flag);

/* Minimal JSON helpers (exposed for unit sanity checks). */
bool JsonGetString(const char *json, const char *key, char *out, size_t cap);
bool JsonGetBool(const char *json, const char *key, bool *out);

#endif /* SABR_NET_H */
