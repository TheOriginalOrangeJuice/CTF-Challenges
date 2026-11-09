# asciitube: Now Playing

> **Category**: Web Exploitation
> **Difficulty**: Easy

## Description

RowdyCon Systems just racked their coolest toy yet: **asciitube**, a Model AT-1987
"video cassette terminal" that takes any video link, fetches it, and beams it
back to your browser as glorious phosphor-green ASCII.

The intern wired it up over the weekend and shipped it straight to production.
"It just grabs whatever URL you paste and plays it — simple!" There's a little
maintenance service humming away on the same box that was never meant to face the
outside world, but hey, it's only listening on localhost. What could possibly go wrong?

## Hints

1. It's the *server* that fetches your link, not your browser — so it can reach things you can't, like a service listening on its own loopback interface.
2. Something is answering on a high port inside the box. Ask the terminal to "play" it, and watch what it shows you when the bytes it got back aren't actually a video.

