# Angel Beats! — Behind the Noise

## Description

For 12 years of my life, this guitar solo has been living rent-free in my head. It's from my favorite animated TV show too! I've been wanting to recreate the sound of the solo for the longest time but I can't find the exact fuzz-pedal model that the guitarist used when he recorded this part. I'm sure someone asked about this and it was answered somewhere. Can you find me the fuzz-pedal model? 

## Files

[audio-01.mp3](../player/audio-01.mp3) — a 22.4-second excerpt of the guitar-solo section, with the original backing instruments. Submit `RCC{pedal_model}`.

## Walkthrough

1. Use a song detector to find the song that the solo comes from. It's Crow Song.

   ![The episode 1 concert frame and the article's Crow Song identification](screenshots/01-song-identification.png)

2. Follow the recording credits to **光収容 / Hikarisyuyo**. His [archived works page](https://web.archive.org/web/20121020045514/http://www.hikarisyuyo.net/works.html) credits him with arrangement, guitar and bass for Girls Dead Monster. In his [April 30, 2010 diary](https://web.archive.org/web/20120823182056/http://www.hikarisyuyo.net/1004.html), he also responds to a fan praising **Crow Song’s solo**, describing its roaring fuzz as characteristic of his playing.

   ![Hikarisyuyo's own works page credits his Girls Dead Monster recording work](screenshots/02-guitarist-credits.png)

3. Open his [archived homepage](https://web.archive.org/web/20121020045444/http://www.hikarisyuyo.net/index.html). Follow **Log1012** at the bottom, then **Log1010** at the bottom of the [December 2010 diary](https://web.archive.org/web/20120823181807/http://www.hikarisyuyo.net/1012.html).

   ![The archived homepage links to Log1012](screenshots/03-archive-home.png)

   ![The December diary links to Log1010](screenshots/04-archive-december.png)

4. In the [October 2, 2010 entry](https://web.archive.org/web/20120823181928/http://www.hikarisyuyo.net/1010.html), find the reader asking which fuzz he used for **Crow Song’s solo**. His reply, **“あれはHSWの1405,”** means **“That was HSW’s 1405.”** The following sentence recommends a Big Muff for a similar sound; the pedal he names as used is **HSW 1405**.

   ![The fan's Crow Song solo question and Hikarisyuyo's HSW 1405 answer](screenshots/05-fan-reply.png)

5. Submit **HSW 1405**. For corroboration, the [underside-label photograph](https://www.tanko.red/Nikki/xx_sozai/2009/090107/sn.jpg) in an owner's [January 7, 2009 account](https://www.tanko.red/Nikki/2009/0901Nikki.html#090107) reads **HSW / Honda Sound Works / 1405 / MAD FUZZ**. This confirms the expanded model name; the photographed unit belongs to that owner.

   ![Original product label showing HSW, Honda Sound Works, 1405 and MAD FUZZ](screenshots/06-model-label.jpg)

## Flag

`RCC{hsw_1405}`

Accept these answer values inside `RCC{...}`: `1405`, `HSW 1405`, `Honda Sound Works 1405`, `1405 Mad Fuzz`, `HSW 1405 Mad Fuzz`, and `Honda Sound Works 1405 Mad Fuzz`.

Ignore case and surrounding whitespace; treat spaces, underscores and hyphens as equivalent separators. Require `1405`. `Big Muff`, `Mad Fuzz` alone and other pedal models do not identify the requested model.

Allow three substantive attempts. Staff should correct genuine formatting errors without consuming an attempt.
