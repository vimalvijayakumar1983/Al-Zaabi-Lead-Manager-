const { PrismaClient } = require('@prisma/client');
const { logger } = require('./logger');
const { config } = require('./env');

function buildPrismaDatasourceUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const defaultConnectionLimit = config.nodeEnv === 'production' ? '5' : '10';
    const connectionLimit = process.env.PRISMA_CONNECTION_LIMIT || defaultConnectionLimit;
    const poolTimeout = process.env.PRISMA_POOL_TIMEOUT || '20';

    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', connectionLimit);
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', poolTimeout);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const datasourceUrl = buildPrismaDatasourceUrl(config.databaseUrl);
const prismaLog = config.nodeEnv === 'production'
  ? [{ emit: 'event', level: 'error' }]
  : [{ emit: 'event', level: 'query' }, { emit: 'event', level: 'error' }];

const prisma = new PrismaClient({
  log: prismaLog,
  ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

if (datasourceUrl && config.nodeEnv === 'production') {
  try {
    const parsed = new URL(datasourceUrl);
    logger.info(
      `Prisma pool tuning enabled (connection_limit=${parsed.searchParams.get('connection_limit') || 'default'}, pool_timeout=${parsed.searchParams.get('pool_timeout') || 'default'})`
    );
  } catch {
    // ignore malformed URL log parse failures
  }
}

module.exports = { prisma };
