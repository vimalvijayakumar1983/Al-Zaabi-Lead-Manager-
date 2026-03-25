#!/usr/bin/env node
/**
 * Run `prisma generate` only when prisma/schema.prisma exists.
 * Docker/Railway often runs `npm ci` before the prisma folder is copied; skipping avoids a hard fail.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.warn('[postinstall] prisma/schema.prisma not found — skipping prisma generate (expected in some Docker layers).');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const localPrisma = path.join(root, 'node_modules', '.bin', 'prisma');
// Prefer local CLI after npm ci (no extra download). Fallback: pin major — plain `npx prisma` can pull Prisma 7+ and break a v5 schema.
const prismaVer = process.env.PRISMA_CLI_VERSION || '5.22.0';
const cmd = fs.existsSync(localPrisma)
  ? `"${localPrisma}" generate --schema prisma/schema.prisma`
  : `npx prisma@${prismaVer} generate --schema prisma/schema.prisma`;
execSync(cmd, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
  shell: true,
});
