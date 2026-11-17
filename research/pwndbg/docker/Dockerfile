FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates sudo curl wget file python3 python3-venv python3-dev \
      gdb gdb-multiarch gcc libc6-dbg build-essential \
      qemu-user gcc-x86-64-linux-gnu libc6-dev-amd64-cross \
      bsdutils util-linux procps && rm -rf /var/lib/apt/lists/*
# Captures were made with pwndbg 2026.10.28+ at commit 389764e; set PWNDBG_REF=dev for latest.
ARG PWNDBG_REF=389764e4711c8a650605d91f75c2d3a30f7f433d
RUN git clone https://github.com/pwndbg/pwndbg /opt/pwndbg \
 && cd /opt/pwndbg && git checkout "$PWNDBG_REF" && ./setup.sh
# Ubuntu 24.04's qemu-user 8.2.2 crashes (QEMU internal SIGSEGV) when pwndbg reads
# /proc/<tid>/smaps over the gdbstub (vFile:open). Use a newer static qemu-x86_64 (10.2.3 at time of writing).
COPY --from=tonistiigi/binfmt:latest /usr/bin/qemu-x86_64 /usr/local/bin/qemu-x86_64
ENV PWNDBG_NO_AUTOUPDATE=1
RUN echo 'set enable-bracketed-paste off' > /root/.inputrc
WORKDIR /work
