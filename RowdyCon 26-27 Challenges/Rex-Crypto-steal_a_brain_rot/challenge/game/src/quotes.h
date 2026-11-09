/*
 * quotes.h - Sahoor's dialogue pool.  Two vibes: modern brainrot and
 * 2010-era meme speak.  All paraphrase-style, PG, non-infringing.
 */
#ifndef SABR_QUOTES_H
#define SABR_QUOTES_H

#include "raylib.h"

static const char *BRAINROT_QUOTES[] = {
    "Tung. Tung. Tung. Tung. Tung. Sahur...",
    "You cannot run from the skibidi.",
    "Only in Ohio does the fanum tax reach the soul.",
    "Sigma grindset: dodge or perish.",
    "Your aura is at -9999. Pathetic.",
    "No rizz detected. Initiating mog sequence.",
    "This fight is giving... mid.",
    "Chat, is this real? Chat?",
};
#define BRAINROT_COUNT ((int)(sizeof(BRAINROT_QUOTES)/sizeof(BRAINROT_QUOTES[0])))

static const char *MEME_2010_QUOTES[] = {
    "U mad bro?",
    "Such boss. Very fight. Wow.",
    "It's over 9000!",
    "Do you even dodge?",
    "One does not simply talk to Sahoor.",
    "Y u no dodge faster?",
    "Me gusta... your suffering.",
    "Cool story bro. Now dodge.",
    "I can haz your HP?",
};
#define MEME_2010_COUNT ((int)(sizeof(MEME_2010_QUOTES)/sizeof(MEME_2010_QUOTES[0])))

/* Lines Sahoor uses in the overworld before the player has a token. */
static const char *REFUSAL_QUOTES[] = {
    "You wish to fight ME? Without the ancient code? LOL. LMAO even.",
    "Bring me the ANCIENT CODE from the ARENA. Then we tung.",
    "No code, no fight. That's the sigma rule.",
};
#define REFUSAL_COUNT ((int)(sizeof(REFUSAL_QUOTES)/sizeof(REFUSAL_QUOTES[0])))

/* Pick a random quote from either pool. */
static inline const char *RandomQuote(void)
{
    if (GetRandomValue(0, 1) == 0)
        return BRAINROT_QUOTES[GetRandomValue(0, BRAINROT_COUNT - 1)];
    return MEME_2010_QUOTES[GetRandomValue(0, MEME_2010_COUNT - 1)];
}

static inline const char *RandomRefusal(void)
{
    return REFUSAL_QUOTES[GetRandomValue(0, REFUSAL_COUNT - 1)];
}

#endif /* SABR_QUOTES_H */
