const { logger } = require('../config/logger');
const { purgeExpiredRecycleBinItems } = require('./recycleBinService');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
let timer = null;

async function runPurge() {
  try {
    const result = await purgeExpiredRecycleBinItems(200);
    if (result.total > 0) {
      logger.info('Recycle bin purge run completed', result);
    }
  } catch (error) {
    logger.error('Recycle bin purge run failed', { error: error.message });
  }
}

function startRecycleBinPurgeScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  runPurge().catch(() => {});
  timer = setInterval(() => {
    runPurge().catch(() => {});
  }, intervalMs);
}

function stopRecycleBinPurgeScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startRecycleBinPurgeScheduler,
  stopRecycleBinPurgeScheduler,
};
