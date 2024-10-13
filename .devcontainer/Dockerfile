FROM quay.io/centos/centos:stream9

RUN dnf install -y git

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.29"
ENV BUN_INSTALL="$HOME/.bun"
ENV PATH=$BUN_INSTALL/bin:$PATH
