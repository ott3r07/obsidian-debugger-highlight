FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl file python3 \
      gdb gdb-multiarch gcc libc6-dbg build-essential \
      qemu-user gcc-x86-64-linux-gnu libc6-dev-amd64-cross \
      bsdutils util-linux procps binutils && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/hugsy/gef /opt/gef \
 && cd /opt/gef && git log -1 --format='%H %cd' > /opt/gef/COMMIT \
 && echo "source /opt/gef/gef.py" > /root/.gdbinit
WORKDIR /work
