/*
 * konami.h - "ancient code" entry scene.  Captures a sequence of
 * Up/Down/Left/Right/B/A inputs and submits it to POST /arena/unlock.
 */
#ifndef SABR_KONAMI_H
#define SABR_KONAMI_H

#define KONAMI_LEN 10

void KonamiInit(void);
void KonamiUpdate(float dt);
void KonamiDraw(void);

#endif /* SABR_KONAMI_H */
