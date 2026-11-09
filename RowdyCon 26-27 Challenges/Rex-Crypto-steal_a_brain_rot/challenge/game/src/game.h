/*
 * game.h - shared state and helpers for Steal-a-Brain-Rot.
 *
 * Every scene module exposes XxxInit / XxxUpdate(dt) / XxxDraw and the
 * scene manager in main.c dispatches to the active one.  Cross-scene data
 * (the unlock token, the flag, status messages) lives in the global `g`.
 */
#ifndef SABR_GAME_H
#define SABR_GAME_H

#include <stdbool.h>
#include <stddef.h>
#include "raylib.h"

#define SCREEN_W 640
#define SCREEN_H 480

#define TOKEN_CAP 1024
#define FLAG_CAP  256
#define STATUS_CAP 256

typedef enum {
    SCENE_OVERWORLD = 0,
    SCENE_DIALOGUE,
    SCENE_ARENA,
    SCENE_KONAMI,
    SCENE_FIGHT,
    SCENE_VICTORY,
    SCENE_GAMEOVER
} Scene;

typedef struct {
    Scene scene;
    Scene nextScene;        /* set by ChangeScene; applied at end of frame */
    bool  sceneChanged;

    bool  hasToken;
    char  token[TOKEN_CAP]; /* from POST /arena/unlock */

    bool  hasFlag;
    char  flag[FLAG_CAP];   /* from POST /complete */

    char  status[STATUS_CAP]; /* last network / error message for the HUD */
    float statusTimer;        /* seconds left to show status */

    int   fightsWon;
    int   deaths;
} GameState;

extern GameState g;

/* Scene manager (main.c) */
void ChangeScene(Scene s);
void SetStatus(const char *msg);

/* Shared input helpers (main.c) - Z/Enter confirm, X/Escape cancel */
bool ConfirmPressed(void);
bool CancelPressed(void);

/* Shared drawing helpers (main.c) */
void DrawTextCentered(const char *text, int cx, int y, int size, Color c);
void DrawTextWrapped(const char *text, Rectangle box, int size, Color c, int maxChars);
void DrawHeart(float x, float y, float size, Color c);
void DrawSahoor(float x, float y, float scale, bool angry);
void DrawFrame(Rectangle r, Color fill, Color border);

/* Palette */
#define C_BG        (Color){ 10, 10, 14, 255 }
#define C_BOX       (Color){ 0, 0, 0, 255 }
#define C_BORDER    RAYWHITE
#define C_SOUL      (Color){ 255, 0, 0, 255 }
#define C_SAHOOR    (Color){ 139, 90, 43, 255 }
#define C_SAHOOR_DK (Color){ 92, 58, 24, 255 }
#define C_ACCENT    (Color){ 255, 220, 0, 255 }
#define C_HINT      (Color){ 140, 140, 160, 255 }
#define C_PORTAL    (Color){ 120, 60, 255, 255 }
#define C_GOOD      (Color){ 60, 220, 90, 255 }
#define C_BAD       (Color){ 230, 50, 50, 255 }

#endif /* SABR_GAME_H */
