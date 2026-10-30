FROM node:24-bookworm-slim AS ui
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:ui

FROM rust:1-bookworm AS build
WORKDIR /app
COPY --from=ui /app .
RUN cargo build --release -p kempt-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/kempt-server /usr/local/bin/kempt-server
VOLUME ["/data"]
EXPOSE 3000
# The server intentionally accepts loopback only. Use host networking for local use.
CMD ["kempt-server", "serve", "--host", "127.0.0.1", "--port", "3000", "--data-dir", "/data"]
