#!/usr/bin/env python3
"""Render SPEC.template.md -> ../SPEC.md, replacing
   @@G <file> <n> <regex>   first n capture lines matching regex
   @@L <file> <n> <regex>   n consecutive lines starting at first match
with verbatim lines from ../captures/<file>. Fails loudly on no match."""
import re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
cap = os.path.join(here, "..", "captures")
out, missing = [], []
for line in open(os.path.join(here, "SPEC.template.md")).read().split("\n"):
    if line.startswith(("@@G ", "@@L ", "@@K ")):
        kind = line[:3]
        if kind == "@@K":   # @@K file n back regex : n lines starting `back` lines before first match
            fname, n, back, rx = line[4:].split(" ", 3); back = int(back)
        else:
            fname, n, rx = line[4:].split(" ", 2); back = 0
        n = int(n)
        lines = open(os.path.join(cap, fname)).read().split("\n")
        r = re.compile(rx)
        got = []
        if kind == "@@G":
            got = [l for l in lines if r.search(l)][:n]
        else:
            for i, l in enumerate(lines):
                if r.search(l):
                    got = lines[i - back:i - back + n]; break
        if not got:
            missing.append(line); out.append("<<MISSING " + line + ">>"); continue
        out.extend(got)
    else:
        out.append(line)
open(os.path.join(here, "..", "SPEC.md"), "w").write("\n".join(out))
print("missing:", *missing, sep="\n  ")
