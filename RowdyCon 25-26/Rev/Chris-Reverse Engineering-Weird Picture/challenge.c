#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <ctype.h>

#define WIDTH  16
#define HEIGHT 16
#define BYTES  32

// input: RCCTF{RcC_i$_tH3_be$T!!_WOo0o!1}

int parse_input(const char *input, uint8_t *bytes) {
    for (int i = 0; i < BYTES; i++) {
        if (input[i] < 32 || input[i] > 126) return 0;
        bytes[i] = (uint8_t) input[i];
        bytes[i] ^= 0xFF;
    }
    return 1;
}

int get_pixel(uint8_t *pixels, int row, int col) {
    int index = row * WIDTH + col;
    int byte_index = index / 8;
    int bit_index  = 7 - (index % 8);  // MSB to LSB
    return (pixels[byte_index] >> bit_index) & 1;
}

void set_pixel(uint8_t *pixels, int row, int col, int val) {
    int index = row * WIDTH + col;
    int byte_index = index / 8;
    int bit_index  = 7 - (index % 8);  // MSB to LSB
    if (val)
        pixels[byte_index] |=  (1 << bit_index);
    else
        pixels[byte_index] &= ~(1 << bit_index);
}

void rotate(uint8_t *pixels, int row, int col) {
    // get the 4 pixel values from the 2x2 block
    int a = get_pixel(pixels, row,   col);    // top-left
    int b = get_pixel(pixels, row,   col+1);  // top-right
    int c = get_pixel(pixels, row+1, col);    // bottom-left
    int d = get_pixel(pixels, row+1, col+1);  // bottom-right

    // Clockwise
    // A B      C A
    // C D  ->  D B
    set_pixel(pixels, row,   col,   c);
    set_pixel(pixels, row,   col+1, a);
    set_pixel(pixels, row+1, col,   d);
    set_pixel(pixels, row+1, col+1, b);
}

void display_image(uint8_t *bytes) {
    printf("\n");
    for (int row = 0; row < HEIGHT; row++) {
        for (int col = 0; col < WIDTH; col++) {
            int byte_index = (row * WIDTH + col) / 8;
            int bit_index  = 7 - ((row * WIDTH + col) % 8);
            int bit = (bytes[byte_index] >> bit_index) & 1;
            printf("%s", bit ? "# " : "_ ");
        }
        printf("\n");
    }
    printf("\n");
}

int main() {
    char input[64];

    printf("Enter a %d-character string: ", BYTES);
    if (fgets(input, sizeof(input), stdin) == NULL) return 1;
    input[strcspn(input, "\n")] = 0;

    if (strlen(input) != (BYTES)) {
        
        printf("\nInput must be exactly %d characters. Yours is %d. Please try again.\n\n", BYTES, strlen(input));
        return 1;
    }

    uint8_t parsed[BYTES];
    if (!parse_input(input, parsed)) {
        printf("\nInvalid characters in input. Try again.\n\n");
        return 1;
    }

    for(int i = 0; i < HEIGHT; i += 2) {
        for(int j = 0; j < WIDTH; j += 2) {
            rotate(parsed, i, j);
        }
    }

    printf("\nYour image:\n");
    display_image(parsed);

    printf("If you think this image is correct, wrap your input string in RCCTF{} and submit it as the flag. Good job!\n\n");
    return 0;
}