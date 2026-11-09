import java.util.Arrays;

public class Solver {
    static char[][] mat;

    public static void main(String[] args) {

        // Image to program output style
        String input = """
                ######__#######_
                __#_##_#___#_##_
                ######__##__#___
                ___##_##__#_##__
                ##_#_##_##_##_#_
                __####__#_#___#_
                ####__#_##__##_#
                __#_#_#_#___#__#
                ##_##_#_##__###_
                __#_____#_##_###
                ##_########__#_#
                #_#_#__#_#_#_#__
                ##_#_#__##_##_#_
                __#_____#__##_#_
                ##__#_#_##___###
                #__##____#_#_#__
                """;
        // Put in matrix
        mat = new char[16][16];
        System.out.println("From image");
        for(int i = 0; i < 16; i++) {
            mat[i] = input.substring(i * 17, i * 17 + 16).toCharArray();
            System.out.println(mat[i]);
        }

        System.out.println();
        System.out.println("\nRotated counter-clockwise");

        // Rotate the blocks back
        for (int i = 0; i < 16; i+=2) {
            for (int j = 0; j < 16; j+=2) {
                rotate(i, j);
            }
        }

        for (int i = 0; i < 16; i++) {
            System.out.println(mat[i]);
        }

        // Flip all bits
        for (int i = 0; i < 16; i++) {
            for (int j = 0; j < 16; j++) {
                mat[i][j] = mat[i][j] == '#' ? '_' : '#';
            }
        }

        System.out.println();
        System.out.println("Bits flipped");

        for (int i = 0; i < 16; i++) {
            System.out.println(mat[i]);
        }

        // Get their characters from the byte ascii values
        char[] chars = new char[32];
        int index = 0;
        for (int i = 0; i < 16; i++) {
            for (int j = 0; j < 16; j+=8) {
                chars[index++] = getByte(i, j);
            }
        }

        System.out.println();
        System.out.print("Final string: ");
        System.out.println(chars);
    }

    // Rotates the block
    static void rotate(int r, int c) {
//      A B  ->  B D
//      C D  ->  A C
        char temp = mat[r][c];
        mat[r][c] = mat[r][c+1];
        mat[r][c+1] = mat[r+1][c+1];
        mat[r+1][c+1] = mat[r+1][c];
        mat[r+1][c] = temp;
    }

    // Gets the character
    static char getByte(int r, int c) {
        char out = 0;
        for (int i = 0; i < 8; i++) {
            if(mat[r][c + i] == '#')
                out += (char) (1 << (7 - i));
        }
        return out;
    }
}

