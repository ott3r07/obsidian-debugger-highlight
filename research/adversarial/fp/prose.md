# Exploiting the binary

First we set a breakpoint at main and run. The program received signal SIGSEGV when
rip pointed into the heap. Note: the stack is at 0x7fffffffe000 and the heap at
0x555555559000 — PIE is enabled, NX enabled, Canary found.

> Breakpoint 1 is where we stop. Then `x/20gx $rsp` shows the stack.

- [x] leak libc
- [ ] overwrite __free_hook → system
1. call puts@plt
2. ret to main

| reg | value |
|-----|-------|
| rax | 0x0   |
| rip | 0x401136 <main+4> |

Warning: this is a warning in prose. Error: so is this.
[+] Done! [*] info [!] bad
The program is not being run.
In this function, we mov eax, 1 then ret.
Thread 1 hit Breakpoint 2, which is nice.
