# Matches origin/vimalcode Railway flow: `npm ci` first (no prisma postinstall), then copy schema + `prisma generate`.
FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
# Prisma CLI must be a production dependency so `npm ci --omit=dev` still installs it.
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Run migrations then app (same idea as vimalcode; adjust seed if you need it on every deploy)
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
