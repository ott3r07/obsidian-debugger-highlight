# SOURCE: https://github.com/guyinatuxedo/nightmare/blob/HEAD/modules/38-grab_bad/hackim19_shop/readme.md
# (fenced code blocks containing PEDA output, verbatim; blocks separated by a line "# ---- block ----")
# ---- block ----
Legend: code, data, rodata, value
Stopped reason: SIGINT
0x00007ffff7af4081 in __GI___libc_read (fd=0x0, buf=0x7fffffffdf80, nbytes=0x2)
    at ../sysdeps/unix/sysv/linux/read.c:27
27    ../sysdeps/unix/sysv/linux/read.c: No such file or directory.
gdb-peda$ find 15935728
Searching for '15935728' in: None ranges
Found 1 results, display max 1 items:
[heap] : 0x603360 ("15935728\n3`")
gdb-peda$ x/x 0x603360
0x603360:    0x31
gdb-peda$ x/5g 0x603360
0x603360:    0x3832373533393531    0x000000000060330a
0x603370:    0x0000000000000005    0x6867697279706f43
0x603380:    0x6f436c6c754e2074
