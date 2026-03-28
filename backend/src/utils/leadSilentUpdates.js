const { prisma } = require('../config/database');

/**
 * UPDATE rows without touching "updatedAt" (@updatedAt only runs on Prisma updates).
 * Used for background sync (score, AI summary) and view tracking (last opened).
 */
async function syncLeadScoreWithoutUpdatedAt(leadId, score, conversionProb) {
  await prisma.$executeRaw`
    UPDATE "leads"
    SET "score" = ${score},
        "conversionProb" = ${conversionProb}
    WHERE "id" = ${leadId}
  `;
}

async function setLeadAiSummaryWithoutUpdatedAt(leadId, aiSummary) {
  await prisma.$executeRaw`
    UPDATE "leads"
    SET "aiSummary" = ${aiSummary}
    WHERE "id" = ${leadId}
  `;
}

async function setLeadLastOpenedWithoutUpdatedAt(leadId, userId, openedAt) {
  await prisma.$executeRaw`
    UPDATE "leads"
    SET "lastOpenedAt" = ${openedAt},
        "lastOpenedById" = ${userId}
    WHERE "id" = ${leadId}
  `;
}

module.exports = {
  syncLeadScoreWithoutUpdatedAt,
  setLeadAiSummaryWithoutUpdatedAt,
  setLeadLastOpenedWithoutUpdatedAt,
};
