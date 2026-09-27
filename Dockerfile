# Build: tests, type check, Vite bundle. Run: the bundle plus a dependency-free Node server.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM node:24-alpine AS run
WORKDIR /app
# heap capped for a small container (e.g. a 256 MB memory limit); uploads are checked one at a time
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist DATA_DIR=/data NODE_OPTIONS=--max-old-space-size=128
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.ts"]
