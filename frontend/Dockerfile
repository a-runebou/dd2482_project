# syntax=docker/dockerfile:1

# Build stage: Node major version matches frontend/.nvmrc (24), pinned by tag rather than `latest`.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: nginxinc/nginx-unprivileged is nginx's own non-root variant (runs as the
# unprivileged `nginx` user on an unprivileged port out of the box), preferred here over the
# docker-library nginx image plus manual permission changes.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_ORIGIN=http://backend:8000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:8080/ || exit 1
