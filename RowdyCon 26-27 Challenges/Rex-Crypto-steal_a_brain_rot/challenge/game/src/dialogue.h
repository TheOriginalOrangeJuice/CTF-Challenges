/*
 * dialogue.h - typewriter textbox component + the DIALOGUE scene
 * (talking to Sahoor in the overworld).
 */
#ifndef SABR_DIALOGUE_H
#define SABR_DIALOGUE_H

#include <stdbool.h>
#include "raylib.h"

#define DIALOGUE_MAX_LINES 8

/* --- Reusable textbox ------------------------------------------------- */
typedef struct {
    const char *lines[DIALOGUE_MAX_LINES];
    int   lineCount;
    int   line;          /* current line index */
    float charTimer;     /* accumulator for typewriter */
    int   shown;         /* chars revealed on current line */
    float charsPerSec;
    bool  finished;      /* all lines dismissed */
} Textbox;

void TextboxStart(Textbox *tb, const char **lines, int count);
void TextboxStartOne(Textbox *tb, const char *line);
/* Advance typewriter; Confirm skips to end of line / next line. */
void TextboxUpdate(Textbox *tb, float dt);
bool TextboxFinished(const Textbox *tb);
/* Draw the box frame, the revealed text and a blinking prompt. */
void TextboxDraw(const Textbox *tb, Rectangle box);

/* --- DIALOGUE scene --------------------------------------------------- */
void DialogueInit(void);
void DialogueUpdate(float dt);
void DialogueDraw(void);

#endif /* SABR_DIALOGUE_H */
