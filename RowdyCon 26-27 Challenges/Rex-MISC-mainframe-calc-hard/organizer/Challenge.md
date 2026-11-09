# Mainframe Calculator: Printer's Gone

> **Category**: Web / Misc / Scripting
> **Difficulty**: Hard

## Description

The RoudyCon mainframe still does payroll, but its display died years ago. Jobs come
off the line printer as QR codes, wrapped in whatever encoding the night shift felt
like that day.

The printer has seen better days too. The paper feed slips, the ribbon is nearly dry,
the colour heads drifted, the print head strobes, and when it jams the operators fall
back to the embosser or just type the thing in as a table. Every job comes out
wrong in its own way.

37 jobs. Your phone can probably still read them. Your script will have to work for it.

`http://<host>:8081/`

## Hints

1. It's the easy Mainframe Calculator with a busted printer. Get a plain solver working
   first, then teach it to repair each job.
2. The header names the fault, and the fix follows from it: pick the one clean frame,
   read a single colour channel, stretch the contrast, rebuild the grid from the HTML…
3. Watch for a job split across two or three codes labelled `i/n` — collect them, put
   them back in order, join, *then* decode.
