===================================================================
  DOUBLE IT AND GIVE IT TO THE NEXT PERSON
===================================================================

Category: pwn
Difficulty: easy / intro

You start with $1. The rules are simple: double it and give it to
the next person. Nobody ever breaks the chain... right?

-------------------------------------------------------------------
WHAT YOU GET
-------------------------------------------------------------------
  double_it   - the challenge binary (64-bit Linux ELF)
  flag.txt    - a FAKE/TEST flag so you can develop your exploit
                locally. The real flag only lives on the server.

-------------------------------------------------------------------
HOW TO PLAY
-------------------------------------------------------------------
Develop and test locally:

    ./double_it

Then capture the REAL flag from the live service:

    nc <HOST> <PORT>

Whatever you send over that connection is handed to the same binary,
so an exploit that works locally works on the server.

-------------------------------------------------------------------
HINTS
-------------------------------------------------------------------
  * How many bytes does it actually read? How big is the buffer
    it reads into?
  * There is a function in the binary that handles the flag, but
    nothing ever calls it during a normal run. (Try `nm double_it`
    or open it in a disassembler.)
  * The binary is not PIE -- addresses don't move between runs.
  * If your return into that function seems to crash right where it
    calls out to the shell: that's a 16-byte stack ALIGNMENT issue
    (movaps). Returning through one extra `ret` gadget first will fix
    the alignment. Classic ret2win gotcha -- look it up.

Good luck, and remember: double it and give it to the next person.
