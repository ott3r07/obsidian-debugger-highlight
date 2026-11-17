# SOURCE: https://github.com/guyinatuxedo/nightmare/blob/HEAD/modules/41-house_of_force/bkp16_cookbook/readme.md
# (fenced code blocks containing PEDA output, verbatim; blocks separated by a line "# ---- block ----")
# ---- block ----
gef➤  b free
Breakpoint 1 at 0x8048530
gef➤  r
Starting program: /Hackery/pod/modules/house_of_force/bkp16_cookbook/cookbook
what's your name?
guyinatuxedo
+-----------------------------+
|          .--,--.            |
|          `.  ,.'            |
|           |___|             |
|           :o o:             |
|          _`~^~'             |
|        /'   ^   `\          |
| cooking manager pro v6.1... |
+-----------------------------+
====================
[l]ist ingredients
[r]ecipe book
[a]dd ingredient
[c]reate recipe
[e]xterminate ingredient
[d]elete recipe
[g]ive your cookbook a name!
[R]emove cookbook name
[q]uit
g
how long is the name of your cookbook? (hex because you're both a chef and a hacker!) : 0x50
15935728
the new name of the cookbook is 15935728

====================
[l]ist ingredients
[r]ecipe book
[a]dd ingredient
[c]reate recipe
[e]xterminate ingredient
[d]elete recipe
[g]ive your cookbook a name!
[R]emove cookbook name
[q]uit
R

[----------------------------------registers-----------------------------------]
EAX: 0x804f2b0 ("15935728\n")
EBX: 0xffffd190 --> 0x1
ECX: 0xffffd152 --> 0xa5000a52
EDX: 0xf7fb487c --> 0x0
ESI: 0x1
EDI: 0xf7fb3000 --> 0x1b5db0
EBP: 0xffffd0a8 --> 0xffffd168 --> 0xffffd178 --> 0x0
ESP: 0xffffd08c --> 0x8048b62 (add    esp,0x10)
EIP: 0xf7e6fdc0 (<free>:  push   ebx)
EFLAGS: 0x292 (carry parity ADJUST zero SIGN trap INTERRUPT direction overflow)
[-------------------------------------code-------------------------------------]
   0xf7e6fdad:  jmp    0xf7e6fbb4
   0xf7e6fdb2:  lea    esi,[esi+eiz*1+0x0]
   0xf7e6fdb9:  lea    edi,[edi+eiz*1+0x0]
=> 0xf7e6fdc0 <free>: push   ebx
   0xf7e6fdc1 <free+1>: call   0xf7f20625
   0xf7e6fdc6 <free+6>: add    ebx,0x14323a
   0xf7e6fdcc <free+12>:  sub    esp,0x8
   0xf7e6fdcf <free+15>:  mov    eax,DWORD PTR [ebx-0x98]
[------------------------------------stack-------------------------------------]
0000| 0xffffd08c --> 0x8048b62 (add    esp,0x10)
0004| 0xffffd090 --> 0x804f2b0 ("15935728\n")
0008| 0xffffd094 --> 0xf7fb3000 --> 0x1b5db0
0012| 0xffffd098 --> 0xffffd168 --> 0xffffd178 --> 0x0
0016| 0xffffd09c --> 0x8048a20 (add    esp,0x10)
0020| 0xffffd0a0 --> 0xffffd152 --> 0xa5000a52
0024| 0xffffd0a4 --> 0xa ('\n')
0028| 0xffffd0a8 --> 0xffffd168 --> 0xffffd178 --> 0x0
[------------------------------------------------------------------------------]
Legend: code, data, rodata, value
[ Legend: Modified register | Code | Heap | Stack | String ]
───────────────────────────────────────────────────────────────── registers ────
$eax   : 0x0804f2b0  →  "15935728"
$ebx   : 0xffffd190  →  0x00000001
$ecx   : 0xffffd152  →  0xa5000a52 ("R"?)
$edx   : 0xf7fb487c  →  0x00000000
$esp   : 0xffffd08c  →  0x08048b62  →   add esp, 0x10
$ebp   : 0xffffd0a8  →  0xffffd168  →  0xffffd178  →  0x00000000
$esi   : 0x1       
$edi   : 0xf7fb3000  →  0x001b5db0
$eip   : 0xf7e6fdc0  →  <free+0> push ebx
$eflags: [carry parity ADJUST zero SIGN trap INTERRUPT direction overflow resume virtualx86 identification]
$cs: 0x0023 $ss: 0x002b $ds: 0x002b $es: 0x002b $fs: 0x0000 $gs: 0x0063
───────────────────────────────────────────────────────────────────── stack ────
0xffffd08c│+0x0000: 0x08048b62  →   add esp, 0x10  ← $esp
0xffffd090│+0x0004: 0x0804f2b0  →  "15935728"
0xffffd094│+0x0008: 0xf7fb3000  →  0x001b5db0
0xffffd098│+0x000c: 0xffffd168  →  0xffffd178  →  0x00000000
0xffffd09c│+0x0010: 0x08048a20  →   add esp, 0x10
0xffffd0a0│+0x0014: 0xffffd152  →  0xa5000a52 ("R"?)
0xffffd0a4│+0x0018: 0x0000000a
0xffffd0a8│+0x001c: 0xffffd168  →  0xffffd178  →  0x00000000   ← $ebp
─────────────────────────────────────────────────────────────── code:x86:32 ────
   0xf7e6fdad                  jmp    0xf7e6fbb4
   0xf7e6fdb2                  lea    esi, [esi+eiz*1+0x0]
   0xf7e6fdb9                  lea    edi, [edi+eiz*1+0x0]
 → 0xf7e6fdc0 <free+0>         push   ebx
   0xf7e6fdc1 <free+1>         call   0xf7f20625
   0xf7e6fdc6 <free+6>         add    ebx, 0x14323a
   0xf7e6fdcc <free+12>        sub    esp, 0x8
   0xf7e6fdcf <free+15>        mov    eax, DWORD PTR [ebx-0x98]
   0xf7e6fdd5 <free+21>        mov    ecx, DWORD PTR [esp+0x10]
─────────────────────────────────────────────────────────────────── threads ────
[#0] Id 1, Name: "cookbook", stopped, reason: BREAKPOINT
───────────────────────────────────────────────────────────────────── trace ────
[#0] 0xf7e6fdc0 → free()
[#1] 0x8048b62 → add esp, 0x10
[#2] 0x8048a7b → jmp 0x8048b42
[#3] 0x804a426 → call 0x8049bed
[#4] 0xf7e15276 → __libc_start_main()
[#5] 0x8048621 → hlt
────────────────────────────────────────────────────────────────────────────────

Breakpoint 1, 0xf7e6fdc0 in free () from /lib/i386-linux-gnu/libc.so.6
gef➤  s
# ---- block ----
[----------------------------------registers-----------------------------------]
EAX: 0xf7fb48b0 --> 0x0
EBX: 0xf7fb3000 --> 0x1b5db0
ECX: 0x804f2b0 ("15935728\n")
EDX: 0xf7fb487c --> 0x0
ESI: 0x1
EDI: 0xf7fb3000 --> 0x1b5db0
EBP: 0xffffd0a8 --> 0xffffd168 --> 0xffffd178 --> 0x0
ESP: 0xffffd080 --> 0x804f2b0 ("15935728\n")
EIP: 0xf7e6fdd9 (<free+25>: mov    eax,DWORD PTR [eax])
EFLAGS: 0x282 (carry parity adjust zero SIGN trap INTERRUPT direction overflow)
[-------------------------------------code-------------------------------------]
   0xf7e6fdcc <free+12>:  sub    esp,0x8
   0xf7e6fdcf <free+15>:  mov    eax,DWORD PTR [ebx-0x98]
   0xf7e6fdd5 <free+21>:  mov    ecx,DWORD PTR [esp+0x10]
=> 0xf7e6fdd9 <free+25>:  mov    eax,DWORD PTR [eax]
   0xf7e6fddb <free+27>:  test   eax,eax
   0xf7e6fddd <free+29>:  jne    0xf7e6fe50 <free+144>
   0xf7e6fddf <free+31>:  test   ecx,ecx
   0xf7e6fde1 <free+33>:  je     0xf7e6fe5d <free+157>
[------------------------------------stack-------------------------------------]
0000| 0xffffd080 --> 0x804f2b0 ("15935728\n")
0004| 0xffffd084 --> 0xf7e6fdc6 (<free+6>:  add    ebx,0x14323a)
0008| 0xffffd088 --> 0xffffd190 --> 0x1
0012| 0xffffd08c --> 0x8048b62 (add    esp,0x10)
0016| 0xffffd090 --> 0x804f2b0 ("15935728\n")
0020| 0xffffd094 --> 0xf7fb3000 --> 0x1b5db0
0024| 0xffffd098 --> 0xffffd168 --> 0xffffd178 --> 0x0
0028| 0xffffd09c --> 0x8048a20 (add    esp,0x10)
[------------------------------------------------------------------------------]
Legend: code, data, rodata, value
[ Legend: Modified register | Code | Heap | Stack | String ]
───────────────────────────────────────────────────────────────── registers ────
$eax   : 0xf7fb48b0  →  0x00000000
$ebx   : 0xf7fb3000  →  0x001b5db0
$ecx   : 0x0804f2b0  →  "15935728"
$edx   : 0xf7fb487c  →  0x00000000
$esp   : 0xffffd080  →  0x0804f2b0  →  "15935728"
$ebp   : 0xffffd0a8  →  0xffffd168  →  0xffffd178  →  0x00000000
$esi   : 0x1       
$edi   : 0xf7fb3000  →  0x001b5db0
$eip   : 0xf7e6fdd9  →  <free+25> mov eax, DWORD PTR [eax]
$eflags: [carry parity adjust zero SIGN trap INTERRUPT direction overflow resume virtualx86 identification]
$cs: 0x0023 $ss: 0x002b $ds: 0x002b $es: 0x002b $fs: 0x0000 $gs: 0x0063
───────────────────────────────────────────────────────────────────── stack ────
0xffffd080│+0x0000: 0x0804f2b0  →  "15935728"  ← $esp
0xffffd084│+0x0004: 0xf7e6fdc6  →  <free+6> add ebx, 0x14323a
0xffffd088│+0x0008: 0xffffd190  →  0x00000001
0xffffd08c│+0x000c: 0x08048b62  →   add esp, 0x10
0xffffd090│+0x0010: 0x0804f2b0  →  "15935728"
0xffffd094│+0x0014: 0xf7fb3000  →  0x001b5db0
0xffffd098│+0x0018: 0xffffd168  →  0xffffd178  →  0x00000000
0xffffd09c│+0x001c: 0x08048a20  →   add esp, 0x10
─────────────────────────────────────────────────────────────── code:x86:32 ────
   0xf7e6fdcc <free+12>        sub    esp, 0x8
   0xf7e6fdcf <free+15>        mov    eax, DWORD PTR [ebx-0x98]
   0xf7e6fdd5 <free+21>        mov    ecx, DWORD PTR [esp+0x10]
 → 0xf7e6fdd9 <free+25>        mov    eax, DWORD PTR [eax]
   0xf7e6fddb <free+27>        test   eax, eax
   0xf7e6fddd <free+29>        jne    0xf7e6fe50 <free+144>
   0xf7e6fddf <free+31>        test   ecx, ecx
   0xf7e6fde1 <free+33>        je     0xf7e6fe5d <free+157>
   0xf7e6fde3 <free+35>        lea    edx, [ecx-0x8]
─────────────────────────────────────────────────────────────────── threads ────
[#0] Id 1, Name: "cookbook", stopped, reason: SINGLE STEP
───────────────────────────────────────────────────────────────────── trace ────
[#0] 0xf7e6fdd9 → free()
[#1] 0x8048b62 → add esp, 0x10
[#2] 0x8048a7b → jmp 0x8048b42
[#3] 0x804a426 → call 0x8049bed
[#4] 0xf7e15276 → __libc_start_main()
[#5] 0x8048621 → hlt
────────────────────────────────────────────────────────────────────────────────
0xf7e6fdd9 in free () from /lib/i386-linux-gnu/libc.so.6
gef➤  p $eax
$1 = 0xf7fb48b0
gef➤  x/w 0xf7fb48b0
0xf7fb48b0 <__free_hook>: 0x00000000
gef➤  vmmap
Start      End        Offset     Perm Path
0x08048000 0x0804c000 0x00000000 r-x /Hackery/pod/modules/house_of_force/bkp16_cookbook/cookbook
0x0804c000 0x0804d000 0x00003000 r-- /Hackery/pod/modules/house_of_force/bkp16_cookbook/cookbook
0x0804d000 0x0804e000 0x00004000 rw- /Hackery/pod/modules/house_of_force/bkp16_cookbook/cookbook
0x0804e000 0x0806f000 0x00000000 rw- [heap]
0xf7dfd000 0xf7fb1000 0x00000000 r-x /lib/i386-linux-gnu/libc-2.24.so
0xf7fb1000 0xf7fb3000 0x001b3000 r-- /lib/i386-linux-gnu/libc-2.24.so
0xf7fb3000 0xf7fb4000 0x001b5000 rw- /lib/i386-linux-gnu/libc-2.24.so
0xf7fb4000 0xf7fb7000 0x00000000 rw-
0xf7fd2000 0xf7fd5000 0x00000000 rw-
0xf7fd5000 0xf7fd7000 0x00000000 r-- [vvar]
0xf7fd7000 0xf7fd9000 0x00000000 r-x [vdso]
0xf7fd9000 0xf7ffc000 0x00000000 r-x /lib/i386-linux-gnu/ld-2.24.so
0xf7ffc000 0xf7ffd000 0x00022000 r-- /lib/i386-linux-gnu/ld-2.24.so
0xf7ffd000 0xf7ffe000 0x00023000 rw- /lib/i386-linux-gnu/ld-2.24.so
0xfffdd000 0xffffe000 0x00000000 rw- [stack]
# ---- block ----
[----------------------------------registers-----------------------------------]
EAX: 0x30303030 ('0000')
EBX: 0xf7fb3000 --> 0x1b5db0
ECX: 0x804f2b0 ("15935728\n")
EDX: 0xf7fb487c --> 0x0
ESI: 0x1
EDI: 0xf7fb3000 --> 0x1b5db0
EBP: 0xffffd0a8 --> 0xffffd168 --> 0xffffd178 --> 0x0
ESP: 0xffffd06c --> 0xf7e6fe5a (<free+154>: add    esp,0x10)
EIP: 0x30303030 ('0000')
EFLAGS: 0x296 (carry PARITY ADJUST zero SIGN trap INTERRUPT direction overflow)
[-------------------------------------code-------------------------------------]
Invalid $PC address: 0x30303030
[------------------------------------stack-------------------------------------]
0000| 0xffffd06c --> 0xf7e6fe5a (<free+154>:  add    esp,0x10)
0004| 0xffffd070 --> 0x804f2b0 ("15935728\n")
0008| 0xffffd074 --> 0x8048b62 (add    esp,0x10)
0012| 0xffffd078 --> 0xf7fb487c --> 0x0
0016| 0xffffd07c --> 0xf7e6fdc0 (<free>:  push   ebx)
0020| 0xffffd080 --> 0x804f2b0 ("15935728\n")
0024| 0xffffd084 --> 0xf7e6fdc6 (<free+6>:  add    ebx,0x14323a)
0028| 0xffffd088 --> 0xffffd190 --> 0x1
[------------------------------------------------------------------------------]
Legend: code, data, rodata, value
[ Legend: Modified register | Code | Heap | Stack | String ]
───────────────────────────────────────────────────────────────── registers ────
$eax   : 0x30303030 ("0000"?)
$ebx   : 0xf7fb3000  →  0x001b5db0
$ecx   : 0x0804f2b0  →  "15935728"
$edx   : 0xf7fb487c  →  0x00000000
$esp   : 0xffffd06c  →  0xf7e6fe5a  →  <free+154> add esp, 0x10
$ebp   : 0xffffd0a8  →  0xffffd168  →  0xffffd178  →  0x00000000
$esi   : 0x1       
$edi   : 0xf7fb3000  →  0x001b5db0
$eip   : 0x30303030 ("0000"?)
$eflags: [carry PARITY ADJUST zero SIGN trap INTERRUPT direction overflow resume virtualx86 identification]
$cs: 0x0023 $ss: 0x002b $ds: 0x002b $es: 0x002b $fs: 0x0000 $gs: 0x0063
───────────────────────────────────────────────────────────────────── stack ────
0xffffd06c│+0x0000: 0xf7e6fe5a  →  <free+154> add esp, 0x10  ← $esp
0xffffd070│+0x0004: 0x0804f2b0  →  "15935728"
0xffffd074│+0x0008: 0x08048b62  →   add esp, 0x10
0xffffd078│+0x000c: 0xf7fb487c  →  0x00000000
0xffffd07c│+0x0010: 0xf7e6fdc0  →  <free+0> push ebx
0xffffd080│+0x0014: 0x0804f2b0  →  "15935728"
0xffffd084│+0x0018: 0xf7e6fdc6  →  <free+6> add ebx, 0x14323a
0xffffd088│+0x001c: 0xffffd190  →  0x00000001
─────────────────────────────────────────────────────────────── code:x86:32 ────
[!] Cannot disassemble from $PC
[!] Cannot access memory at address 0x30303030
─────────────────────────────────────────────────────────────────── threads ────
[#0] Id 1, Name: "cookbook", stopped, reason: SINGLE STEP
───────────────────────────────────────────────────────────────────── trace ────
────────────────────────────────────────────────────────────────────────────────
0x30303030 in ?? ()
gef➤  
