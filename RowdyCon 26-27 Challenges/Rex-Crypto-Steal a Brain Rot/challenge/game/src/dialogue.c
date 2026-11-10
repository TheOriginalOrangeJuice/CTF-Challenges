/*
 * dialogue.c - typewriter textbox + the "talk to Sahoor" scene.
 */
#include "dialogue.h"
#include "game.h"
#include "quotes.h"

#include <string.h>

/* ---------------------------------------------------------------------- */
/* Textbox component                                                      */
/* ---------------------------------------------------------------------- */

void TextboxStart(Textbox *tb, const char **lines, int count)
{
    memset(tb, 0, sizeof(*tb));
    if (count > DIALOGUE_MAX_LINES) count = DIALOGUE_MAX_LINES;
    for (int i = 0; i < count; i++) tb->lines[i] = lines[i];
    tb->lineCount = count;
    tb->charsPerSec = 40.0f;
    tb->finished = (count == 0);
}

void TextboxStartOne(Textbox *tb, const char *line)
{
    const char *arr[1] = { line };
    TextboxStart(tb, arr, 1);
}

static int CurrentLen(const Textbox *tb)
{
    if (tb->line >= tb->lineCount) return 0;
    return (int)strlen(tb->lines[tb->line]);
}

void TextboxUpdate(Textbox *tb, float dt)
{
    if (tb->finished) return;
    int len = CurrentLen(tb);

    if (tb->shown < len) {
        tb->charTimer += dt * tb->charsPerSec;
        while (tb->charTimer >= 1.0f && tb->shown < len) {
            tb->charTimer -= 1.0f;
            tb->shown++;
        }
        if (ConfirmPressed()) tb->shown = len;   /* skip typewriter */
        return;
    }

    if (ConfirmPressed()) {
        tb->line++;
        tb->shown = 0;
        tb->charTimer = 0;
        if (tb->line >= tb->lineCount) tb->finished = true;
    }
}

bool TextboxFinished(const Textbox *tb)
{
    return tb->finished;
}

void TextboxDraw(const Textbox *tb, Rectangle box)
{
    DrawFrame(box, C_BOX, C_BORDER);
    if (tb->line >= tb->lineCount) return;

    Rectangle inner = { box.x + 14, box.y + 12, box.width - 28, box.height - 24 };
    DrawTextWrapped(tb->lines[tb->line], inner, 20, RAYWHITE, tb->shown);

    /* Blinking "press Z" prompt once the line is fully shown */
    if (tb->shown >= CurrentLen(tb) && ((int)(GetTime() * 2) % 2 == 0)) {
        DrawText("[Z]", (int)(box.x + box.width - 44), (int)(box.y + box.height - 24), 16, C_HINT);
    }
}

/* ---------------------------------------------------------------------- */
/* DIALOGUE scene                                                         */
/* ---------------------------------------------------------------------- */

static Textbox s_tb;
static bool s_leadsToFight;

void DialogueInit(void)
{
    const char *lines[4];
    int n = 0;
    s_leadsToFight = false;

    lines[n++] = RandomQuote();
    lines[n++] = RandomQuote();
    if (g.hasToken) {
        lines[n++] = "...wait. You HAVE the ancient code?! Fine. TUNG TUNG TUNG TIME.";
        s_leadsToFight = true;
    } else {
        lines[n++] = RandomRefusal();
        lines[n++] = "Hint: the ARENA portal to the right explains everything.";
    }
    TextboxStart(&s_tb, lines, n);
}

void DialogueUpdate(float dt)
{
    TextboxUpdate(&s_tb, dt);
    if (TextboxFinished(&s_tb) || CancelPressed()) {
        ChangeScene(s_leadsToFight ? SCENE_FIGHT : SCENE_OVERWORLD);
    }
}

void DialogueDraw(void)
{
    ClearBackground(C_BG);
    DrawSahoor(SCREEN_W / 2.0f, 128.0f, 1.9f, s_leadsToFight);
    DrawTextCentered("TUNG TUNG TUNG SAHOOR", SCREEN_W / 2, 262, 20, C_ACCENT);
    TextboxDraw(&s_tb, (Rectangle){ 40, 300, SCREEN_W - 80, 140 });
    DrawText("Z/Enter: next   X/Esc: leave", 40, 452, 14, C_HINT);
}
