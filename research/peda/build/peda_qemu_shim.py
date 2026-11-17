# Accommodation 2 (test harness only): make PEDA's vmmap / memory-type colouring work
# against a qemu-user gdbstub.
#  * PEDA's Linux remote path (peda.py:1480-1490) does `remote get /proc/<pid>/maps`; under
#    qemu-user that returns the *host* qemu process maps (aarch64 libs), so every address
#    colour (code/data/rodata) is wrong.
#  * The guest cannot read /proc/self/maps itself either: qemu 8.2.2 crashes
#    ("QEMU internal SIGSEGV {code=MAPERR, addr=0x20}").
# So qemu is started with `-d page -D $PEDA_QEMU_PAGELOG`; it logs the full guest page table
# ("page layout changed following mmap") after every mapping change. We parse the LAST table
# and attach names: main image range = [AT_PHDR - e_phoff, +PT_LOAD span] -> exe path;
# shared libs found by walking DT_DEBUG -> r_debug -> link_map (gdb registers no solibs over
# the qemu-user stub) -> lib path (and add-symbol-file'd); other `info files` sections -> exe;
# range containing $sp -> [stack]; first unnamed rw range after the exe -> [heap];
# 0xffffffffff600000 -> [vsyscall]; anything else -> "mapped" (same default as PEDA).
import os, re, struct
_solib_loaded = set()

def _read_cstr(inf, addr):
    data = b""
    while len(data) < 512:
        chunk = bytes(inf.read_memory(addr + len(data), 64))
        if b"\0" in chunk:
            return (data + chunk.split(b"\0")[0]).decode(errors="replace")
        data += chunk
    return data.decode(errors="replace")

def _elf_info(path):
    # (e_phoff, lowest PT_LOAD vaddr, page-aligned end of PT_LOAD image) for ELF32/ELF64
    with open(path, "rb") as f:
        h = f.read(64)
        is64 = h[4] == 2
        if is64:
            phoff, = struct.unpack_from("<Q", h, 0x20)
            phentsize, phnum = struct.unpack_from("<HH", h, 0x36)
        else:
            phoff, = struct.unpack_from("<I", h, 0x1c)
            phentsize, phnum = struct.unpack_from("<HH", h, 0x2a)
        f.seek(phoff)
        ph = f.read(phentsize * phnum)
    lo, end = None, 0
    for i in range(phnum):
        o = i * phentsize
        p_type, = struct.unpack_from("<I", ph, o)
        if p_type == 1:
            if is64:
                vaddr, = struct.unpack_from("<Q", ph, o + 0x10)
                memsz, = struct.unpack_from("<Q", ph, o + 0x28)
            else:
                vaddr, = struct.unpack_from("<I", ph, o + 0x08)
                memsz, = struct.unpack_from("<I", ph, o + 0x14)
            lo = vaddr if lo is None else min(lo, vaddr)
            end = max(end, vaddr + memsz)
    return phoff, (lo or 0) & ~0xfff, (end + 0xfff) & ~0xfff

def _elf_span(path):
    _, lo, end = _elf_info(path)
    return end - lo

def _exe_range(exe):
    # main image = [AT_PHDR - e_phoff, + PT_LOAD span]
    try:
        out = gdb.execute("info auxv", to_string=True)
        m = re.search(r"AT_PHDR\s.*?(0x[0-9a-f]+)\s*$", out, re.M)
        phoff, lo, end = _elf_info(exe)
        start = int(m.group(1), 16) - phoff
        return (start, start + (end - lo), exe)
    except Exception:
        return None

def _guest_solibs(exe_base=0):
    # gdb does not see shared libraries over the qemu-user gdbstub ("No shared libraries
    # loaded at this time."), so walk r_debug->link_map ourselves (x86_64 only) and
    # add-symbol-file each library so symbols like <printf+0> resolve.
    libs = []
    try:
        out = gdb.execute("info files", to_string=True)
        m = re.search(r"(0x[0-9a-f]+) - 0x[0-9a-f]+ is \.dynamic\n", out)
        if not m or peda.getarch()[1] != 64:
            return libs
        inf = gdb.selected_inferior()
        dyn = int(m.group(1), 16)
        if dyn < exe_base:  # gdb's `info files` is not relocated for PIE under qemu-user
            dyn += exe_base
        r_debug = None
        for i in range(128):
            tag, val = struct.unpack("<QQ", bytes(inf.read_memory(dyn + 16 * i, 16)))
            if tag == 0:
                break
            if tag == 21:  # DT_DEBUG
                r_debug = val
        if not r_debug:
            return libs
        lm, = struct.unpack("<Q", bytes(inf.read_memory(r_debug + 8, 8)))
        sysroot = gdb.parameter("sysroot") or ""
        while lm:
            l_addr, l_name, l_ld, l_next = struct.unpack("<QQQQ", bytes(inf.read_memory(lm, 32)))
            name = _read_cstr(inf, l_name) if l_name else ""
            if name.startswith("/"):
                host = None
                for cand in (sysroot + name, sysroot + "/lib/" + os.path.basename(name), name):
                    if os.path.exists(cand):
                        host = cand
                        break
                if host:
                    libs.append((l_addr, l_addr + _elf_span(host), name))
                    if name not in _solib_loaded:
                        _solib_loaded.add(name)
                        gdb.execute("add-symbol-file %s -o 0x%x" % (host, l_addr), to_string=True)
            lm = l_next
    except Exception:
        pass
    return libs
_orig_get_vmmap = PEDA.get_vmmap

def _guest_maps(self):
    path = os.environ.get("PEDA_QEMU_PAGELOG")
    if not path or not os.path.exists(path):
        return None
    data = open(path).read()
    idx = max(data.rfind("\nstart "), data.rfind("start "))
    if idx < 0:
        return None
    rows = re.findall(r"^([0-9a-f]{8,16})-([0-9a-f]{8,16}) [0-9a-f]{8,16} ([rwx-]{3})$", data[idx:], re.M)
    out = gdb.execute("info files", to_string=True)
    secs = []
    exe = self.getfile()
    for m in re.finditer(r"(0x[0-9a-f]+) - (0x[0-9a-f]+) is (\S+)(?: in (\S+))?", out):
        secs.append((int(m.group(1), 16), int(m.group(2), 16), m.group(4) or exe))
    er = _exe_range(exe)
    exe_base = 0
    if er:
        secs.insert(0, er)
        exe_base = er[0] - _elf_info(exe)[1]
    for (ls, le, ln) in _guest_solibs(exe_base):
        secs.append((ls, le, ln))
    try:
        sp = int(self.getreg("sp"))
    except Exception:
        sp = None
    maps = []
    exe_end = None
    exe_secs = [x for x in secs if x[2] == exe]
    exe_sec_end = ((max(x[1] for x in exe_secs) + 0xfff) & ~0xfff) if exe_secs else None
    split = []
    for (s, e, p) in rows:
        s, e = int(s, 16), int(e, 16)
        # brk heap directly follows .bss in the same qemu page run: split it off
        if exe_sec_end and s < exe_sec_end < e and "rw" in p:
            split += [(s, exe_sec_end, p), (exe_sec_end, e, p)]
        else:
            split += [(s, e, p)]
    for (s, e, p) in split:
        if p == "---":
            continue
        name = None
        for (ss, se, f) in secs:
            if ss < e and se > s:
                name = f
                break
        if name is None and sp is not None and s <= sp < e:
            name = "[stack]"
        if name is None and s == 0xffffffffff600000:
            name = "[vsyscall]"
        if name is None and exe_end is not None and "rw" in p and s - exe_end < 0x10000000 and s >= exe_end \
                and not any(m[3] == "[heap]" for m in maps):
            name = "[heap]"
        if name is None:
            name = "mapped"
        if name == exe:
            exe_end = e
        maps.append((s, e, p + "p", name))
    return maps

def _shim_get_vmmap(self, name=None):
    if not self.getpid():
        return _orig_get_vmmap(self, name)
    maps = _guest_maps(self)
    if maps is None:
        return _orig_get_vmmap(self, name)
    if name == "binary":
        name = self.getfile()
    if name is None or name == "all":
        name = ""
    if to_int(name) is None:
        return [m for m in maps if name in m[3]]
    addr = to_int(name)
    return [m for m in maps if m[0] <= addr < m[1]]

PEDA.get_vmmap = memoized(_shim_get_vmmap)  # keep PEDA cache semantics (reset_cache resets it)
