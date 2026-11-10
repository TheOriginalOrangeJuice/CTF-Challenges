/*
 * main.c - Steal-a-Brain-Rot: raylib init, scene manager, main loop.
 *
 * Under Emscripten the loop is driven by emscripten_set_main_loop (a blocking
 * while(!WindowShouldClose()) loop would hang the browser tab).  On desktop
 * we fall back to the classic loop for local testing.
 */
#include "game.h"
#include "overworld.h"
#include "dialogue.h"
#include "konami.h"
#include "fight.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

GameState g;

/* ---------------------------------------------------------------------- */
/* Scene manager                                                          */
/* ---------------------------------------------------------------------- */
typedef struct {
    void (*init)(void);
    void (*update)(float dt);
    void (*draw)(void);
} SceneVTable;

static const SceneVTable SCENES[] = {
    [SCENE_OVERWORLD] = { OverworldInit, OverworldUpdate, OverworldDraw },
    [SCENE_DIALOGUE]  = { DialogueInit,  DialogueUpdate,  DialogueDraw  },
    [SCENE_ARENA]     = { ArenaInit,     ArenaUpdate,     ArenaDraw     },
    [SCENE_KONAMI]    = { KonamiInit,    KonamiUpdate,    KonamiDraw    },
    [SCENE_FIGHT]     = { FightInit,     FightUpdate,     FightDraw     },
    [SCENE_VICTORY]   = { VictoryInit,   VictoryUpdate,   VictoryDraw   },
    [SCENE_GAMEOVER]  = { GameOverInit,  GameOverUpdate,  GameOverDraw  },
};

void ChangeScene(Scene s)
{
    g.nextScene = s;
    g.sceneChanged = true;
}

void SetStatus(const char *msg)
{
    strncpy(g.status, msg, STATUS_CAP - 1);
    g.status[STATUS_CAP - 1] = '\0';
    g.statusTimer = 3.0f;
    printf("[status] %s\n", msg);
}

/* ---------------------------------------------------------------------- */
/* Input helpers                                                          */
/* ---------------------------------------------------------------------- */
bool ConfirmPressed(void)
{
    return IsKeyPressed(KEY_Z) || IsKeyPressed(KEY_ENTER) || IsKeyPressed(KEY_KP_ENTER);
}

bool CancelPressed(void)
{
    return IsKeyPressed(KEY_X) || IsKeyPressed(KEY_ESCAPE);
}

/* ---------------------------------------------------------------------- */
/* Drawing helpers                                                        */
/* ---------------------------------------------------------------------- */
void DrawTextCentered(const char *text, int cx, int y, int size, Color c)
{
    int w = MeasureText(text, size);
    DrawText(text, cx - w / 2, y, size, c);
}

/* Word-wrapping text draw; only the first `maxChars` characters are drawn
 * (used by the typewriter).  Default raylib font is used. */
void DrawTextWrapped(const char *text, Rectangle box, int size, Color c, int maxChars)
{
    int spaceW = MeasureText(" ", size);
    int lineH = size + 4;
    float x = box.x, y = box.y;
    int drawn = 0;
    const char *p = text;
    char word[128];

    while (*p && drawn < maxChars) {
        /* explicit newline */
        if (*p == '\n') { p++; x = box.x; y += lineH; drawn++; continue; }

        /* extract one word */
        int n = 0;
        while (*p && *p != ' ' && *p != '\n' && n < (int)sizeof(word) - 1) word[n++] = *p++;
        word[n] = '\0';
        if (*p == ' ') p++;

        int ww = MeasureText(word, size);
        if (x > box.x && x + ww > box.x + box.width) { x = box.x; y += lineH; }
        if (y + lineH > box.y + box.height + lineH) break; /* overflow guard */

        int remaining = maxChars - drawn;
        if (remaining < n) {
            word[remaining] = '\0';
            n = remaining;
        }
        DrawText(word, (int)x, (int)y, size, c);
        drawn += n + 1; /* +1 for the space */
        x += ww + spaceW;
    }
}

void DrawHeart(float x, float y, float size, Color c)
{
    float r = size * 0.27f;
    DrawCircle((int)(x - size * 0.22f), (int)(y - size * 0.12f), r, c);
    DrawCircle((int)(x + size * 0.22f), (int)(y - size * 0.12f), r, c);
    float w = size * 0.6f;
    /* rotated square makes the bottom point (avoids triangle winding issues) */
    DrawRectanglePro((Rectangle){ x, y + size * 0.02f, w, w }, (Vector2){ w / 2, w / 2 }, 45.0f, c);
}

/* Tung Tung Tung Sahoor is drawn from a bitmap sprite (game/assets/sahoor.png),
 * loaded once into s_sahoorTex. The PNG ships with a white background, which we
 * key out to transparent and auto-crop at load time. */
static Texture2D s_sahoorTex;
static bool      s_sahoorLoaded = false;

void LoadSahoorAssets(void)
{
    Image img = LoadImage("assets/sahoor.png");
    if (img.data == NULL || img.width == 0) { s_sahoorLoaded = false; return; }
    ImageFormat(&img, PIXELFORMAT_UNCOMPRESSED_R8G8B8A8);
    Color *px = (Color *)img.data;
    int W = img.width, H = img.height;

    /* key out the near-white background */
    for (int i = 0; i < W * H; i++)
        if (px[i].r > 232 && px[i].g > 232 && px[i].b > 232) px[i].a = 0;

    /* crop to the opaque bounding box so scaling by height is predictable */
    int minX = W, minY = H, maxX = -1, maxY = -1;
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++)
            if (px[y * W + x].a > 16) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
    if (maxX >= minX && maxY >= minY)
        ImageCrop(&img, (Rectangle){ (float)minX, (float)minY,
                                     (float)(maxX - minX + 1), (float)(maxY - minY + 1) });

    s_sahoorTex = LoadTextureFromImage(img);
    UnloadImage(img);
    if (s_sahoorTex.id != 0) {
        SetTextureFilter(s_sahoorTex, TEXTURE_FILTER_BILINEAR);
        s_sahoorLoaded = true;
    }
}

/* Draw Sahoor centered at (x,y). `scale` ~1.0 is the overworld size; the sprite
 * is sized by a fixed base height so callers behave as before. `angry` adds a
 * red battle tint + aura and a slightly faster idle bob. */
void DrawSahoor(float x, float y, float scale, bool angry)
{
    const float baseH = 126.0f * scale;
    float bob = sinf(GetTime() * (angry ? 4.0f : 2.0f)) * 2.0f * scale;

    if (!s_sahoorLoaded) {                   /* fallback if the asset is missing */
        DrawRectangle((int)(x - 22 * scale), (int)(y - baseH / 2),
                      (int)(44 * scale), (int)baseH, C_SAHOOR);
        return;
    }

    float aspect = (float)s_sahoorTex.width / (float)s_sahoorTex.height;
    float h = baseH, w = baseH * aspect;

    /* ground shadow */
    DrawEllipse((int)x, (int)(y + h / 2 + 4 * scale), w * 0.42f, 6 * scale, (Color){ 0, 0, 0, 110 });
    /* angry aura behind the sprite */
    if (angry) {
        DrawCircle((int)x, (int)y, h * 0.42f, (Color){ 255, 60, 40, 28 });
        for (int i = 0; i < 4; i++) {
            float t = GetTime() * 3.0f + i * 1.7f;
            float ax = x + sinf(t) * (w * 0.7f);
            float ay = (y - h * 0.3f) + fmodf(t * 14 * scale, h * 0.6f);
            DrawCircle((int)ax, (int)ay, 2.0f * scale, C_ACCENT);
        }
    }

    Rectangle src = { 0, 0, (float)s_sahoorTex.width, (float)s_sahoorTex.height };
    Rectangle dst = { x - w / 2, y - h / 2 + bob, w, h };
    Color tint = angry ? (Color){ 255, 150, 130, 255 } : WHITE;
    DrawTexturePro(s_sahoorTex, src, dst, (Vector2){ 0, 0 }, 0.0f, tint);
}

void DrawFrame(Rectangle r, Color fill, Color border)
{
    DrawRectangleRec(r, fill);
    DrawRectangleLinesEx(r, 3, border);
}

/* ---------------------------------------------------------------------- */
/* Frame                                                                  */
/* ---------------------------------------------------------------------- */
static void ApplySceneChange(void)
{
    if (!g.sceneChanged) return;
    g.sceneChanged = false;
    g.scene = g.nextScene;
    SCENES[g.scene].init();
}

static void Frame(void)
{
    float dt = GetFrameTime();
    if (dt > 0.05f) dt = 0.05f;       /* clamp after tab switches / fetch stalls */

    /* Update BEFORE draw -- required for key presses on the web. EndDrawing()
     * runs raylib's PollInputEvents(), but emscripten delivers key events via
     * async DOM callbacks, so the "just pressed" edge is only visible to
     * IsKeyPressed() when update() reads input AFTER that poll and before the
     * next one. Drawing first (poll immediately before update) folded the edge
     * into the previous-state copy, so Z/Enter never registered on the web --
     * movement (IsKeyDown) still worked, which is why you could walk but never
     * talk or travel. The network scenes defer their blocking fetch by one
     * frame (s_submitting / PH_WIN_FETCH), so the "contacting server" frame is
     * the last one drawn before asyncify suspends -- still visible. */
    SCENES[g.scene].update(dt);
    ApplySceneChange();

    BeginDrawing();
    SCENES[g.scene].draw();
    if (g.statusTimer > 0) {
        g.statusTimer -= dt;
        int w = MeasureText(g.status, 14) + 16;
        DrawRectangle(SCREEN_W - w - 8, 8, w, 22, (Color){ 0, 0, 0, 200 });
        DrawText(g.status, SCREEN_W - w, 12, 14, C_ACCENT);
    }
    EndDrawing();
}

int main(void)
{
    SetTraceLogLevel(LOG_WARNING);
    InitWindow(SCREEN_W, SCREEN_H, "Steal-a-Brain-Rot");
    SetExitKey(0); /* Escape is used in-game */
    LoadSahoorAssets();

    memset(&g, 0, sizeof(g));
    g.scene = SCENE_OVERWORLD;
    SCENES[g.scene].init();

#ifdef __EMSCRIPTEN__
    /* fps=0 -> requestAnimationFrame; simulate_infinite_loop=1 so main()
     * never returns and the stack stays alive for asyncify. */
    emscripten_set_main_loop(Frame, 0, 1);
#else
    SetTargetFPS(60);
    while (!WindowShouldClose()) {
        Frame();
    }
    CloseWindow();
#endif
    return 0;
}
