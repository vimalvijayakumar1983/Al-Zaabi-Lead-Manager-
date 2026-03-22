const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

const RECYCLE_RETENTION_DAYS = 60;
const ALLOWED_SCOPES = new Set(['none', 'own', 'team', 'division', 'all']);
const ADMIN_PURGE_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

const DEFAULT_RECYCLE_BIN_ACCESS = {
  roleScopes: {
    SUPER_ADMIN: { view: 'all', restore: 'all', purge: true },
    ADMIN: { view: 'division', restore: 'division', purge: true },
    MANAGER: { view: 'division', restore: 'division', purge: false },
    SALES_REP: { view: 'own', restore: 'own', purge: false },
    VIEWER: { view: 'none', restore: 'none', purge: false },
  },
  userOverrides: {},
};

const VALID_TASK_TYPES = new Set([
  'FOLLOW_UP_CALL',
  'MEETING',
  'EMAIL',
  'WHATSAPP',
  'DEMO',
  'PROPOSAL',
  'OTHER',
]);
const VALID_TASK_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const VALID_TASK_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
const VALID_CAMPAIGN_TYPES = new Set([
  'FACEBOOK_ADS',
  'GOOGLE_ADS',
  'EMAIL',
  'WHATSAPP',
  'LANDING_PAGE',
  'REFERRAL',
  'TIKTOK_ADS',
  'WEBSITE_FORM',
  'OTHER',
]);
const VALID_CAMPAIGN_STATUSES = new Set(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']);

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function normalizeScope(scope, fallback = 'none') {
  if (typeof scope !== 'string') return fallback;
  const normalized = scope.trim().toLowerCase();
  if (!ALLOWED_SCOPES.has(normalized)) return fallback;
  if (normalized === 'team') return 'division';
  return normalized;
}

function normalizeRule(input, fallback) {
  const source = asObject(input);
  return {
    view: normalizeScope(source.view, fallback.view),
    restore: normalizeScope(source.restore, fallback.restore),
    purge: typeof source.purge === 'boolean' ? source.purge : fallback.purge,
  };
}

function mergeRecycleBinAccessSettings(rawSettings) {
  const incoming = asObject(rawSettings);
  const incomingRoleScopes = asObject(incoming.roleScopes);
  const incomingUserOverrides = asObject(incoming.userOverrides);

  const roleScopes = {};
  for (const [role, defaults] of Object.entries(DEFAULT_RECYCLE_BIN_ACCESS.roleScopes)) {
    roleScopes[role] = normalizeRule(incomingRoleScopes[role], defaults);
  }

  const userOverrides = {};
  for (const [userId, override] of Object.entries(incomingUserOverrides)) {
    if (!userId) continue;
    userOverrides[userId] = normalizeRule(override, { view: 'none', restore: 'none', purge: false });
  }

  return { roleScopes, userOverrides };
}

async function getRecycleBinAccessSettings(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = asObject(org?.settings);
  return mergeRecycleBinAccessSettings(settings.recycleBinAccess);
}

async function updateRecycleBinAccessSettings(organizationId, updates) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = asObject(org?.settings);
  const current = mergeRecycleBinAccessSettings(settings.recycleBinAccess);
  const incoming = asObject(updates);

  const nextRoleScopes = { ...current.roleScopes };
  const incomingRoleScopes = asObject(incoming.roleScopes);
  for (const [role, defaults] of Object.entries(DEFAULT_RECYCLE_BIN_ACCESS.roleScopes)) {
    if (incomingRoleScopes[role]) {
      nextRoleScopes[role] = normalizeRule(incomingRoleScopes[role], defaults);
    }
  }

  const nextUserOverrides = { ...current.userOverrides };
  const incomingOverrides = asObject(incoming.userOverrides);
  for (const [userId, override] of Object.entries(incomingOverrides)) {
    if (!userId) continue;
    if (override === null) {
      delete nextUserOverrides[userId];
      continue;
    }
    nextUserOverrides[userId] = normalizeRule(override, { view: 'none', restore: 'none', purge: false });
  }

  const merged = {
    roleScopes: nextRoleScopes,
    userOverrides: nextUserOverrides,
  };

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...settings,
        recycleBinAccess: merged,
      },
    },
  });

  return merged;
}

function resolveRecycleBinRule(accessSettings, userContext) {
  const role = userContext?.role || 'SALES_REP';
  const base = accessSettings.roleScopes[role] || { view: 'none', restore: 'none', purge: false };
  const override = accessSettings.userOverrides[userContext?.id] || null;
  if (!override) return base;
  return normalizeRule(override, base);
}

function resolveDivisionScopedOrgIds(req, scope, requestedDivisionId) {
  if (scope === 'none') return [];

  if (requestedDivisionId) {
    if (!req.orgIds.includes(requestedDivisionId)) {
      const error = new Error('Invalid division scope');
      error.status = 403;
      throw error;
    }
    if (scope === 'own' && requestedDivisionId !== req.user.organizationId) {
      const error = new Error('Your role is restricted to your own division scope');
      error.status = 403;
      throw error;
    }
    return [requestedDivisionId];
  }

  if (scope === 'all') return req.orgIds;
  return [req.user.organizationId];
}

function isOwnRecycleItem(item, userId) {
  if (!userId) return false;
  return [item.recordOwnerId, item.recordAssigneeId, item.recordCreatorId, item.deletedById]
    .filter(Boolean)
    .includes(userId);
}

function canRestoreRecycleItem(rule, item, userContext) {
  if (rule.restore === 'all') {
    return Array.isArray(userContext.orgIds) && userContext.orgIds.includes(item.organizationId);
  }
  if (rule.restore === 'division') {
    return item.organizationId === userContext.organizationId
      || (Array.isArray(userContext.orgIds) && userContext.orgIds.includes(item.organizationId));
  }
  if (rule.restore === 'own') {
    return isOwnRecycleItem(item, userContext.id);
  }
  return false;
}

function canPurgeRecycleItem(rule, userContext) {
  return ADMIN_PURGE_ROLES.has(userContext.role) && rule.purge === true;
}

function buildPurgeAt(fromDate = new Date()) {
  const purgeAt = new Date(fromDate);
  purgeAt.setDate(purgeAt.getDate() + RECYCLE_RETENTION_DAYS);
  return purgeAt;
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function upsertRecycleBinItem(payload) {
  const deletedAt = parseDate(payload.deletedAt, new Date());
  const purgeAt = parseDate(payload.purgeAt, buildPurgeAt(deletedAt));
  const metadata = asObject(payload.metadata);

  return prisma.recycleBinItem.upsert({
    where: {
      entityType_entityId: {
        entityType: payload.entityType,
        entityId: payload.entityId,
      },
    },
    update: {
      entityLabel: payload.entityLabel || null,
      organizationId: payload.organizationId,
      deletedById: payload.deletedById || null,
      recordOwnerId: payload.recordOwnerId || null,
      recordAssigneeId: payload.recordAssigneeId || null,
      recordCreatorId: payload.recordCreatorId || null,
      deletedAt,
      purgeAt,
      snapshot: payload.snapshot || null,
      metadata,
    },
    create: {
      entityType: payload.entityType,
      entityId: payload.entityId,
      entityLabel: payload.entityLabel || null,
      organizationId: payload.organizationId,
      deletedById: payload.deletedById || null,
      recordOwnerId: payload.recordOwnerId || null,
      recordAssigneeId: payload.recordAssigneeId || null,
      recordCreatorId: payload.recordCreatorId || null,
      deletedAt,
      purgeAt,
      snapshot: payload.snapshot || null,
      metadata,
    },
  });
}

async function resolveUserInOrganization(userId, organizationId) {
  if (!userId) return null;
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  return user?.id || null;
}

async function pickFallbackUserInOrganization(organizationId, actorId) {
  const actorInOrg = await resolveUserInOrganization(actorId, organizationId);
  if (actorInOrg) return actorInOrg;

  const fallback = await prisma.user.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return fallback?.id || null;
}

async function restoreTaskFromSnapshot(item, actorUserId) {
  const snapshot = asObject(item.snapshot);
  const existingTask = await prisma.task.findUnique({ where: { id: item.entityId }, select: { id: true } });
  if (existingTask) {
    return { ok: true, alreadyExists: true, entityId: existingTask.id };
  }

  const assigneeId = await resolveUserInOrganization(snapshot.assigneeId, item.organizationId)
    || await resolveUserInOrganization(item.recordAssigneeId, item.organizationId)
    || await pickFallbackUserInOrganization(item.organizationId, actorUserId);

  if (!assigneeId) {
    return { ok: false, error: 'No active assignee found in this division to restore task' };
  }

  const createdById = await resolveUserInOrganization(snapshot.createdById, item.organizationId)
    || await resolveUserInOrganization(item.recordCreatorId, item.organizationId)
    || assigneeId;

  const lead = snapshot.leadId
    ? await prisma.lead.findFirst({
      where: { id: snapshot.leadId, organizationId: item.organizationId, isArchived: false },
      select: { id: true },
    })
    : null;
  const contact = snapshot.contactId
    ? await prisma.contact.findFirst({
      where: { id: snapshot.contactId, organizationId: item.organizationId, isArchived: false },
      select: { id: true },
    })
    : null;

  const taskType = VALID_TASK_TYPES.has(snapshot.type) ? snapshot.type : 'OTHER';
  const priority = VALID_TASK_PRIORITIES.has(snapshot.priority) ? snapshot.priority : 'MEDIUM';
  const status = VALID_TASK_STATUSES.has(snapshot.status) ? snapshot.status : 'PENDING';
  const dueAt = parseDate(snapshot.dueAt, new Date());
  const reminder = parseDate(snapshot.reminder, null);
  const completedAt = status === 'COMPLETED' ? parseDate(snapshot.completedAt, new Date()) : null;

  await prisma.task.create({
    data: {
      id: item.entityId,
      title: snapshot.title || item.entityLabel || 'Restored Task',
      description: snapshot.description || null,
      type: taskType,
      priority,
      status,
      dueAt,
      completedAt,
      isRecurring: snapshot.isRecurring === true,
      recurRule: snapshot.recurRule || null,
      reminder,
      leadId: lead?.id || null,
      contactId: contact?.id || null,
      assigneeId,
      createdById,
    },
  });

  return { ok: true, entityId: item.entityId };
}

async function restoreCampaignFromSnapshot(item) {
  const snapshot = asObject(item.snapshot);
  const existing = await prisma.campaign.findUnique({ where: { id: item.entityId }, select: { id: true } });
  if (existing) {
    return { ok: true, alreadyExists: true, entityId: existing.id };
  }

  const type = VALID_CAMPAIGN_TYPES.has(snapshot.type) ? snapshot.type : 'OTHER';
  const status = VALID_CAMPAIGN_STATUSES.has(snapshot.status) ? snapshot.status : 'DRAFT';
  const startDate = parseDate(snapshot.startDate, null);
  const endDate = parseDate(snapshot.endDate, null);
  const budget = typeof snapshot.budget === 'number' || typeof snapshot.budget === 'string'
    ? Number(snapshot.budget)
    : null;

  await prisma.campaign.create({
    data: {
      id: item.entityId,
      name: snapshot.name || item.entityLabel || 'Restored Campaign',
      type,
      status,
      budget: Number.isFinite(budget) ? budget : null,
      description: snapshot.description || null,
      startDate,
      endDate,
      metadata: asObject(snapshot.metadata),
      organizationId: item.organizationId,
    },
  });

  return { ok: true, entityId: item.entityId };
}

async function restoreRecycleBinItem(item, actorUserId) {
  if (!item) return { ok: false, error: 'Recycle bin item not found' };

  if (item.entityType === 'LEAD') {
    const lead = await prisma.lead.findFirst({
      where: { id: item.entityId, organizationId: item.organizationId },
      select: { id: true, isArchived: true },
    });
    if (!lead) return { ok: false, error: 'Lead record no longer exists' };
    if (lead.isArchived) {
      await prisma.lead.update({
        where: { id: item.entityId },
        data: { isArchived: false },
      });
    }
  } else if (item.entityType === 'CONTACT') {
    const contact = await prisma.contact.findFirst({
      where: { id: item.entityId, organizationId: item.organizationId },
      select: { id: true, isArchived: true },
    });
    if (!contact) return { ok: false, error: 'Contact record no longer exists' };
    if (contact.isArchived) {
      await prisma.contact.update({
        where: { id: item.entityId },
        data: { isArchived: false },
      });
    }
  } else if (item.entityType === 'TASK') {
    const restoredTask = await restoreTaskFromSnapshot(item, actorUserId);
    if (!restoredTask.ok) return restoredTask;
  } else if (item.entityType === 'CAMPAIGN') {
    const restoredCampaign = await restoreCampaignFromSnapshot(item);
    if (!restoredCampaign.ok) return restoredCampaign;
  } else {
    return { ok: false, error: 'Unsupported recycle bin entity type' };
  }

  await prisma.recycleBinItem.delete({ where: { id: item.id } });
  return { ok: true, entityType: item.entityType, entityId: item.entityId, organizationId: item.organizationId };
}

async function permanentlyDeleteRecycleBinItem(item) {
  if (!item) return { ok: false, error: 'Recycle bin item not found' };

  if (item.entityType === 'LEAD') {
    await prisma.lead.deleteMany({
      where: {
        id: item.entityId,
        organizationId: item.organizationId,
        isArchived: true,
      },
    });
  } else if (item.entityType === 'CONTACT') {
    await prisma.contact.deleteMany({
      where: {
        id: item.entityId,
        organizationId: item.organizationId,
        isArchived: true,
      },
    });
  } else if (item.entityType === 'TASK') {
    await prisma.task.deleteMany({
      where: { id: item.entityId },
    });
  } else if (item.entityType === 'CAMPAIGN') {
    await prisma.campaign.deleteMany({
      where: { id: item.entityId, organizationId: item.organizationId },
    });
  } else {
    return { ok: false, error: 'Unsupported recycle bin entity type' };
  }

  await prisma.recycleBinItem.delete({ where: { id: item.id } });
  return { ok: true, entityType: item.entityType, entityId: item.entityId };
}

async function purgeExpiredRecycleBinItems(batchSize = 100) {
  const now = new Date();
  const items = await prisma.recycleBinItem.findMany({
    where: { purgeAt: { lte: now } },
    orderBy: { purgeAt: 'asc' },
    take: batchSize,
  });

  let purged = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const result = await permanentlyDeleteRecycleBinItem(item);
      if (result.ok) purged += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logger.error('Failed to purge recycle bin item', {
        itemId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        error: error.message,
      });
    }
  }

  return { total: items.length, purged, failed };
}

module.exports = {
  RECYCLE_RETENTION_DAYS,
  DEFAULT_RECYCLE_BIN_ACCESS,
  mergeRecycleBinAccessSettings,
  getRecycleBinAccessSettings,
  updateRecycleBinAccessSettings,
  resolveRecycleBinRule,
  resolveDivisionScopedOrgIds,
  isOwnRecycleItem,
  canRestoreRecycleItem,
  canPurgeRecycleItem,
  upsertRecycleBinItem,
  restoreRecycleBinItem,
  permanentlyDeleteRecycleBinItem,
  purgeExpiredRecycleBinItems,
  buildPurgeAt,
};
