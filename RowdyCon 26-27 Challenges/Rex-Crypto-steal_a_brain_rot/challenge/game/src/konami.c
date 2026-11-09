/*
 * konami.c - sequence capture + submit.
 *
 * Mapping (API_CONTRACT.md): Up=U Down=D Left=L Right=R B=B A=A.
 * The game does NOT hard-code the expected answer; whatever 10-step
 * sequence the player enters is sent to the backend, which decides.
 */
#include "konami.h"
#include "game.h"
#include "net.h"

#include <string.h>
#include <stdio.h>

static char  s_seq[KONAMI_LEN + 1];
static int   s_len;
static float s_msgTimer;
static const char *s_msg;
static Color s_msgColor;
static bool  s_submitting;   /* draw a "contacting Sahoor" frame first */
static bool  s_shake;
static float s_shakeT;

void KonamiInit(void)
{
    memset(s_seq, 0, sizeof(s_seq));
    s_len = 0;
    s_msg = NULL;
    s_msgTimer = 0;
    s_submitting = false;
    s_shake = false;
}

static void Push(char c)
{
    if (s_len >= KONAMI_LEN) return;
    s_seq[s_len++] = c;
    s_seq[s_len] = '\0';
}

static void Submit(void)
{
    char token[TOKEN_CAP];
    if (NetUnlock(s_seq, token, sizeof(token))) {
        strncpy(g.token, token, TOKEN_CAP - 1);
        g.token[TOKEN_CAP - 1] = '\0';
        g.hasToken = true;
        SetStatus("Sahoor accepts the ANCIENT CODE!");
        ChangeScene(SCENE_FIGHT);
    } else {
        s_msg = "Sahoor: \"That's NOT the ancient code. Cringe.\"";
        s_msgColor = C_BAD;
        s_msgTimer = 2.5f;
        s_shake = true;
        s_shakeT = 0.4f;
        s_len = 0;
        s_seq[0] = '\0';
    }
}

void KonamiUpdate(float dt)
{
    if (s_msgTimer > 0) s_msgTimer -= dt;
    if (s_shakeT > 0) { s_shakeT -= dt; if (s_shakeT <= 0) s_shake = false; }

    if (s_submitting) {
        /* The "Contacting Sahoor..." frame has been drawn; now block on fetch
         * (asyncify suspends the wasm here). */
        s_submitting = false;
        Submit();
        return;
    }

    if (IsKeyPressed(KEY_UP))    Push('U');
    if (IsKeyPressed(KEY_DOWN))  Push('D');
    if (IsKeyPressed(KEY_LEFT))  Push('L');
    if (IsKeyPressed(KEY_RIGHT)) Push('R');
    if (IsKeyPressed(KEY_B))     Push('B');
    if (IsKeyPressed(KEY_A))     Push('A');

    if (IsKeyPressed(KEY_BACKSPACE) && s_len > 0) {
        s_seq[--s_len] = '\0';
    }

    if (IsKeyPressed(KEY_ENTER) || IsKeyPressed(KEY_KP_ENTER)) {
        if (s_len == KONAMI_LEN) {
            s_submitting = true;
            s_msg = "Contacting Sahoor...";
            s_msgColor = C_HINT;
            s_msgTimer = 5.0f;
        } else {
            s_msg = "The ancient code is exactly 10 inputs long.";
            s_msgColor = C_ACCENT;
            s_msgTimer = 2.0f;
        }
    }

    if (IsKeyPressed(KEY_ESCAPE)) ChangeScene(SCENE_ARENA);
}

static const char *Glyph(char c)
{
    switch (c) {
        case 'U': return "^";
        case 'D': return "v";
        case 'L': return "<";
        case 'R': return ">";
        case 'B': return "B";
        case 'A': return "A";
        default:  return "?";
    }
}

void KonamiDraw(void)
{
    ClearBackground(C_BG);
    int ox = 0;
    if (s_shake) ox = GetRandomValue(-4, 4);

    DrawTextCentered("ENTER THE ANCIENT CODE", SCREEN_W / 2 + ox, 40, 28, C_ACCENT);
    DrawTextCentered("Arrow keys, B, A.  Backspace to undo.  ENTER to submit.", SCREEN_W / 2, 80, 16, C_HINT);

    /* 10 slots */
    const int slot = 48, gap = 8;
    int totalW = KONAMI_LEN * slot + (KONAMI_LEN - 1) * gap;
    int x0 = (SCREEN_W - totalW) / 2 + ox;
    int y0 = 170;
    for (int i = 0; i < KONAMI_LEN; i++) {
        Rectangle r = { (float)(x0 + i * (slot + gap)), (float)y0, (float)slot, (float)slot };
        bool filled = i < s_len;
        DrawFrame(r, filled ? (Color){ 30, 30, 50, 255 } : C_BOX,
                  (i == s_len && ((int)(GetTime() * 3) % 2 == 0)) ? C_ACCENT : C_BORDER);
        if (filled) {
            const char *gl = Glyph(s_seq[i]);
            DrawTextCentered(gl, (int)(r.x + slot / 2), y0 + 10, 28, RAYWHITE);
        }
    }

    /* literal string preview, same characters we POST */
    char buf[64];
    snprintf(buf, sizeof(buf), "code = \"%s\"", s_seq);
    DrawTextCentered(buf, SCREEN_W / 2, 240, 18, C_HINT);

    DrawSahoor(SCREEN_W / 2.0f, 330.0f, 1.2f, s_shake);

    if (s_msgTimer > 0 && s_msg)
        DrawTextCentered(s_msg, SCREEN_W / 2, 400, 18, s_msgColor);

    DrawText("Esc: back to arena info", 20, 452, 14, C_HINT);
    DrawText("POST /arena/unlock", SCREEN_W - 190, 452, 14, C_HINT);
}
