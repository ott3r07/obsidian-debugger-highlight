FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    qemu-user gdb-multiarch gcc-x86-64-linux-gnu libc6-dev-amd64-cross gcc-i686-linux-gnu libc6-dev-i386-cross \
    git ca-certificates python3 python3-six bsdutils procps file binutils-x86-64-linux-gnu nasm \
 && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/longld/peda.git /opt/peda && git -C /opt/peda checkout -q 84d38bda505941ba823db7f6c1bcca1e485a2d43 && git -C /opt/peda log -1 --format='%H %cd' > /opt/peda/COMMIT
# Accommodation 1: bundled lib/six.py (v1.9.0) breaks on Python 3.12 ("No module named 'six.moves'").
#   Replace with distro six (1.16). Original kept as six.py.orig.
RUN cp /opt/peda/lib/six.py /opt/peda/lib/six.py.orig && cp /usr/lib/python3/dist-packages/six.py /opt/peda/lib/six.py
# Accommodation 3: PEDA shells out to /usr/bin/readelf and /usr/bin/objdump (lib/config.py:17-18)
#   for checksec/elfsymbol/xrefs; point them at the x86-64 cross binutils.
RUN ln -sf /usr/bin/x86_64-linux-gnu-readelf /usr/bin/readelf && ln -sf /usr/bin/x86_64-linux-gnu-objdump /usr/bin/objdump
RUN echo "source /opt/peda/peda.py" > /root/.gdbinit
# Silence Python 3.12 SyntaxWarnings (invalid escape sequences in peda.py regexes)
ENV PYTHONWARNINGS=ignore
WORKDIR /work
