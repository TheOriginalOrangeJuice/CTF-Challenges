/*
 * overworld.h - the little room with Sahoor and the ARENA portal.
 */
#ifndef SABR_OVERWORLD_H
#define SABR_OVERWORLD_H

void OverworldInit(void);
void OverworldUpdate(float dt);
void OverworldDraw(void);

/* ARENA info screen (explains the oracle) lives here too - it is tiny. */
void ArenaInit(void);
void ArenaUpdate(float dt);
void ArenaDraw(void);

/* Victory + game over screens. */
void VictoryInit(void);
void VictoryUpdate(float dt);
void VictoryDraw(void);

void GameOverInit(void);
void GameOverUpdate(float dt);
void GameOverDraw(void);

#endif /* SABR_OVERWORLD_H */
