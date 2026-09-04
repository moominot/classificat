FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# La BD es guardarà a /data (muntat com a volum en docker-compose)
ENV DATA_DIR=/data

# Standalone output: server.js queda a l'arrel del directori standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# better-sqlite3: el binari natiu pot no ser traçat automàticament
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
