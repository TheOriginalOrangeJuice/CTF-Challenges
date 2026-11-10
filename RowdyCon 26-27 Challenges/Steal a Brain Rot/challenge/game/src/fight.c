/*
 * fight.c - the battle.
 *
 * Turn loop:
 *   MENU    -> player picks FIGHT (only option, it's a boss fight)
 *   ATTACK  -> timing bar minigame; damage scales with accuracy
 *   TAUNT   -> Sahoor says a brainrot line in the textbox
 *   DODGE   -> bullet board shrinks to a box; soul dodges a pattern
 *   (repeat) until Sahoor HP <= 0 -> POST /complete -> VICTORY
 *   player HP <= 0 -> GAMEOVER
 */
#include "fight.h"
#include "game.h"
#include "dialogue.h"
#include "quotes.h"
#include "net.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/* ---------------------------------------------------------------------- */
/* Tunables                                                               */
/* ---------------------------------------------------------------------- */
#define BOSS_MAX_HP     100
#define PLAYER_MAX_HP   30
#define HIT_DAMAGE      4
#define IFRAMES         0.9f
#define SOUL_RADIUS     6.0f
#define SOUL_SPEED      150.0f
#define MAX_BULLETS     160
#define NUM_PATTERNS    5

typedef enum {
    PH_INTRO = 0,
    PH_MENU,
    PH_FLAVOR,      /* ACT / ITEM / MERCY text, then back to the menu */
    PH_ATTACK,
    PH_ATTACK_RESULT,
    PH_TAUNT,
    PH_DODGE,
    PH_WIN_FETCH,   /* one frame to draw "stealing flag..." then call /complete */
    PH_DEAD
} Phase;

/* Bottom-row battle menu, Undertale-style. */
typedef enum { M_FIGHT = 0, M_ACT, M_ITEM, M_MERCY, M_COUNT } MenuItem;
static const char *MENU_LABELS[M_COUNT] = { "FIGHT", "ACT", "ITEM", "MERCY" };

typedef enum { B_CIRCLE = 0, B_RECT, B_HOMING } BulletKind;

typedef struct {
    bool active;
    BulletKind kind;
    Vector2 pos, vel;
    float r;          /* circle radius */
    float w, h;       /* rect size */
    Color color;
    float life;
} Bullet;

/* ---------------------------------------------------------------------- */
/* State                                                                  */
/* ---------------------------------------------------------------------- */
static Phase   s_phase;
static float   s_phaseT;
static int     s_bossHP, s_playerHP;
static int     s_wave;
static float   s_iframes;
static Textbox s_tb;

static Rectangle s_board;        /* current bullet board */
static Rectangle s_boardTarget;  /* interpolation target */
static Vector2   s_soul;

static Bullet s_bullets[MAX_BULLETS];
static float  s_spawnT;
static int    s_pattern;
static float  s_dodgeLen;

static float s_attackPos;       /* 0..1 position of the timing bar */
static int   s_lastDamage;
static float s_bossShake;

static int   s_menuSel;         /* highlighted bottom-row button */
static int   s_items;           /* heal items remaining */
static char  s_flavor[256];     /* backing store for ACT/ITEM/MERCY text */

static const Rectangle BOARD_WIDE = { 40, 250, SCREEN_W - 80, 150 };
static const Rectangle BOARD_BOX  = { SCREEN_W / 2.0f - 90, 240, 180, 170 };

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */
static void SetPhase(Phase p)
{
    s_phase = p;
    s_phaseT = 0;
}

static void ClearBullets(void)
{
    memset(s_bullets, 0, sizeof(s_bullets));
}

static Bullet *NewBullet(void)
{
    for (int i = 0; i < MAX_BULLETS; i++)
        if (!s_bullets[i].active) {
            memset(&s_bullets[i], 0, sizeof(Bullet));
            s_bullets[i].active = true;
            s_bullets[i].color = RAYWHITE;
            return &s_bullets[i];
        }
    return NULL;
}

static float Lerp(float a, float b, float t) { return a + (b - a) * t; }

static void LerpBoard(float dt)
{
    float t = 1.0f - powf(0.001f, dt); /* smooth approach */
    s_board.x      = Lerp(s_board.x,      s_boardTarget.x,      t);
    s_board.y      = Lerp(s_board.y,      s_boardTarget.y,      t);
    s_board.width  = Lerp(s_board.width,  s_boardTarget.width,  t);
    s_board.height = Lerp(s_board.height, s_boardTarget.height, t);
}

static void StartTaunt(void)
{
    const char *line = RandomQuote();
    if (s_bossHP < BOSS_MAX_HP / 3 && GetRandomValue(0, 1)) line = "Okay okay you're kinda him. STILL. TUNG!";
    TextboxStartOne(&s_tb, line);
    SetPhase(PH_TAUNT);
}

/* ---------------------------------------------------------------------- */
/* Patterns                                                               */
/* ---------------------------------------------------------------------- */
static void StartDodge(void)
{
    ClearBullets();
    s_pattern   = s_wave % NUM_PATTERNS;
    s_dodgeLen  = 6.0f + 0.6f * s_wave;
    if (s_dodgeLen > 11.0f) s_dodgeLen = 11.0f;
    s_spawnT    = 0;
    s_board = s_boardTarget = BOARD_BOX;  /* snap: spawns use board geometry immediately */
    s_soul.x = s_boardTarget.x + s_boardTarget.width / 2;
    s_soul.y = s_boardTarget.y + s_boardTarget.height / 2;
    SetPhase(PH_DODGE);
}

static float Difficulty(void) { return 1.0f + 0.12f * (float)s_wave; }

/* 0: drum rain - circles fall from the top */
static void PatternRain(float dt)
{
    s_spawnT -= dt;
    if (s_spawnT <= 0) {
        s_spawnT = 0.28f / Difficulty();
        Bullet *b = NewBullet();
        if (b) {
            b->kind = B_CIRCLE;
            b->r = 5;
            b->pos = (Vector2){ s_board.x + (float)GetRandomValue(8, (int)s_board.width - 8), s_board.y - 10 };
            b->vel = (Vector2){ 0, 110 * Difficulty() };
        }
    }
}

/* 1: bat sweeps - long rects from alternating sides with a gap */
static void PatternBats(float dt)
{
    s_spawnT -= dt;
    if (s_spawnT <= 0) {
        s_spawnT = 1.1f / Difficulty();
        bool fromLeft = GetRandomValue(0, 1);
        float gapY = s_board.y + (float)GetRandomValue(20, (int)s_board.height - 20);
        float gapH = 44;
        /* two bars: above and below the gap */
        for (int i = 0; i < 2; i++) {
            Bullet *b = NewBullet();
            if (!b) continue;
            b->kind = B_RECT;
            b->w = 14;
            b->color = C_SAHOOR;
            if (i == 0) { b->pos.y = s_board.y;        b->h = gapY - gapH / 2 - s_board.y; }
            else        { b->pos.y = gapY + gapH / 2;  b->h = s_board.y + s_board.height - b->pos.y; }
            if (b->h < 1) b->h = 1;
            b->pos.x = fromLeft ? s_board.x - 20 : s_board.x + s_board.width + 6;
            b->vel.x = (fromLeft ? 1 : -1) * 150 * Difficulty();
        }
    }
}

/* 2: ring bursts from the top centre */
static void PatternRings(float dt)
{
    s_spawnT -= dt;
    if (s_spawnT <= 0) {
        s_spawnT = 1.3f / Difficulty();
        int n = 10 + s_wave;
        if (n > 18) n = 18;
        float base = (float)GetRandomValue(0, 628) / 100.0f;
        Vector2 c = { s_board.x + s_board.width / 2, s_board.y + 6 };
        for (int i = 0; i < n; i++) {
            Bullet *b = NewBullet();
            if (!b) break;
            float a = base + (float)i * (6.2832f / (float)n);
            b->kind = B_CIRCLE;
            b->r = 4;
            b->pos = c;
            b->vel = (Vector2){ cosf(a) * 85 * Difficulty(), sinf(a) * 85 * Difficulty() };
            b->color = C_PORTAL;
        }
    }
}

/* 3: homing "tung" drums - slow bullets that steer toward the soul */
static void PatternHoming(float dt)
{
    s_spawnT -= dt;
    if (s_spawnT <= 0) {
        s_spawnT = 0.9f / Difficulty();
        Bullet *b = NewBullet();
        if (b) {
            b->kind = B_HOMING;
            b->r = 7;
            int side = GetRandomValue(0, 3);
            switch (side) {
                case 0: b->pos = (Vector2){ s_board.x - 10, s_board.y + (float)GetRandomValue(0, (int)s_board.height) }; break;
                case 1: b->pos = (Vector2){ s_board.x + s_board.width + 10, s_board.y + (float)GetRandomValue(0, (int)s_board.height) }; break;
                case 2: b->pos = (Vector2){ s_board.x + (float)GetRandomValue(0, (int)s_board.width), s_board.y - 10 }; break;
                default: b->pos = (Vector2){ s_board.x + (float)GetRandomValue(0, (int)s_board.width), s_board.y + s_board.height + 10 }; break;
            }
            b->vel = (Vector2){ 0, 0 };
            b->life = 4.0f;
            b->color = C_ACCENT;
        }
    }
}

/* 4: diagonal crossfire - streams from the two top corners */
static void PatternCross(float dt)
{
    s_spawnT -= dt;
    if (s_spawnT <= 0) {
        s_spawnT = 0.22f / Difficulty();
        for (int side = 0; side < 2; side++) {
            Bullet *b = NewBullet();
            if (!b) break;
            b->kind = B_CIRCLE;
            b->r = 4;
            b->pos = (Vector2){ side ? s_board.x + s_board.width : s_board.x, s_board.y - 6 };
            float jitter = (float)GetRandomValue(-30, 30);
            b->vel = (Vector2){ (side ? -1 : 1) * (70 + jitter) * Difficulty(), (120 + jitter) * Difficulty() };
            b->color = side ? C_BAD : RAYWHITE;
        }
    }
}

static void UpdateBullets(float dt)
{
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &s_bullets[i];
        if (!b->active) continue;

        if (b->kind == B_HOMING) {
            Vector2 d = { s_soul.x - b->pos.x, s_soul.y - b->pos.y };
            float len = sqrtf(d.x * d.x + d.y * d.y);
            if (len > 0.01f) {
                float acc = 160.0f * Difficulty();
                b->vel.x += d.x / len * acc * dt;
                b->vel.y += d.y / len * acc * dt;
            }
            float sp = sqrtf(b->vel.x * b->vel.x + b->vel.y * b->vel.y);
            float maxSp = 95.0f * Difficulty();
            if (sp > maxSp) { b->vel.x *= maxSp / sp; b->vel.y *= maxSp / sp; }
            b->life -= dt;
            if (b->life <= 0) b->active = false;
        }

        b->pos.x += b->vel.x * dt;
        b->pos.y += b->vel.y * dt;

        /* cull far outside board */
        float m = 60;
        if (b->pos.x < s_board.x - m - b->w || b->pos.x > s_board.x + s_board.width + m ||
            b->pos.y < s_board.y - m - b->h || b->pos.y > s_board.y + s_board.height + m)
            b->active = false;
    }
}

static bool SoulHit(void)
{
    for (int i = 0; i < MAX_BULLETS; i++) {
        Bullet *b = &s_bullets[i];
        if (!b->active) continue;
        if (b->kind == B_RECT) {
            Rectangle r = { b->pos.x, b->pos.y, b->w, b->h };
            if (CheckCollisionCircleRec(s_soul, SOUL_RADIUS - 1, r)) return true;
        } else {
            if (CheckCollisionCircles(s_soul, SOUL_RADIUS - 1, b->pos, b->r)) return true;
        }
    }
    return false;
}

/* ---------------------------------------------------------------------- */
/* Scene API                                                              */
/* ---------------------------------------------------------------------- */
void FightInit(void)
{
    s_bossHP   = BOSS_MAX_HP;
    s_playerHP = PLAYER_MAX_HP;
    s_wave     = 0;
    s_iframes  = 0;
    s_bossShake = 0;
    s_menuSel  = M_FIGHT;
    s_items    = 3;
    s_board = s_boardTarget = BOARD_WIDE;
    s_soul = (Vector2){ SCREEN_W / 2.0f, 320 };
    ClearBullets();
    TextboxStartOne(&s_tb, g.deaths > 0
        ? "* Sahoor is back. He remembers your L."
        : "* Tung Tung Tung Sahoor blocks the way! He is cracking his bat.");
    SetPhase(PH_INTRO);
}

static void UpdateIntro(float dt)
{
    TextboxUpdate(&s_tb, dt);
    if (TextboxFinished(&s_tb)) SetPhase(PH_MENU);
}

static void StartFlavor(const char *text)
{
    strncpy(s_flavor, text, sizeof(s_flavor) - 1);
    s_flavor[sizeof(s_flavor) - 1] = '\0';
    TextboxStartOne(&s_tb, s_flavor);
    SetPhase(PH_FLAVOR);
}

static void UpdateMenu(float dt)
{
    (void)dt;
    if (IsKeyPressed(KEY_LEFT))  s_menuSel = (s_menuSel + M_COUNT - 1) % M_COUNT;
    if (IsKeyPressed(KEY_RIGHT)) s_menuSel = (s_menuSel + 1) % M_COUNT;

    if (!ConfirmPressed()) return;
    switch (s_menuSel) {
        case M_FIGHT:
            s_attackPos = 0;
            SetPhase(PH_ATTACK);
            break;
        case M_ACT: {
            char buf[256];
            snprintf(buf, sizeof(buf),
                "* SAHOOR - ATK sky-high, DEF solid oak.\n* %s", RandomQuote());
            StartFlavor(buf);
            break;
        }
        case M_ITEM:
            if (s_items > 0) {
                s_items--;
                s_playerHP += 12;
                if (s_playerHP > PLAYER_MAX_HP) s_playerHP = PLAYER_MAX_HP;
                char buf[128];
                snprintf(buf, sizeof(buf),
                    "* You chug a Chug Jug. +12 HP.\n* %d left.", s_items);
                StartFlavor(buf);
            } else {
                StartFlavor("* Your bag is empty. Only vibes remain.");
            }
            break;
        case M_MERCY:
            StartFlavor("* You try to SPARE Sahoor.\n"
                        "* His name is too long to fit the mercy window. (just fight)");
            break;
    }
}

static void UpdateFlavor(float dt)
{
    TextboxUpdate(&s_tb, dt);
    if (TextboxFinished(&s_tb)) SetPhase(PH_MENU);
}

static void UpdateAttack(float dt)
{
    s_attackPos += dt / 1.1f;  /* 1.1 seconds to cross */
    bool fire = ConfirmPressed();
    if (fire || s_attackPos >= 1.0f) {
        float acc = fire ? 1.0f - fabsf(s_attackPos - 0.5f) * 2.0f : 0.0f;
        if (acc < 0) acc = 0;
        s_lastDamage = 6 + (int)(acc * acc * 24.0f);  /* 6 .. 30 */
        s_bossHP -= s_lastDamage;
        if (s_bossHP < 0) s_bossHP = 0;
        s_bossShake = 0.4f;
        SetPhase(PH_ATTACK_RESULT);
    }
}

static void UpdateAttackResult(float dt)
{
    (void)dt;
    if (s_phaseT > 1.0f) {
        if (s_bossHP <= 0) {
            TextboxStartOne(&s_tb, "* Sahoor: 'my aura... stolen... by a HEART?!'  * Stealing the flag...");
            SetPhase(PH_WIN_FETCH);
        } else {
            StartTaunt();
        }
    }
}

static void UpdateTaunt(float dt)
{
    TextboxUpdate(&s_tb, dt);
    if (TextboxFinished(&s_tb)) StartDodge();
}

static void UpdateDodge(float dt)
{
    /* move soul */
    Vector2 d = { 0, 0 };
    if (IsKeyDown(KEY_LEFT))  d.x -= 1;
    if (IsKeyDown(KEY_RIGHT)) d.x += 1;
    if (IsKeyDown(KEY_UP))    d.y -= 1;
    if (IsKeyDown(KEY_DOWN))  d.y += 1;
    if (d.x != 0 && d.y != 0) { d.x *= 0.7071f; d.y *= 0.7071f; }
    float sp = IsKeyDown(KEY_LEFT_SHIFT) ? SOUL_SPEED * 0.5f : SOUL_SPEED; /* shift = focus */
    s_soul.x += d.x * sp * dt;
    s_soul.y += d.y * sp * dt;

    float minX = s_board.x + SOUL_RADIUS + 2, maxX = s_board.x + s_board.width  - SOUL_RADIUS - 2;
    float minY = s_board.y + SOUL_RADIUS + 2, maxY = s_board.y + s_board.height - SOUL_RADIUS - 2;
    if (s_soul.x < minX) s_soul.x = minX;
    if (s_soul.x > maxX) s_soul.x = maxX;
    if (s_soul.y < minY) s_soul.y = minY;
    if (s_soul.y > maxY) s_soul.y = maxY;

    /* spawn + move bullets (stop spawning for the last second so the board empties) */
    if (s_phaseT < s_dodgeLen - 1.0f) {
        switch (s_pattern) {
            case 0: PatternRain(dt);   break;
            case 1: PatternBats(dt);   break;
            case 2: PatternRings(dt);  break;
            case 3: PatternHoming(dt); break;
            default: PatternCross(dt); break;
        }
    }
    UpdateBullets(dt);

    if (s_iframes > 0) s_iframes -= dt;
    else if (SoulHit()) {
        s_playerHP -= HIT_DAMAGE;
        s_iframes = IFRAMES;
        if (s_playerHP <= 0) {
            s_playerHP = 0;
            SetPhase(PH_DEAD);
            return;
        }
    }

    if (s_phaseT >= s_dodgeLen) {
        s_wave++;
        ClearBullets();
        s_boardTarget = BOARD_WIDE;
        SetPhase(PH_MENU);
    }
}

static void UpdateWinFetch(float dt)
{
    (void)dt;
    /* Let the message render for a moment, then do the (blocking) request. */
    if (s_phaseT < 0.6f) return;

    char flag[FLAG_CAP];
    g.hasFlag = false;
    if (NetComplete(g.token, flag, sizeof(flag))) {
        strncpy(g.flag, flag, FLAG_CAP - 1);
        g.flag[FLAG_CAP - 1] = '\0';
        g.hasFlag = true;
        NetShowFlagInPage(g.flag);
        printf("FLAG: %s\n", g.flag);
        SetStatus("Flag acquired!");
    } else {
        SetStatus("/complete rejected the token (expired? restart from the ARENA).");
        g.hasToken = false;  /* force re-unlock */
    }
    g.fightsWon++;
    ChangeScene(SCENE_VICTORY);
}

static void UpdateDead(float dt)
{
    (void)dt;
    if (s_phaseT > 0.9f) {
        g.deaths++;
        ChangeScene(SCENE_GAMEOVER);
    }
}

void FightUpdate(float dt)
{
    s_phaseT += dt;
    if (s_bossShake > 0) s_bossShake -= dt;
    LerpBoard(dt);

    switch (s_phase) {
        case PH_INTRO:         UpdateIntro(dt);        break;
        case PH_MENU:          UpdateMenu(dt);         break;
        case PH_FLAVOR:        UpdateFlavor(dt);       break;
        case PH_ATTACK:        UpdateAttack(dt);       break;
        case PH_ATTACK_RESULT: UpdateAttackResult(dt); break;
        case PH_TAUNT:         UpdateTaunt(dt);        break;
        case PH_DODGE:         UpdateDodge(dt);        break;
        case PH_WIN_FETCH:     UpdateWinFetch(dt);     break;
        case PH_DEAD:          UpdateDead(dt);         break;
    }
}

/* ---------------------------------------------------------------------- */
/* Drawing                                                                */
/* ---------------------------------------------------------------------- */
static void DrawBossHUD(void)
{
    /* boss sprite */
    float sx = SCREEN_W / 2.0f, sy = 106;
    if (s_bossShake > 0) { sx += (float)GetRandomValue(-5, 5); sy += (float)GetRandomValue(-3, 3); }
    DrawSahoor(sx, sy, 1.45f, s_phase == PH_DODGE || s_phase == PH_TAUNT);

    /* boss HP bar */
    int bw = 260, bh = 12, bx = SCREEN_W / 2 - bw / 2, by = 200;
    DrawRectangle(bx, by, bw, bh, (Color){ 60, 60, 60, 255 });
    DrawRectangle(bx, by, (int)(bw * (float)s_bossHP / BOSS_MAX_HP), bh, C_GOOD);
    DrawRectangleLines(bx, by, bw, bh, RAYWHITE);
    char buf[64];
    snprintf(buf, sizeof(buf), "SAHOOR  %d / %d", s_bossHP, BOSS_MAX_HP);
    DrawTextCentered(buf, SCREEN_W / 2, by + 16, 14, C_HINT);
}

static void DrawPlayerHUD(void)
{
    int y = 416;
    DrawText("TUNG   LV 1", 24, y + 1, 14, RAYWHITE);
    int lblx = 160;
    DrawText("HP", lblx, y, 16, C_ACCENT);
    int bx = lblx + 26, bw = 96, bh = 15;
    DrawRectangle(bx, y, bw, bh, (Color){ 180, 20, 20, 255 });                               /* lost HP */
    DrawRectangle(bx, y, (int)(bw * (float)s_playerHP / PLAYER_MAX_HP), bh, C_ACCENT);        /* current */
    char buf[32];
    snprintf(buf, sizeof(buf), "%d / %d", s_playerHP, PLAYER_MAX_HP);
    DrawText(buf, bx + bw + 10, y, 16, RAYWHITE);
    snprintf(buf, sizeof(buf), "WAVE %d", s_wave + 1);
    DrawText(buf, SCREEN_W - 110, y + 1, 14, C_HINT);
}

/* Undertale-style bottom button row: FIGHT / ACT / ITEM / MERCY with a soul
 * pointer on the highlighted one. Sharp orange boxes, bright yellow when picked. */
static void DrawBattleMenu(void)
{
    const float margin = 24, gap = 10, y = 438, h = 34;
    float bw = (SCREEN_W - 2 * margin - (M_COUNT - 1) * gap) / M_COUNT;
    for (int i = 0; i < M_COUNT; i++) {
        Rectangle r = { margin + i * (bw + gap), y, bw, h };
        bool sel = (s_phase == PH_MENU && i == s_menuSel);
        Color col = sel ? C_ACCENT : (Color){ 255, 140, 0, 255 };
        DrawRectangleRec(r, C_BOX);
        DrawRectangleLinesEx(r, sel ? 3 : 2, col);
        int fs = 20, tx = (int)(r.x + r.width / 2) + (sel ? 9 : 0);
        DrawTextCentered(MENU_LABELS[i], tx, (int)(r.y + h / 2 - fs / 2), fs, col);
        if (sel) DrawHeart(r.x + 15, r.y + h / 2.0f, 12, C_SOUL);
    }
}

static void DrawBullets(void)
{
    for (int i = 0; i < MAX_BULLETS; i++) {
        const Bullet *b = &s_bullets[i];
        if (!b->active) continue;
        if (b->kind == B_RECT) DrawRectangleRec((Rectangle){ b->pos.x, b->pos.y, b->w, b->h }, b->color);
        else DrawCircleV(b->pos, b->r, b->color);
    }
}

void FightDraw(void)
{
    ClearBackground(BLACK);
    DrawBossHUD();

    /* board */
    DrawFrame(s_board, C_BOX, C_BORDER);

    switch (s_phase) {
        case PH_INTRO:
        case PH_TAUNT:
            TextboxDraw(&s_tb, s_board);
            break;

        case PH_MENU:
            DrawTextCentered("* Tung Tung Tung Sahoor blocks the way.",
                             SCREEN_W / 2, (int)(s_board.y + s_board.height / 2 - 20), 18, RAYWHITE);
            DrawTextCentered("Arrows pick an option  -  Z selects",
                             SCREEN_W / 2, (int)(s_board.y + s_board.height / 2 + 8), 14, C_HINT);
            break;

        case PH_FLAVOR:
            TextboxDraw(&s_tb, s_board);
            break;

        case PH_ATTACK: {
            Rectangle bar = { s_board.x + 20, s_board.y + 40, s_board.width - 40, 70 };
            DrawRectangleRec(bar, (Color){ 30, 30, 30, 255 });
            /* accuracy zones */
            float cx = bar.x + bar.width / 2;
            DrawRectangle((int)(cx - bar.width * 0.08f), (int)bar.y, (int)(bar.width * 0.16f), (int)bar.height, (Color){ 40, 90, 40, 255 });
            DrawRectangle((int)(cx - bar.width * 0.02f), (int)bar.y, (int)(bar.width * 0.04f), (int)bar.height, (Color){ 60, 160, 60, 255 });
            DrawRectangleLinesEx(bar, 2, RAYWHITE);
            float px = bar.x + s_attackPos * bar.width;
            DrawRectangle((int)px - 4, (int)bar.y - 6, 8, (int)bar.height + 12, ((int)(GetTime() * 10) % 2) ? RAYWHITE : C_ACCENT);
            DrawTextCentered("* Press Z when the bar is centered!", SCREEN_W / 2, (int)(s_board.y + 12), 16, C_HINT);
            break;
        }

        case PH_ATTACK_RESULT: {
            char buf[32];
            snprintf(buf, sizeof(buf), "%d", s_lastDamage);
            float rise = s_phaseT * 30;
            DrawTextCentered(buf, SCREEN_W / 2, (int)(160 - rise), 36, C_BAD);
            DrawTextCentered(s_lastDamage >= 25 ? "* CRITICAL TUNG!" : "* Hit!", SCREEN_W / 2, (int)(s_board.y + s_board.height / 2 - 10), 20, RAYWHITE);
            break;
        }

        case PH_DODGE: {
            DrawBullets();
            bool blink = s_iframes > 0 && ((int)(GetTime() * 15) % 2 == 0);
            if (!blink) DrawHeart(s_soul.x, s_soul.y, SOUL_RADIUS * 2.2f, C_SOUL);
            /* timer bar above board */
            float frac = 1.0f - s_phaseT / s_dodgeLen;
            if (frac < 0) frac = 0;
            DrawRectangle((int)s_board.x, (int)s_board.y - 8, (int)(s_board.width * frac), 4, C_HINT);
            break;
        }

        case PH_WIN_FETCH:
            TextboxDraw(&s_tb, s_board);
            break;

        case PH_DEAD:
            DrawHeart(s_soul.x, s_soul.y, SOUL_RADIUS * 2.2f, C_SOUL);
            DrawLine((int)s_soul.x, (int)s_soul.y - 8, (int)s_soul.x, (int)s_soul.y + 8, BLACK);
            break;
    }

    if (s_phase == PH_MENU || s_phase == PH_FLAVOR) DrawBattleMenu();
    DrawPlayerHUD();
    if (s_phase == PH_DODGE)
        DrawTextCentered("hold SHIFT to move slow", SCREEN_W / 2, 462, 12, C_HINT);
}
