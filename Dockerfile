FROM node:lts-alpine

LABEL maintainer="Miroslav Dzurik"

USER node
WORKDIR /home/node

COPY --chown=node:node bin /home/node/bin
COPY --chown=node:node lib /home/node/lib
COPY --chown=node:node package*.json /home/node/

RUN npm install --only=production

ENTRYPOINT ["/home/node/bin/modbus-tcp-gateway"]
CMD ["--from-env"]