# The Axon That Moved

## Description

Finding the recording in A Voice Before Launch made me curious about the people who unlocked it. The payphone call associated with it moved to Denver after the original location failed. On the retry day, the player community warned that callers would face a new question. According to the notice published that day, what one-word answer were players supposed to give?

## Files

Text-only challenge; publish the [player brief](../player/README.md) after **14 — A Voice Before Launch** is solved. No downloadable starter file or container. Submit `RCC{word}`.

## Hint(s)

1. The recording also named a real-world telephone rendezvous. Investigate the effort to unlock it.
2. The community ledger explains why Rochester failed. The move and retry appear on different days in the community's news.
3. Compare the September 14 and 15, 2004 entries in Netninja's NewsArchives. The retry notice lists the recording and a new question about a captain.

## Walkthrough

1. Carry over **standish.wav** from *A Voice Before Launch*. Find `standish` in the archived [NewRecipe3Axons ledger](https://web.archive.org/web/20041001025040/http://qube.netninja.com:80/beewiki/NewRecipe3Axons). Its dialogue matches the recording; the comments describe Rochester's unusable and removed telephones.

   ![The preserved ledger associates standish with the dialogue and Rochester telephone failure.](screenshots/01-ledger-association.png)

2. Search for the relocated axon in [Netninja's NewsArchives](https://bees.netninja.com/staticwiki/beewiki/NewsArchives). The **September 14, 2004** entry announces that `standish` moved and wishes the Denver beekeepers luck. This is the move announcement, not the retry notice.

   ![The September 14 move announcement names standish and Denver.](screenshots/02-move-notice.png)

3. Read the **September 15** entry immediately above it. Its schedule lists `standish`, followed by the new phone question: “What is the last name of our captain?” The stated answer is **Greene**.

   ![The September 15 notice lists standish and gives Greene as the new response.](screenshots/03-retry-response.png)

4. Submit `RCC{greene}`. The [contemporary guide](https://wonderweasels.org/apiary/guide2.htm) also distinguishes the changing phone question from each axon's own codeword; `standish` answers a different check.

## Flag

`RCC{greene}`
