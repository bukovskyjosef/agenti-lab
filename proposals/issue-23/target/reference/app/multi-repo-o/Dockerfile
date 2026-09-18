FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY bin ./bin
COPY github-app-manifest.template.json ./
COPY README.md ./
RUN mkdir -p /data /config
ENV AGENTI_PORT=8080 \
    AGENTI_DB_PATH=/data/agenti-o.sqlite
EXPOSE 8080
CMD ["node", "src/server.mjs"]
