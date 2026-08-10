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

# Standalone output (Next.js copia el projecte des de /app, per tant server.js
# queda a ./app/server.js dins del directori standalone)
COPY --from=builder /app/.next/standalone ./
# Fitxers estàtics i públics cal copiar-los relatius a ./app/ (on viu server.js)
COPY --from=builder /app/.next/static ./app/.next/static
COPY --from=builder /app/public ./app/public

# better-sqlite3: el binari natiu pot no ser traçat automàticament
COPY --from=builder /app/node_modules/better-sqlite3 ./app/node_modules/better-sqlite3

RUN mkdir -p /data

EXPOSE 3000
# server.js fa process.chdir(__dirname), per tant l'hem de cridar des del seu path
CMD ["node", "app/server.js"]
