#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*op_fn)(int, int);

const char *greeting = "Hello, pwndbg!";
char global_buf[64] = "global data string";

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }

int compute(op_fn f, int x, int y) {
    int r = f(x, y);
    return r;
}

void vuln(const char *src) {
    char buf[32];
    strcpy(buf, src);
    printf("buf=%s\n", buf);
}

int main(int argc, char **argv) {
    char stackbuf[48];
    op_fn fp = add;
    void *small[8], *mid[3], *big[2];
    int i;

    strcpy(stackbuf, "AAAAAAAABBBBBBBBCCCCCCCC");
    for (i = 0; i < 8; i++) small[i] = malloc(0x20);
    for (i = 0; i < 3; i++) mid[i] = malloc(0x80);
    for (i = 0; i < 2; i++) big[i] = malloc(0x500);
    strcpy((char *)small[0], "heap string here");
    for (i = 0; i < 8; i++) free(small[i]);   /* 7 -> tcache, 1 -> fastbin */
    free(mid[0]);
    free(big[0]);                             /* -> unsorted bin */
    int r = compute(fp, 6, 7);
    fp = mul;
    r += compute(fp, r, 2);
    printf("%s %s r=%d stack=%s\n", greeting, global_buf, r, stackbuf);
    vuln(argc > 1 ? argv[1] : "short");
    return 0;
}
