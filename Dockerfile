# Imagem de producao: painel + player web. Banco SQLite e midias ficam no volume /data.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/data/yesdooh.db \
    STORAGE_DIR=/data/storage

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
VOLUME /data

# Na subida: cria/atualiza as tabelas, cria a conta inicial (so na primeira vez) e inicia o servidor.
CMD ["sh", "-c", "mkdir -p /data/storage && npx prisma db push --skip-generate && npx tsx prisma/seed.ts && npx next start -H 0.0.0.0 -p ${PORT}"]
