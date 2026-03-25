# Backend API — copy prisma before npm ci so postinstall can run prisma generate
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts

RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/index.js"]
