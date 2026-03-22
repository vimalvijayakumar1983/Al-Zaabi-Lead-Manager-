FROM node:22-alpine AS base
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application code
COPY . .

# Production stage
FROM node:22-alpine
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/src ./src
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
EXPOSE 4000

# Run migrations and start server
# Resolve any previously failed migrations before deploying
CMD ["sh", "-c", "npx prisma migrate resolve --rolled-back 20260313000000_add_notifications_integrations_apikeys 2>/dev/null; npx prisma migrate resolve --rolled-back 20260318200000_add_sla_tracking 2>/dev/null; npx prisma migrate deploy && node prisma/seed.js; node src/index.js"]
