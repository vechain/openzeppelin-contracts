FROM golang:1.26.1-alpine AS builder

ARG THOR_REPO=https://github.com/vechain/thor.git
ARG THOR_REF=master

RUN apk add --no-cache git make gcc musl-dev linux-headers

WORKDIR /go/thor
RUN git clone ${THOR_REPO} . && \
    git checkout ${THOR_REF} && \
    for i in 1 2 3; do go mod download && break || sleep 5; done && \
    make all

FROM alpine:3.21.3
RUN apk add --no-cache ca-certificates
RUN apk update && \
    apk add --no-cache libssl3=3.3.6-r0 libcrypto3=3.3.6-r0 busybox=1.37.0-r14
COPY --from=builder /go/thor/bin/thor /usr/local/bin/
COPY --from=builder /go/thor/bin/disco /usr/local/bin/
RUN adduser -D -s /bin/ash thor
USER thor

EXPOSE 8669 2112 11235 11235/udp 55555/udp
ENTRYPOINT ["thor"]
