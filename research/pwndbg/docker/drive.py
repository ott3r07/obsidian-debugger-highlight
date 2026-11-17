#!/usr/bin/env python3
"""Drive gdb interactively in a pty; save full transcript + per-command chunks.
usage: drive.py OUTDIR ARCHTAG CMDFILE -- gdb args...
CMDFILE lines: "slug|command" (slug may be empty -> not saved separately).
"""
import os, pty, sys, re, time, select, fcntl, termios, struct

ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>]|[\x01\x02]')
PROMPT = re.compile(r'(pwndbg> |\(gdb\) |\(y or n\) (\[answered [YN];[^]]*\] *)?)$')

def strip(s):
    s = ANSI.sub('', s)
    s = s.replace('\r\n', '\n')
    # resolve lone \r (readline redraw) by keeping text after last \r per line
    s = '\n'.join(l.split('\r')[-1] if '\r' in l else l for l in s.split('\n'))
    return s

def main():
    outdir, arch, cmdfile = sys.argv[1:4]
    argv = sys.argv[sys.argv.index('--') + 1:]
    os.makedirs(outdir, exist_ok=True)
    pid, fd = pty.fork()
    if pid == 0:
        os.environ['TERM'] = 'xterm-256color'
        os.environ['COLUMNS'] = '120'; os.environ['LINES'] = '50'
        os.execvp(argv[0], argv)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 120, 0, 0))
    buf = ''
    def read_until_prompt(timeout):
        nonlocal buf
        out = ''
        end = time.time() + timeout
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.3)
            if r:
                try: d = os.read(fd, 65536).decode('utf-8', 'replace')
                except OSError: return out, True
                if not d: return out, True
                out += d
                if PROMPT.search(strip(out)):
                    # settle
                    time.sleep(0.3)
                    r2, _, _ = select.select([fd], [], [], 0.2)
                    if r2: continue
                    return out, False
        return out, False
    transcript = ''
    first, dead = read_until_prompt(60)
    transcript += first
    with open(os.path.join(outdir, f'startup_{arch}.ansi'), 'w') as f: f.write(first)
    with open(os.path.join(outdir, f'startup_{arch}.txt'), 'w') as f: f.write(strip(first))
    prompt_txt = first[first.rfind('\n')+1:]
    for line in open(cmdfile):
        line = line.rstrip('\n')
        if not line or line.startswith('#'): continue
        slug, cmd = line.split('|', 1)
        timeout = 60
        os.write(fd, (cmd + '\n').encode())
        out, dead = read_until_prompt(timeout)
        transcript += out
        # chunk = previous prompt + echoed cmd + output (minus trailing prompt)
        body = out
        last_nl = body.rfind('\n')
        if not dead and last_nl >= 0:
            next_prompt = body[last_nl+1:]
            body = body[:last_nl+1]
        else:
            next_prompt = ''
        chunk = prompt_txt + body
        prompt_txt = next_prompt or prompt_txt
        if slug:
            with open(os.path.join(outdir, f'{slug}_{arch}.ansi'), 'w') as f: f.write(chunk)
            with open(os.path.join(outdir, f'{slug}_{arch}.txt'), 'w') as f: f.write(strip(chunk))
        if dead: break
    try:
        os.write(fd, b'quit\n'); time.sleep(0.5); os.write(fd, b'y\n')
    except OSError: pass
    time.sleep(0.5)
    sess = os.path.basename(cmdfile).rsplit('.', 1)[0]
    with open(os.path.join(outdir, f'_session_{sess}_{arch}.ansi'), 'w') as f: f.write(transcript)
    with open(os.path.join(outdir, f'_session_{sess}_{arch}.txt'), 'w') as f: f.write(strip(transcript))

main()
