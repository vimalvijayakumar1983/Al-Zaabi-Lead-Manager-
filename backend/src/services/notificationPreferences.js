const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

const DEFAULT_NOTIFICATION_PREFERENCES = {
  // Client-side UX toggles
  soundEnabled: true,
  desktopEnabled: false,

  // Channel toggles
  emailEnabled: true,

  // Category toggles
  leads: true,
  tasks: true,
  campaigns: true,
  integrations: true,
  team: true,
  system: true,

  // Email granularity
  emailNewLead: true,
  emailLeadAssigned: true,
  emailTaskDue: true,
  emailWeeklyDigest: true,

  // In-app granularity
  inAppNewLead: true,
  inAppLeadAssigned: true,
  inAppTaskDue: true,
  inAppStatusChange: true,

  // Phase-2/3 controls
  escalationEnabled: true,
  digestEnabled: true,
};

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function coerceBooleanKeys(input, base) {
  const output = { ...base };
  for (const [key, value] of Object.entries(asObject(input))) {
    if (typeof output[key] === 'boolean') {
      output[key] = value === true;
    } else if (typeof value === 'boolean') {
      output[key] = value;
    }
  }
  return output;
}

function getLegacyOrgPreference(settings, userId) {
  const key = `notifs_${userId}`;
  return asObject(settings?.[key]);
}

function normalizeNotificationPreferences(preferences, legacyPreferences = {}) {
  const withLegacy = coerceBooleanKeys(legacyPreferences, DEFAULT_NOTIFICATION_PREFERENCES);
  return coerceBooleanKeys(preferences, withLegacy);
}

async function getUserNotificationPreferences(userId, organizationId) {
  const [prefRow, org] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId },
      select: { preferences: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    }),
  ]);

  const settings = asObject(org?.settings);
  const legacy = getLegacyOrgPreference(settings, userId);
  return normalizeNotificationPreferences(prefRow?.preferences, legacy);
}

async function updateUserNotificationPreferences(userId, organizationId, partialPreferences) {
  const [current, org] = await Promise.all([
    getUserNotificationPreferences(userId, organizationId),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    }),
  ]);

  const merged = normalizeNotificationPreferences(
    { ...current, ...asObject(partialPreferences) },
    current
  );

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: { preferences: merged },
    create: { userId, preferences: merged },
  });

  // Keep backward compatibility with old org-settings based storage.
  try {
    const settings = asObject(org?.settings);
    const key = `notifs_${userId}`;
    const legacyProjection = {
      emailNewLead: merged.emailNewLead,
      emailLeadAssigned: merged.emailLeadAssigned,
      emailTaskDue: merged.emailTaskDue,
      emailWeeklyDigest: merged.emailWeeklyDigest,
      inAppNewLead: merged.inAppNewLead,
      inAppLeadAssigned: merged.inAppLeadAssigned,
      inAppTaskDue: merged.inAppTaskDue,
      inAppStatusChange: merged.inAppStatusChange,
    };
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...settings,
          [key]: legacyProjection,
        },
      },
    });
  } catch (error) {
    logger.warn('Failed to sync legacy notification preferences', {
      userId,
      organizationId,
      error: error.message,
    });
  }

  invalidateNotificationPreferenceCache(userId, organizationId);
  return merged;
}

function resolveNotificationPreferenceKeys(type) {
  if (!type || typeof type !== 'string') {
    return ['system'];
  }

  if (type.startsWith('TASK_') || type.startsWith('CALLBACK_')) {
    return ['tasks', 'inAppTaskDue'];
  }

  if (type.startsWith('LEAD_') || type.startsWith('PIPELINE_')) {
    if (type === 'LEAD_ASSIGNED') {
      return ['leads', 'inAppLeadAssigned'];
    }
    return ['leads', 'inAppNewLead'];
  }

  if (type.startsWith('CAMPAIGN_')) {
    return ['campaigns'];
  }

  if (type.startsWith('INTEGRATION_')) {
    return ['integrations'];
  }

  if (type.startsWith('TEAM_')) {
    return ['team'];
  }

  return ['system', 'inAppStatusChange'];
}

const preferenceCache = new Map();
const PREFERENCE_CACHE_TTL_MS = 60 * 1000;

async function shouldDeliverInAppNotification({ userId, organizationId, type }) {
  const cacheKey = `${organizationId}:${userId}`;
  const cached = preferenceCache.get(cacheKey);
  const now = Date.now();

  let prefs;
  if (cached && now - cached.loadedAt < PREFERENCE_CACHE_TTL_MS) {
    prefs = cached.preferences;
  } else {
    prefs = await getUserNotificationPreferences(userId, organizationId);
    preferenceCache.set(cacheKey, { preferences: prefs, loadedAt: now });
  }

  const requiredKeys = resolveNotificationPreferenceKeys(type);
  for (const key of requiredKeys) {
    if (prefs[key] === false) {
      return false;
    }
  }

  return true;
}

function invalidateNotificationPreferenceCache(userId, organizationId) {
  preferenceCache.delete(`${organizationId}:${userId}`);
}

module.exports = {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  shouldDeliverInAppNotification,
  invalidateNotificationPreferenceCache,
};
