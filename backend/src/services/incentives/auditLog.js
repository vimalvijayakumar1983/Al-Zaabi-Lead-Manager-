const { prisma } = require('../../config/database');

async function writeIncentiveAudit({
  organizationId,
  divisionId,
  actorId,
  action,
  modelType,
  modelId,
  reason = null,
  before = null,
  after = null,
}) {
  return prisma.incentiveAuditLog.create({
    data: {
      organizationId,
      divisionId,
      actorId,
      action,
      modelType,
      modelId,
      reason,
      before: before === undefined ? undefined : before,
      after: after === undefined ? undefined : after,
    },
  });
}

module.exports = { writeIncentiveAudit };
