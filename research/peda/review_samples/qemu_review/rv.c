#include <stdio.h>
#include <stdlib.h>
#include <string.h>
void *gself;                 /* global self-pointer */
long gcounter = 1;
const char *quote = "it's a 'quoted' string";
const char *longstr = "LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLX";
struct node { struct node *next; long v; };
__attribute__((noinline)) void probe(char *buf, void **a, void **b, long v) {
    asm volatile("mov %0, %%r12" :: "r"(v) : "r12");
    asm volatile("mov %0, %%r13" :: "r"(quote) : "r13");
    asm volatile("mov %0, %%r14" :: "r"(longstr) : "r14");
    asm volatile("nop");
}
__attribute__((noinline)) void spin(void) { asm volatile("1: jmp 1b"); }
int main(int argc, char **argv) {
    char buf[96];
    void *a, *b;
    void *self;
    memset(buf, 'A', 80); strcpy(buf + 80, "BBBB");
    a = &b; b = &a; self = &self; gself = &gself;
    struct node *n1 = malloc(sizeof *n1), *n2 = malloc(sizeof *n2);
    n1->next = n2; n2->next = n1; n1->v = 0x2000; n2->v = 0x0a00;
    probe(buf, &a, &self, 0x2000);
    gcounter += 5;
    puts(buf);
    if (argc > 1) spin();
    return 0;
}
