FROM node:22-bookworm-slim
WORKDIR /opt/agenti/reference

COPY core ./core
COPY schemas ./schemas
COPY app/multi-repo-o/package.json ./app/multi-repo-o/package.json
COPY app/multi-repo-o/src ./app/multi-repo-o/src
COPY app/multi-repo-o/bin ./app/multi-repo-o/bin
COPY app/multi-repo-o/config ./app/multi-repo-o/config
COPY app/multi-repo-o/github-app-manifest.template.json ./app/multi-repo-o/github-app-manifest.template.json
COPY app/multi-repo-o/README.md ./app/multi-repo-o/README.md

RUN mkdir -p /data /config
WORKDIR /opt/agenti/reference/app/multi-repo-o
ENV AGENTI_PORT=8080 \
    AGENTI_DB_PATH=/data/agenti-o.sqlite
EXPOSE 8080
CMD ["node", "src/server.mjs"]
