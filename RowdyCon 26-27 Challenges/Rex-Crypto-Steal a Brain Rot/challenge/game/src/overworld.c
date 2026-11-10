/*
 * overworld.c - room exploration, ARENA info screen, victory & game-over.
 */
#include "overworld.h"
#include "game.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/* ---------------------------------------------------------------------- */
/* Overworld                                                              */
/* ---------------------------------------------------------------------- */

#define ROOM_X 60
#define ROOM_Y 80
#define ROOM_W (SCREEN_W - 120)
#define ROOM_H 300

static Vector2 s_player = { SCREEN_W / 2.0f, ROOM_Y + ROOM_H - 60 };
static const Vector2 SAHOOR_POS = { ROOM_X + 90, ROOM_Y + 150 };
static const Vector2 PORTAL_POS = { ROOM_X + ROOM_W - 90, ROOM_Y + 150 };
static float s_portalSpin = 0;

static int s_near; /* 0 none, 1 sahoor, 2 portal */

void OverworldInit(void)
{
    /* keep player where they were between visits */
    s_near = 0;
}

static float Dist2(Vector2 a, Vector2 b)
{
    float dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
}

void OverworldUpdate(float dt)
{
    const float speed = 160.0f;
    Vector2 d = { 0, 0 };
    if (IsKeyDown(KEY_LEFT))  d.x -= 1;
    if (IsKeyDown(KEY_RIGHT)) d.x += 1;
    if (IsKeyDown(KEY_UP))    d.y -= 1;
    if (IsKeyDown(KEY_DOWN))  d.y += 1;
    if (d.x != 0 && d.y != 0) { d.x *= 0.7071f; d.y *= 0.7071f; }
    s_player.x += d.x * speed * dt;
    s_player.y += d.y * speed * dt;

    /* clamp to room */
    if (s_player.x < ROOM_X + 10) s_player.x = ROOM_X + 10;
    if (s_player.x > ROOM_X + ROOM_W - 10) s_player.x = ROOM_X + ROOM_W - 10;
    if (s_player.y < ROOM_Y + 10) s_player.y = ROOM_Y + 10;
    if (s_player.y > ROOM_Y + ROOM_H - 10) s_player.y = ROOM_Y + ROOM_H - 10;

    s_portalSpin += dt * 2.0f;

    /* Generous radii: the sprites are large, so you should be able to trigger
     * an interaction by standing anywhere near them, not dead-center on them. */
    s_near = 0;
    if (Dist2(s_player, SAHOOR_POS) < 105 * 105) s_near = 1;
    else if (Dist2(s_player, PORTAL_POS) < 95 * 95) s_near = 2;

    if (ConfirmPressed()) {
        if (s_near == 1) ChangeScene(SCENE_DIALOGUE);
        else if (s_near == 2) ChangeScene(g.hasToken ? SCENE_FIGHT : SCENE_ARENA);
    }
}

void OverworldDraw(void)
{
    ClearBackground(C_BG);

    /* room floor + walls */
    DrawRectangle(ROOM_X, ROOM_Y, ROOM_W, ROOM_H, (Color){ 28, 24, 40, 255 });
    for (int x = ROOM_X; x < ROOM_X + ROOM_W; x += 40)
        DrawLine(x, ROOM_Y, x, ROOM_Y + ROOM_H, (Color){ 40, 34, 60, 255 });
    for (int y = ROOM_Y; y < ROOM_Y + ROOM_H; y += 40)
        DrawLine(ROOM_X, y, ROOM_X + ROOM_W, y, (Color){ 40, 34, 60, 255 });
    DrawRectangleLines(ROOM_X, ROOM_Y, ROOM_W, ROOM_H, C_BORDER);

    DrawTextCentered("* THE BRAINROT CHAMBER *", SCREEN_W / 2, 30, 24, C_ACCENT);

    /* Sahoor */
    DrawSahoor(SAHOOR_POS.x, SAHOOR_POS.y, 1.0f, false);
    DrawTextCentered("SAHOOR", (int)SAHOOR_POS.x, (int)SAHOOR_POS.y + 74, 14, C_HINT);

    /* Portal */
    for (int i = 0; i < 3; i++) {
        float r = 34 - i * 9;
        float a = s_portalSpin + i * 1.2f;
        DrawCircleLines((int)PORTAL_POS.x, (int)PORTAL_POS.y, r, C_PORTAL);
        DrawCircle((int)(PORTAL_POS.x + r * 0.8f * cosf(a)),
                   (int)(PORTAL_POS.y + r * 0.8f * sinf(a)), 3, C_PORTAL);
    }
    DrawTextCentered("ARENA", (int)PORTAL_POS.x, (int)PORTAL_POS.y + 60, 14, C_HINT);

    /* Player soul */
    DrawHeart(s_player.x, s_player.y, 16, C_SOUL);

    /* Prompt */
    if (s_near == 1) DrawTextCentered("[Z] Talk to Sahoor", SCREEN_W / 2, ROOM_Y + ROOM_H + 14, 18, RAYWHITE);
    else if (s_near == 2) DrawTextCentered(g.hasToken ? "[Z] Enter the arena (FIGHT!)" : "[Z] Inspect the ARENA portal",
                                           SCREEN_W / 2, ROOM_Y + ROOM_H + 14, 18, RAYWHITE);
    else DrawTextCentered("Arrow keys to move. Z/Enter to interact.", SCREEN_W / 2, ROOM_Y + ROOM_H + 14, 16, C_HINT);

    if (g.hasToken) DrawText("ANCIENT CODE: ACQUIRED", 60, 452, 14, C_GOOD);
    else            DrawText("ANCIENT CODE: ???", 60, 452, 14, C_HINT);
}

/* ---------------------------------------------------------------------- */
/* ARENA info screen                                                      */
/* ---------------------------------------------------------------------- */

void ArenaInit(void) {}

void ArenaUpdate(float dt)
{
    (void)dt;
    if (ConfirmPressed()) ChangeScene(SCENE_KONAMI);
    if (CancelPressed())  ChangeScene(SCENE_OVERWORLD);
}

void ArenaDraw(void)
{
    ClearBackground(C_BG);
    DrawTextCentered("THE ARENA", SCREEN_W / 2, 24, 30, C_PORTAL);

    Rectangle box = { 30, 70, SCREEN_W - 60, 330 };
    DrawFrame(box, C_BOX, C_BORDER);

    int y = 84;
    int x = 46;
    DrawText("Sahoor only fights those who know the ANCIENT CODE.", x, y, 16, RAYWHITE); y += 26;
    DrawText("The code is locked inside a crypto ORACLE on this server:", x, y, 16, RAYWHITE); y += 32;

    DrawText("GET /arena/oracle?data=<base64>", x + 10, y, 20, C_ACCENT); y += 30;

    DrawText("- data: URL-safe base64 of bytes YOU choose (may be empty).", x, y, 14, C_HINT); y += 20;
    DrawText("- Server returns AES-ECB( pad( your_bytes + SECRET ) ) as hex.", x, y, 14, C_HINT); y += 20;
    DrawText("- SECRET ends with the ancient code. ECB is... very deterministic.", x, y, 14, C_HINT); y += 20;
    DrawText("- Use your own tools (curl / python) outside this game.", x, y, 14, C_HINT); y += 32;

    DrawText("When you have recovered the code, enter it here with the arrows", x, y, 14, RAYWHITE); y += 20;
    DrawText("and the A / B keys, then press ENTER to present it to Sahoor.", x, y, 14, RAYWHITE); y += 32;

    DrawText("Mapping:  Up=U  Down=D  Left=L  Right=R  B=B  A=A", x, y, 16, C_GOOD);

    DrawTextCentered("[Z] I have the code   [X] Back", SCREEN_W / 2, 420, 18, RAYWHITE);
}

/* ---------------------------------------------------------------------- */
/* Victory                                                                */
/* ---------------------------------------------------------------------- */

static float s_victT;

void VictoryInit(void) { s_victT = 0; }

void VictoryUpdate(float dt)
{
    s_victT += dt;
    if (ConfirmPressed() && s_victT > 1.0f) ChangeScene(SCENE_OVERWORLD);
}

void VictoryDraw(void)
{
    ClearBackground(C_BG);
    DrawTextCentered("* YOU WON! *", SCREEN_W / 2, 40, 40, C_ACCENT);
    DrawTextCentered("Sahoor's aura has been STOLEN.", SCREEN_W / 2, 90, 20, RAYWHITE);

    DrawSahoor(SCREEN_W / 2.0f, 180.0f, 1.5f, false);
    DrawText("x_x", SCREEN_W / 2 - 14, 150, 16, RAYWHITE);

    Rectangle box = { 30, 260, SCREEN_W - 60, 110 };
    DrawFrame(box, C_BOX, C_GOOD);
    if (g.hasFlag) {
        DrawText("FLAG:", 46, 274, 18, C_GOOD);
        int size = 20;
        while (size > 10 && MeasureText(g.flag, size) > SCREEN_W - 100) size -= 2;
        DrawText(g.flag, 46, 300, size, RAYWHITE);
        DrawText("(also printed below the canvas and in the browser console)", 46, 340, 12, C_HINT);
    } else {
        DrawText("The server did not hand over a flag.", 46, 280, 18, C_BAD);
        DrawTextWrapped(g.status, (Rectangle){ 46, 306, SCREEN_W - 92, 60 }, 14, C_HINT, 100000);
    }

    DrawTextCentered("[Z] Back to the chamber", SCREEN_W / 2, 420, 16, C_HINT);
}

/* ---------------------------------------------------------------------- */
/* Game over                                                              */
/* ---------------------------------------------------------------------- */

static float s_goT;
static const char *s_goLine;

void GameOverInit(void)
{
    static const char *lines[] = {
        "You got fanum taxed.",
        "Skill issue detected.",
        "Stay determined... or whatever.",
        "L + ratio + no dodge.",
    };
    s_goT = 0;
    s_goLine = lines[GetRandomValue(0, 3)];
}

void GameOverUpdate(float dt)
{
    s_goT += dt;
    if (s_goT < 0.8f) return;
    if (ConfirmPressed()) ChangeScene(SCENE_FIGHT);
    if (CancelPressed())  ChangeScene(SCENE_OVERWORLD);
}

void GameOverDraw(void)
{
    ClearBackground(BLACK);
    float t = s_goT < 1.0f ? s_goT : 1.0f;
    Color c = { 255, 255, 255, (unsigned char)(255 * t) };
    DrawTextCentered("GAME OVER", SCREEN_W / 2, 140, 48, c);
    DrawTextCentered(s_goLine, SCREEN_W / 2, 210, 20, (Color){ 200, 200, 200, (unsigned char)(255 * t) });
    /* broken heart */
    DrawHeart(SCREEN_W / 2.0f - 6, 300, 24, C_SOUL);
    DrawLine(SCREEN_W / 2 - 6, 286, SCREEN_W / 2 - 6, 318, BLACK);
    if (s_goT > 0.8f)
        DrawTextCentered("[Z] Retry    [X] Flee to chamber", SCREEN_W / 2, 400, 18, C_HINT);
}
