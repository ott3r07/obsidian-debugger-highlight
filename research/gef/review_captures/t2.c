#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int argc, char **argv) {
    void *t[7], *s1, *s2, *g1, *l1, *g2, *x;
    char fmt[64];
    int i;
    for (i = 0; i < 7; i++) t[i] = malloc(0xf8);
    s1 = malloc(0xf8); g1 = malloc(0x18);
    s2 = malloc(0xf8); g2 = malloc(0x18);
    l1 = malloc(0x800); x = malloc(0x18);
    for (i = 0; i < 7; i++) free(t[i]);
    free(s1); free(s2); free(l1);
    x = malloc(0x1000);              /* sorts unsorted -> small + large bins */
    puts("bins ready");
    strcpy(fmt, argc > 1 ? argv[1] : "%p %p %p\n");
    printf(fmt);
    return 0;
}
