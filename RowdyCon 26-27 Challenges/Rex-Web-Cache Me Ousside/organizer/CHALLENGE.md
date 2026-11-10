# Cache Me Ousside

> **Category**: Web Exploitation
> **Difficulty**: Hard

## Description

*Cache me ousside. How bow dah?*

Snapshot Uploader out here runnin its mouth: upload a file, some lil background worker renders you a receipt, and you read it back from `/results`. Da devs think dey slick — dey locked down da endpoint dat *reads* files real tight.

Da one dat *writes* 'em? Yeah... dey wasn't watchin dat one. 👀

Da flag's sittin at `/flag.txt` and dis service ain't neva servin it to you. You want it? Go catch it ousside.

## Hints

1. Dat read endpoint checks every name you hand it but ain't nobody checkin what you name da files you *upload*. Droppin bytes on disk is only half tho: nothin here reads a random file back to you, so you need a file da service gon' read back *and run*. Whatchu think it starts fresh on every single job?
