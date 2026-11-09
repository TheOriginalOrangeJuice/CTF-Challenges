# Now Playing, 2001

## Description

I got a job to work for the government as an IT Assistant! On my first day, they asked me to reinstall the Windows XP operating system... weird we still use that in 2026. I reinstalled it and wanted to test the functionality so I booted up the Original Media Player. I was so shocked when the male singer's voice started playing as the default song. His voice was so crisp and clear.. I must know what microphone he used to record it. What microphone model did the original album's producer say he used for those vocals?


Submit `RCC{model}`. - I don't need the brand, it's probably a Sony. 

## Files

None

## Hint(s)


## Walkthrough

1. Search for the original Windows XP sample music. [Microsoft's announcement](https://news.microsoft.com/source/2001/08/01/david-byrne-to-provide-promotional-music-for-windows-xp/) identifies David Byrne's **Like Humans Do**, from **Look Into the Eyeball**. The other familiar XP sample, *Highway Blues*, is instrumental.

2. Search for `David Byrne Look Into the Eyeball recording interview`. The [February 2002 Avalon interview](https://www.avalondesignarchive.com/pdfs/mangini-int.pdf) names **Michael Mangini** as the album's producer and engineer. Its first page connects him to the album.

   ![Avalon interview identifying Michael Mangini and Look Into the Eyeball](screenshots/01-album-producer.png)

3. On PDF page 3, read the left column beneath the vocal-processing discussion. Mangini names the **Sony C800** and says it was used on every song. The **Vt-737sp** is the preamplifier, not the microphone.

   ![The original interview's vocal-microphone passage naming Sony C800](screenshots/02-vocal-microphone.png)

4. Submit the designation printed in the interview: `RCC{c800}`. The question asks what Mangini named; it does not establish a physical C800 versus C800G revision. The [complete saved interview](evidence/producer-interview.pdf) contains the surrounding discussion.

## Flag

`RCC{c800}`
