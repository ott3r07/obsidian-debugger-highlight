#!/usr/bin/env python3
"""Strip ANSI/terminal control sequences from a `script` capture -> plain text
(what a user gets when copying from the terminal). Usage: strip_ansi.py in.ansi out.txt"""
import re, sys
data = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
data = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", data)   # CSI (colors, ?2004h bracketed paste, 2J/H clear)
data = re.sub(r"\x1b\][^\x07]*\x07", "", data)       # OSC
data = data.replace("\r\n", "\n").replace("\r", "")
data = re.sub(r"[\x01\x02]", "", data)               # readline prompt markers, if any
open(sys.argv[2], "w").write(data)
