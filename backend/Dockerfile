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
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js; node src/index.js"]
