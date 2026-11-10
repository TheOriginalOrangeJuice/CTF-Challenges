/*
 * ===============================================================
 *   DOUBLE IT AND GIVE IT TO THE NEXT PERSON
 * ===============================================================
 *
 *   You start with $1.
 *   The rules are simple: double it and give it to the next person.
 *   Nobody ever breaks the chain... right?
 *
 *   pwn challenge  -  classic stack buffer overflow / ret2win
 */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

/*
 * The "next person" nobody expects. This function is never called
 * anywhere in the normal program flow -- you have to redirect
 * execution here yourself by overwriting the saved return address.
 */
void break_the_chain(void)
{
    puts("");
    puts("[!] You doubled it so many times the chain SNAPPED.");
    puts("[!] The next person in line... is you. Here's your reward:\n");
    fflush(stdout);

    /*
     * system() routes through do_system(), which uses SSE instructions
     * (movaps) that FAULT unless RSP is 16-byte aligned at the call.
     * A naive "ret straight into this function" lands with RSP misaligned
     * and crashes before the flag prints -- you must realign first with an
     * extra `ret` gadget. That's the intended twist.
     */
    system("/bin/cat flag.txt");

    fflush(stdout);
    _exit(0);
}

void start_the_chain(void)
{
    char name[256];   /* <-- 256-byte buffer, no bounds checking below */

    puts("You have been handed $1.");
    puts("The rules are simple: double it and give it to the next person.");
    printf("Who should we say started this glorious chain? ");
    fflush(stdout);

    /*
     * read() happily accepts far more than the buffer can hold.
     * 256-byte buffer, up to 512 bytes read => stack smash.
     */
    read(0, name, 0x200);

    printf("Thanks, %s!\n", name);
    puts("The chain continues down the line...");
}

int main(void)
{
    /* Unbuffered I/O so it behaves identically over a socket. */
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);

    puts("=================================================");
    puts("  DOUBLE IT AND GIVE IT TO THE NEXT PERSON");
    puts("=================================================\n");

    start_the_chain();

    puts("\n...and the chain quietly fizzled out. Nobody got the flag. :(");
    return 0;
}
