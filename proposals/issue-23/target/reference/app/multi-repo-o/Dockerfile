FROM node:22-bookworm-slim
WORKDIR /opt/agenti

COPY proposals/issue-21/target/reference/core ./reference/core
COPY proposals/issue-23/target/reference/app/multi-repo-o/package.json ./reference/app/multi-repo-o/package.json
COPY proposals/issue-23/target/reference/app/multi-repo-o/src ./reference/app/multi-repo-o/src
COPY proposals/issue-23/target/reference/app/multi-repo-o/bin ./reference/app/multi-repo-o/bin
COPY proposals/issue-23/target/reference/app/multi-repo-o/github-app-manifest.template.json ./reference/app/multi-repo-o/github-app-manifest.template.json
COPY proposals/issue-23/target/reference/app/multi-repo-o/README.md ./reference/app/multi-repo-o/README.md

RUN mkdir -p /data /config
WORKDIR /opt/agenti/reference/app/multi-repo-o
ENV AGENTI_PORT=8080 \
    AGENTI_DB_PATH=/data/agenti-o.sqlite
EXPOSE 8080
CMD ["node", "src/server.mjs"]
