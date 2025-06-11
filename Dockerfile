FROM alpine

RUN apk update && apk upgrade && \
    apk add openssh-client git hugo rsync && rm -rf /var/cache/apk/* && \
    mkdir ~/.ssh && chmod 700 ~/.ssh && \
    mkdir /project
COPY /ssh_known_hosts /root/.ssh/known_hosts
COPY /ssh_private_key /root/.ssh/id_rsa

WORKDIR /project
COPY / /project/


