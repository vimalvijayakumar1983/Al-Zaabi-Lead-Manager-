const { prisma } = require('../config/database');

/**
 * Audit logging middleware - call after successful operations
 */
const createAuditLog = async ({ userId, organizationId, action, entity, entityId, oldData, newData, req }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        entity,
        entityId,
        oldData: oldData || undefined,
        newData: newData || undefined,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      },
    });
  } catch {
    // Audit log failures should not break the main flow
  }
};

module.exports = { createAuditLog };
