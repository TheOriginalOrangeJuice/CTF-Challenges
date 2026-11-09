# Intranet of Insanity

> **Category**: Web Exploitation
> **Difficulty**: Insane

## Description

RowdyCon Systems, Inc. has deployed their brand-new corporate intranet portal — a full-featured employee hub with a directory, profile management, IT help desk, and admin panel. Dave from IT built it himself and says it's "totally secure."


## Hints

1. Dave's search filter blocks some things... but there are a LOT of HTML event handlers.
2. The IT Help Desk staff reviews reported pages in a real browser. What kind of data could you exfiltrate?
3. Profile updates are convenient. Does the API only accept the fields shown in the form?
4. The admin panel has tools for checking network services. Not all hostname filters think about Docker.
5. Some characters are invisible but the shell still sees them. What separates commands in bash?
