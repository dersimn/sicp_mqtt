FROM node:slim

COPY . /node
WORKDIR /node

RUN npm install

ENTRYPOINT [ "node", "index.js" ]
