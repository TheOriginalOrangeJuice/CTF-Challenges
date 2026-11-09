# asciitube: Scrambled Signal

> **Category**: Web Exploitation
> **Difficulty**: Hard

## Description

Dave escalated. The terminal now accepts **only** real YouTube links: it pulls
the host out of your URL, confirms it's YouTube, resolves the DNS, and rejects
anything that lands on a private or loopback address. Every trick from the
earlier channels is dead on arrival.

"Try getting to localhost *now*," Dave smirks.

## Hints

1. Two different parts of the box read your URL — one decides whether it's *allowed*, the other actually goes and *fetches* it. They were written separately, and they don't always agree on where a link points.
2. Spend some time with how a URL's "authority" is really structured — the part between the `//` and the path. A hostname isn't the only thing permitted to live there.