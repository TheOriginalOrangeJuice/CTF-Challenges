#include <stdio.h>
#include <string.h>
#include <stdint.h>

#define key_l 3
#define f_l 39

uint8_t nS(uint8_t n) {
    return (((n & 0x0F) << 4) | ((n & 0xF0) >> 4));
}

void encr(uint8_t* in, uint8_t* out) {
    uint8_t k[] = {0x52, 0x43, 0x43};
    for(int i; i < f_l; i++) {
        out[i] = nS(in[i]) ^ k[i % 3];
    }
}

int main() {
    uint8_t cip[] = {
        0x77, 0x77, 0x77, 0x17, 0x27, 0xf4, 0x44, 0x64, 0x15, 0xa7,
        0xd4, 0xb5, 0x05, 0xb6, 0x25, 0x04, 0x15, 0x85, 0xc4, 0xa5,
        0x35, 0xa7, 0xd5, 0x04, 0xa7, 0xa5, 0xb5, 0x25, 0xb6, 0x95,
        0x75, 0xb6, 0xf5, 0x75, 0x55, 0x65, 0x65, 0xb0, 0x94
    };

    uint8_t enc[f_l];
    
    char input[64];

    printf("Enter the flag: ");
    if(fgets(input, sizeof(input), stdin) == NULL)
        return 1;
    
    input[strcspn(input, "\n")] = 0;

    if(strlen(input) != f_l) {
        printf("Wrong!\n");
        return 1;
    }

    encr((uint8_t *)input, enc);

    if(memcmp(enc, cip, f_l) == 0)
        printf("Correct!\n");
    else 
        printf("Wrong!\n");

    return 0;
}