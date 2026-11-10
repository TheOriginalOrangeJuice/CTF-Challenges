# A Voice Before Launch

## Description

Before Halo 2 launched in 2004, its promotional campaign had players answering real payphones to unlock pieces of an audio story. I'm trying to find one of those original clips: a junior officer suspects a ship's records were deliberately erased, while his superior denies a cover-up. When he suggests asking the captain to confirm the story, his superior says she is dead. I never found out what the filename was for the full recording. Could you get the name?

## Files

Text-only OSINT challenge; publish the [player brief](../player/README.md). No downloadable starter or container. Submit `RCC{filename.acc}`. Solving this challenge unlocks **The Axon That Moved**.

## Hint(s)

1. Halo 2's launch had a story that crossed from the web into the telephone network.
2. Look for the original, individually named audio fragments of I Love Bees. Full chapters can join several different files.
3. The contemporary guide's Recipe 3 Take 3 section contains this conversation. Check the matching individual link on an archived `recipe3.html` page.

## Walkthrough

1. Identify **I Love Bees**, the 2004 Halo 2 campaign. Search `I Love Bees erased records captain dead` to find transcripts of its telephone recordings, including the [Wonderweasels guide](https://wonderweasels.org/apiary/guide2.htm#recipe33).

2. Open **Recipe 3 — Take 3** and click the **§** beside the section to expand its transcript. The passage labelled **standish.wav** contains the missing records, the superior's denials, and the captain's death. The following **harmony.wav** begins with the bus-accident discussion; it is a separate recording.

   ![The contemporary transcript matches the remembered conversation and labels it standish.wav.](screenshots/01-matching-transcript.png)

3. Open the [original Recipe 3 page's September 23, 2004 capture](https://web.archive.org/web/20040923010243/http://www.ilovebees.com:80/recipe3.html). Find **standish**, then copy its link address or view the page source. The original destination is `http://transmit.ilovebees.com/outbound/standish.wav`, confirming the filename **standish.wav**.

   ![Native browser source view of the preserved original page shows the outbound standish.wav link.](screenshots/02-original-link.png)

## Flag

`RCC{standish.wav}`
