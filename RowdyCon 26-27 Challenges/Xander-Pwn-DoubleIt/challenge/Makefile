# Build the "Double It" pwn challenge.
#
# Security mitigations are intentionally relaxed so this is a clean,
# beginner-friendly ret2win:
#   -fno-stack-protector : no stack canary to defeat
#   -no-pie              : fixed load address, so break_the_chain() has a
#                          static, printable-in-a-writeup address
#   -O0                  : predictable stack layout / no inlining
# NX stays ON (default) -- this is ret2win, not shellcode injection.

CC      := gcc
CFLAGS  := -O0 -g -fno-stack-protector -no-pie -Wno-deprecated-declarations
BIN     := double_it
SRC     := src/double_it.c

.PHONY: all dist clean checksec

all: $(BIN)

$(BIN): $(SRC)
	$(CC) $(CFLAGS) -o $@ $<

# Assemble exactly what the player downloads: the binary + a TEST flag.
dist: $(BIN)
	cp $(BIN) dist/double_it/double_it
	printf 'flag{this_is_only_a_test_flag_run_it_on_the_server}\n' > dist/double_it/flag.txt
	cp dist/README-player.txt dist/double_it/README.txt 2>/dev/null || true
	cd dist && tar czf double_it.tar.gz double_it
	@echo "Built dist/double_it.tar.gz (what players download)."

checksec:
	@command -v checksec >/dev/null 2>&1 && checksec --file=$(BIN) || \
	  echo "install 'checksec' to inspect mitigations"

clean:
	rm -f $(BIN) dist/double_it/double_it dist/double_it/flag.txt \
	      dist/double_it/README.txt dist/double_it.tar.gz
