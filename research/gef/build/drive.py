#!/usr/bin/env python3
"""Drive gdb+GEF in a pty; send each command after the prompt; save per-command ANSI + plain captures.
usage: drive.py OUTDIR PREFIX CMDFILE -- gdb args...
CMDFILE lines: "name<TAB>command"  (name used for the capture filename; '-' = don't save separately)
"""
import os, pty, sys, re, select, time, fcntl, termios, struct
outdir, prefix, cmdfile = sys.argv[1:4]
argv = sys.argv[sys.argv.index('--')+1:]
ANSI = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|[\x01\x02]')
PROMPT = re.compile(r'gef➤\s*$')
pid, fd = pty.fork()
if pid == 0:
    os.environ['TERM'] = 'xterm-256color'; os.environ['COLUMNS']='110'; os.environ['LINES']='50'
    os.execvp(argv[0], argv)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 110, 0, 0))
def read_until_prompt(timeout=60):
    buf = b''; t0 = time.time()
    while time.time()-t0 < timeout:
        r,_,_ = select.select([fd],[],[],0.5)
        if r:
            try: d = os.read(fd, 65536)
            except OSError: break
            if not d: break
            buf += d
            plain = ANSI.sub('', buf.decode('utf-8','replace'))
            if PROMPT.search(plain):
                # make sure nothing else is coming
                r2,_,_ = select.select([fd],[],[],0.4)
                if not r2: return buf
    return buf
def plain(b):
    s = ANSI.sub('', b.decode('utf-8','replace')).replace('\r\n','\n').replace('\r','')
    return s
full = b''
first = read_until_prompt(90)
full += first
open(os.path.join(outdir, f'{prefix}_startup.ansi'),'wb').write(first)
open(os.path.join(outdir, f'{prefix}_startup.txt'),'w').write(plain(first))
for line in open(cmdfile):
    line=line.rstrip('\n')
    if not line or line.startswith('#'): continue
    name, cmd = line.split('\t',1)
    os.write(fd, (cmd+'\n').encode())
    out = read_until_prompt(120)
    full += out
    if name != '-':
        # prepend previous prompt so capture shows "gef➤  cmd"
        prev_prompt = full[:len(full)-len(out)]
        m = prev_prompt.rfind(b'\n')
        body = out[:out.rfind(b'\n')+1] if b'\n' in out else out
        chunk = prev_prompt[m+1:] + body
        fn = os.path.join(outdir, f'{name}_{prefix}')
        mode = 'ab' if os.path.exists(fn+'.ansi') else 'wb'
        open(fn+'.ansi', mode).write(chunk)
        open(fn+'.txt', mode[0]).write(plain(chunk))
os.write(fd, b'quit\n'); time.sleep(0.5)
try: os.write(fd, b'y\n')
except OSError: pass
time.sleep(0.5)
try:
    while True:
        r,_,_=select.select([fd],[],[],1)
        if not r: break
        d=os.read(fd,65536)
        if not d: break
        full+=d
except OSError: pass
open(os.path.join(outdir, f'session_{prefix}.ansi'),'wb').write(full)
open(os.path.join(outdir, f'session_{prefix}.txt'),'w').write(plain(full))
