import sys,re
src,url,out=sys.argv[1:4]
d=open(src,encoding='utf-8',errors='replace').read()
if src.endswith('.txt') and '```' not in d: blocks=[d]
else: blocks=re.findall(r'^[ \t]*(?:```|~~~)[^\n]*\n(.*?)^[ \t]*(?:```|~~~)',d,re.S|re.M)
keep=[b for b in blocks if re.search(r'gdb-peda\$|Legend: code|\[-{20,}(registers|code|stack)',b)]
with open(out,'w') as f:
    f.write('# SOURCE: %s\n# (fenced code blocks containing PEDA output, verbatim; blocks separated by a line "# ---- block ----")\n'%url)
    for b in keep: f.write('# ---- block ----\n'+b.rstrip('\n')+'\n')
print(out,len(keep))
