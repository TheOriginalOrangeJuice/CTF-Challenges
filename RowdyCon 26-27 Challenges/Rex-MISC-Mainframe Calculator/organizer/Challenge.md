# Mainframe Calculator

> **Category**: Web / Misc / Scripting
> **Difficulty**: Medium

## Description

The RoudyCon mainframe still does payroll, but its display died years ago. Jobs come
off the line printer as QR codes, and the night-shift operators got into the habit of
wrapping each job in *some* encoding first. Nobody remembers which. It may not even be
the same one twice.

It has 33 jobs for you. It is not a patient machine. It is not a fast one either.

`http://<host>:8080/`

## Hints

1. Round one is plain base64. After that it's a different encoding each time — try the
   usual suspects until one reads like a job.
2. Too many jobs to do by hand, but tear through them and the machine decides you
   cheated. Add a small pause between jobs.
3. Clear the queue at a steady pace and the mainframe just prints the flag — no final
   step to fight. Go too fast and it won't.
