import sys,re,html
d=open(sys.argv[1],encoding='utf-8',errors='replace').read()
blocks=re.findall(r'<pre[^>]*>(.*?)</pre>',d,re.S) or re.findall(r'<code[^>]*>(.*?)</code>',d,re.S)
if not blocks and '<html' not in d[:500].lower(): blocks=[d]
for b in blocks:
    t=html.unescape(re.sub(r'<br\s*/?>','\n',re.sub(r'<(?!br)[^>]+>','',b)))
    if re.search(r'gdb-peda|Legend: code|\[-{20,}(registers|code|stack)', t):
        print(t.rstrip('\n')); print('=====BLOCK=====')
