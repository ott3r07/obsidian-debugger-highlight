#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*op_fn)(int, int);
const char *greeting = "Hello, PEDA highlighter!";
int global_counter = 42;

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }

int compute(op_fn f, int x, int y) {
    int r = f(x, y);
    global_counter += r;
    return r;
}

void vuln(const char *src) {
    char buf[32];
    strcpy(buf, src);
    printf("buf: %s\n", buf);
}

int main(int argc, char **argv) {
    char stackbuf[64];
    op_fn fp = (argc > 2) ? mul : add;
    char *heap = malloc(64);
    strcpy(heap, "heap string AAAABBBB");
    strncpy(stackbuf, greeting, sizeof(stackbuf));
    int r = compute(fp, 6, 7);
    printf("%s %s %d\n", stackbuf, heap, r);
    if (argc > 1) vuln(argv[1]);
    free(heap);
    return 0;
}
