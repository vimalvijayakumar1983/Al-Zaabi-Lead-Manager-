const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  SNOOZE_MIN_MINUTES,
  SNOOZE_MAX_MINUTES,
} = require('../services/notificationPreferences');

const router = Router();
router.use(authenticate, orgScope);
const AUTO_SERIAL_DEFAULT_VALUE = '__AUTO_SERIAL__';

function resolveGroupOrgId(req) {
  if (req?.user?.organization?.type === 'GROUP') return req.user.organizationId;
  return req?.user?.organization?.parentId || req.user.organizationId;
}

const notificationPreferencesSchema = z.object({
  soundEnabled: z.boolean().optional(),
  desktopEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  leads: z.boolean().optional(),
  tasks: z.boolean().optional(),
  campaigns: z.boolean().optional(),
  integrations: z.boolean().optional(),
  team: z.boolean().optional(),
  system: z.boolean().optional(),
  emailNewLead: z.boolean().optional(),
  emailLeadAssigned: z.boolean().optional(),
  emailTaskDue: z.boolean().optional(),
  emailWeeklyDigest: z.boolean().optional(),
  inAppNewLead: z.boolean().optional(),
  inAppLeadAssigned: z.boolean().optional(),
  inAppTaskDue: z.boolean().optional(),
  inAppStatusChange: z.boolean().optional(),
  escalationEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  defaultTaskSnoozeMinutes: z.coerce.number().int().min(SNOOZE_MIN_MINUTES).max(SNOOZE_MAX_MINUTES).optional(),
  defaultCallbackSnoozeMinutes: z.coerce.number().int().min(SNOOZE_MIN_MINUTES).max(SNOOZE_MAX_MINUTES).optional(),
});

// ─── Get Profile ────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true, isActive: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
        organization: {
          select: {
            id: true, name: true, tradeName: true, logo: true,
            primaryColor: true, secondaryColor: true, type: true,
            parentId: true, plan: true,
          },
        },
        _count: { select: { assignedLeads: true, tasks: true } },
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Update Profile ─────────────────────────────────────────────
router.put('/profile', validate(z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
})), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.validated,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true,
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Change Password ────────────────────────────────────────────
router.put('/password', validate(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.validated;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Get Organization ───────────────────────────────────────────
router.get('/organization', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: {
        id: true, name: true, tradeName: true, logo: true,
        primaryColor: true, secondaryColor: true, type: true,
        parentId: true, domain: true, plan: true,
        settings: true, createdAt: true, updatedAt: true,
        _count: {
          select: { users: true, leads: true, campaigns: true, automationRules: true },
        },
      },
    });
    res.json(org);
  } catch (err) {
    next(err);
  }
});

// ─── Update Organization ────────────────────────────────────────
router.put('/organization', authorize('ADMIN'), validate(z.object({
  name: z.string().min(1).max(200).optional(),
  tradeName: z.string().max(200).optional().nullable(),
  logo: z.string().optional().nullable(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  domain: z.string().max(200).optional().nullable(),
  settings: z.record(z.any()).optional(),
})), async (req, res, next) => {
  try {
    const data = { ...req.validated };

    // Merge settings instead of overwrite
    if (data.settings) {
      const existing = await prisma.organization.findUnique({
        where: { id: req.orgId },
        select: { settings: true },
      });
      const currentSettings = typeof existing.settings === 'object' ? existing.settings : {};
      data.settings = { ...currentSettings, ...data.settings };
    }

    const org = await prisma.organization.update({
      where: { id: req.orgId },
      data,
      select: {
        id: true, name: true, tradeName: true, logo: true,
        primaryColor: true, secondaryColor: true, type: true,
        domain: true, plan: true, settings: true, updatedAt: true,
      },
    });
    res.json(org);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Domain already in use' });
    }
    next(err);
  }
});

// ─── Get Notification Preferences ───────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const preferences = await getUserNotificationPreferences(req.user.id, req.orgId);
    res.json(preferences);
  } catch (err) {
    next(err);
  }
});

// ─── Update Notification Preferences ────────────────────────────
router.put('/notifications', validate(notificationPreferencesSchema), async (req, res, next) => {
  try {
    const updated = await updateUserNotificationPreferences(
      req.user.id,
      req.orgId,
      req.validated
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── Get Audit Log ──────────────────────────────────────────────
router.get('/audit-log', authorize('ADMIN'), async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: {
        id: true, action: true, entity: true, entityId: true,
        createdAt: true, ipAddress: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Account ─────────────────────────────────────────────
router.delete('/account', validate(z.object({
  password: z.string().min(1),
})), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true, role: true },
    });

    const valid = await bcrypt.compare(req.validated.password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Don't allow last admin/super_admin to delete account
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      const adminCount = await prisma.user.count({
        where: { organizationId: req.orgId, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account. Transfer admin role first.' });
      }
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: false },
    });

    res.json({ message: 'Account deactivated' });
  } catch (err) {
    next(err);
  }
});

// ─── Field Configuration (Built-in + Custom fields visibility) ──────

const BUILT_IN_FIELDS = [
  { key: 'name',            label: 'Name',             type: 'TEXT',         locked: true,  isRequired: true,  canToggleRequired: false, category: 'contact' },
  { key: 'email',           label: 'Email',            type: 'EMAIL',        locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'phone',           label: 'Phone',            type: 'PHONE',        locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'company',         label: 'Company',          type: 'TEXT',         locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'jobTitle',        label: 'Job Title',        type: 'TEXT',         locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'location',        label: 'Location',         type: 'TEXT',         locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'website',         label: 'Website',          type: 'URL',          locked: false, isRequired: false, canToggleRequired: true,  category: 'contact' },
  { key: 'source',          label: 'Source',            type: 'SELECT',       locked: false, isRequired: false, canToggleRequired: true,  category: 'lead' },
  { key: 'status',          label: 'Status',            type: 'SELECT',       locked: true,  isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'score',           label: 'Score',             type: 'NUMBER',       locked: false, isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'budget',          label: 'Budget',            type: 'CURRENCY',     locked: false, isRequired: false, canToggleRequired: true,  category: 'business' },
  { key: 'productInterest', label: 'Product Interest',  type: 'TEXT',         locked: false, isRequired: false, canToggleRequired: true,  category: 'business' },
  { key: 'campaign',        label: 'Campaign',          type: 'TEXT',         locked: false, isRequired: false, canToggleRequired: true,  category: 'business' },
  { key: 'conversionProb',  label: 'Conversion %',      type: 'NUMBER',       locked: false, isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'stage',           label: 'Pipeline Stage',    type: 'SELECT',       locked: false, isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'assignedTo',      label: 'Assigned To',       type: 'TEXT',         locked: true,  isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'tags',            label: 'Tags',              type: 'MULTI_SELECT', locked: false, isRequired: false, canToggleRequired: false, category: 'lead' },
  { key: 'createdAt',       label: 'Created Date',      type: 'DATE',         locked: false, isRequired: false, canToggleRequired: false, category: 'system' },
  { key: 'updatedAt',       label: 'Updated Date',      type: 'DATE',         locked: false, isRequired: false, canToggleRequired: false, category: 'system' },
];

// GET /field-config — Get field configuration for a division
router.get('/field-config', async (req, res, next) => {
  try {
    const divisionId = typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;
    const orgId = req.orgId;

    // Get org settings for field config
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings || {});
    const divKey = divisionId ? `division_${divisionId}` : 'default';
    // Cascade: division-specific → group-level defaults → empty
    const fieldConfig = settings.fieldConfig?.[divKey] || settings.fieldConfig?.['default'] || {};

    // Get status labels for this division
    const statusLabels = settings.statusLabels?.[divKey] || settings.statusLabels?.['default'] || {};

    // Merge built-in fields with saved config
    const builtInFields = BUILT_IN_FIELDS.map((f, idx) => ({
      ...f,
      customLabel: fieldConfig[f.key]?.customLabel || null,
      showInList: fieldConfig[f.key]?.showInList ?? true,
      showInDetail: fieldConfig[f.key]?.showInDetail ?? true,
      isRequired: f.canToggleRequired === false ? (f.isRequired ?? false) : (fieldConfig[f.key]?.isRequired ?? f.isRequired ?? false),
      canToggleRequired: f.canToggleRequired ?? false,
      order: fieldConfig[f.key]?.order ?? idx,
      isBuiltIn: true,
    }));

    let customFields = [];
    if (req.isSuperAdmin) {
      const groupOrgId = resolveGroupOrgId(req);

      if (divisionId && !req.orgIds.includes(divisionId)) {
        return res.status(403).json({ error: 'Division not found or access denied' });
      }

      if (!divisionId) {
        // Field Manager "All Divisions" should show everything with division badges.
        customFields = await prisma.customField.findMany({
          where: { organizationId: { in: req.orgIds } },
          orderBy: { order: 'asc' },
        });
      } else {
        const [globalFields, divisionFields] = await Promise.all([
          prisma.customField.findMany({
            where: { organizationId: { in: req.orgIds }, divisionId: null },
            orderBy: { order: 'asc' },
          }),
          prisma.customField.findMany({
            where: { organizationId: divisionId },
            orderBy: { order: 'asc' },
          }),
        ]);

        customFields = [...globalFields, ...divisionFields].sort((a, b) => {
          const orderDiff = (a.order ?? 0) - (b.order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return String(a.label || a.name).localeCompare(String(b.label || b.name));
        });
      }
    } else {
      customFields = await prisma.customField.findMany({
        where: { organizationId: orgId },
        orderBy: { order: 'asc' },
      });
    }

    res.json({ builtInFields, customFields, statusLabels });
  } catch (err) { next(err); }
});

// PUT /field-config — Save built-in field visibility per division
router.put('/field-config', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { divisionId, fields } = req.body;
    const orgId = req.orgId;
    const divKey = divisionId ? `division_${divisionId}` : 'default';

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings || {});
    if (!settings.fieldConfig) settings.fieldConfig = {};
    settings.fieldConfig[divKey] = fields;

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /status-labels — Save custom status labels per division
router.put('/status-labels', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { divisionId, labels } = req.body;
    const orgId = req.orgId;
    const divKey = divisionId ? `division_${divisionId}` : 'default';

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings || {});
    if (!settings.statusLabels) settings.statusLabels = {};
    settings.statusLabels[divKey] = labels || {};

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Custom Fields ─────────────────────────────────────────────

function isAutoSerialField(field) {
  return field?.type === 'NUMBER' && String(field?.defaultValue || '').trim() === AUTO_SERIAL_DEFAULT_VALUE;
}

function readNumericCustomValue(customData, key) {
  if (!customData || typeof customData !== 'object') return null;
  const value = customData[key];
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

async function backfillAutoSerialForField(field) {
  if (!isAutoSerialField(field)) return;

  await prisma.$transaction(async (tx) => {
    let targetOrgIds = [field.organizationId];

    // Global fields are stored on group org; apply serials to all child divisions.
    if (!field.divisionId) {
      const parent = await tx.organization.findUnique({
        where: { id: field.organizationId },
        select: { type: true },
      });
      if (parent?.type === 'GROUP') {
        const divisions = await tx.organization.findMany({
          where: { parentId: field.organizationId, type: 'DIVISION' },
          select: { id: true },
          orderBy: { name: 'asc' },
        });
        if (divisions.length > 0) {
          targetOrgIds = divisions.map((d) => d.id);
        }
      }
    }

    for (const orgId of targetOrgIds) {
      const leads = await tx.lead.findMany({
        where: { organizationId: orgId },
        select: { id: true, customData: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      let maxSerial = 0;
      for (const lead of leads) {
        const value = readNumericCustomValue(lead.customData, field.name);
        if (value !== null && value > maxSerial) maxSerial = value;
      }

      let nextSerial = maxSerial + 1;
      for (const lead of leads) {
        const existingValue = readNumericCustomValue(lead.customData, field.name);
        if (existingValue !== null) continue;
        const currentData =
          lead.customData && typeof lead.customData === 'object'
            ? { ...lead.customData }
            : {};
        currentData[field.name] = nextSerial++;
        await tx.lead.update({
          where: { id: lead.id },
          data: { customData: currentData },
        });
      }
    }
  });
}

// List custom fields
router.get('/custom-fields', async (req, res, next) => {
  try {
    const divisionId = typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;

    // SUPER_ADMIN model:
    // - no divisionId ("All Divisions"): return only group-level global fields
    // - with divisionId: return global + selected division fields (division wins on same name)
    if (req.isSuperAdmin) {
      const groupOrgId = resolveGroupOrgId(req);

      if (divisionId && !req.orgIds.includes(divisionId)) {
        return res.status(403).json({ error: 'Division not found or access denied' });
      }

      if (!divisionId) {
        const globalFields = await prisma.customField.findMany({
          where: {
            organizationId: groupOrgId,
            divisionId: null,
          },
          orderBy: { order: 'asc' },
        });
        return res.json(globalFields);
      }

      const [globalFields, divisionFields] = await Promise.all([
        prisma.customField.findMany({
          where: {
            organizationId: { in: req.orgIds },
            divisionId: null,
          },
          orderBy: { order: 'asc' },
        }),
        prisma.customField.findMany({
          where: { organizationId: divisionId },
          orderBy: { order: 'asc' },
        }),
      ]);

      const byName = new Map();
      for (const field of globalFields) byName.set(field.name, field);
      for (const field of divisionFields) byName.set(field.name, field);

      return res.json(
        Array.from(byName.values()).sort((a, b) => {
          const orderDiff = (a.order ?? 0) - (b.order ?? 0);
          if (orderDiff !== 0) return orderDiff;
          return String(a.label || a.name).localeCompare(String(b.label || b.name));
        })
      );
    }

    const fields = await prisma.customField.findMany({
      where: { organizationId: req.orgId },
      orderBy: { order: 'asc' },
    });
    res.json(fields);
  } catch (err) {
    next(err);
  }
});

// Create custom field
router.post('/custom-fields', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE', 'TEXTAREA', 'CURRENCY']),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional(),
  divisionId: z.string().uuid().optional().nullable(),
  showInList: z.boolean().optional(),
  showInDetail: z.boolean().optional(),
  description: z.string().max(500).optional().nullable(),
  placeholder: z.string().max(200).optional().nullable(),
  defaultValue: z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const { label, type, options, isRequired, divisionId, showInList, showInDetail, description, placeholder, defaultValue } = req.validated;
    const groupOrgId = resolveGroupOrgId(req);
    const targetOrgId = req.isSuperAdmin
      ? (divisionId || groupOrgId)
      : req.orgId;

    // Generate name from label (e.g. "Company Size" -> "companySize")
    const name = label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
      .replace(/\s/g, '');

    // Get next order number
    const maxOrder = await prisma.customField.aggregate({
      where: { organizationId: targetOrgId },
      _max: { order: true },
    });

    const field = await prisma.customField.create({
      data: {
        name,
        label,
        type,
        options: (type === 'SELECT' || type === 'MULTI_SELECT') ? (options || []) : null,
        isRequired: isRequired || false,
        order: (maxOrder._max.order ?? -1) + 1,
        showInList: showInList ?? true,
        showInDetail: showInDetail ?? true,
        description: description || null,
        placeholder: placeholder || null,
        defaultValue: defaultValue || null,
        divisionId: divisionId || null,
        organizationId: targetOrgId,
      },
    });

    await backfillAutoSerialForField(field);

    res.status(201).json(field);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A custom field with this name already exists' });
    }
    next(err);
  }
});

// Update custom field
router.put('/custom-fields/:id', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100).optional(),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE', 'TEXTAREA', 'CURRENCY']).optional(),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().optional(),
  showInList: z.boolean().optional(),
  showInDetail: z.boolean().optional(),
  description: z.string().max(500).optional().nullable(),
  placeholder: z.string().max(200).optional().nullable(),
  defaultValue: z.string().max(500).optional().nullable(),
  divisionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const existing = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    const data = { ...req.validated };

    if (req.isSuperAdmin && Object.prototype.hasOwnProperty.call(data, 'divisionId')) {
      const groupOrgId = resolveGroupOrgId(req);
      if (data.divisionId && !req.orgIds.includes(data.divisionId)) {
        return res.status(403).json({ error: 'Division not found or access denied' });
      }
      if (data.divisionId) {
        data.organizationId = data.divisionId;
      } else {
        data.organizationId = groupOrgId;
        data.divisionId = null;
      }
    }

    if (!req.isSuperAdmin && data.divisionId && data.divisionId !== req.orgId) {
      return res.status(403).json({ error: 'Division not found or access denied' });
    }
    // If label changes, update name too
    if (data.label) {
      data.name = data.label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
        .replace(/\s/g, '');
    }

    const field = await prisma.customField.update({
      where: { id: req.params.id },
      data,
    });

    await backfillAutoSerialForField(field);

    res.json(field);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A custom field with this name already exists' });
    }
    next(err);
  }
});

// Reorder custom fields
router.put('/custom-fields-reorder', authorize('ADMIN'), validate(z.object({
  fieldIds: z.array(z.string()),
})), async (req, res, next) => {
  try {
    const { fieldIds } = req.validated;
    const updates = fieldIds.map((id, index) =>
      prisma.customField.updateMany({
        where: { id, organizationId: { in: req.orgIds } },
        data: { order: index },
      })
    );
    await prisma.$transaction(updates);
    res.json({ message: 'Reordered' });
  } catch (err) {
    next(err);
  }
});

// Delete custom field
router.delete('/custom-fields/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    await prisma.customField.delete({ where: { id: req.params.id } });

    // Clean up: remove this field's data from all leads' customData
    const leads = await prisma.lead.findMany({
      where: { organizationId: existing.organizationId },
      select: { id: true, customData: true },
    });

    const updates = leads
      .filter(l => {
        const data = typeof l.customData === 'object' && l.customData ? l.customData : {};
        return existing.name in data;
      })
      .map(l => {
        const data = { ...(typeof l.customData === 'object' && l.customData ? l.customData : {}) };
        delete data[existing.name];
        return prisma.lead.update({ where: { id: l.id }, data: { customData: data } });
      });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    res.json({ message: 'Custom field deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── SLA Configuration ──────────────────────────────────────

const { getSLAConfig, DEFAULT_SLA_CONFIG, getLeadSLAInfo } = require('../services/slaMonitor');

// Get SLA settings
router.get('/sla', authorize('ADMIN'), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const slaConfig = getSLAConfig(settings);
    res.json(slaConfig);
  } catch (err) {
    next(err);
  }
});

// Update SLA settings
router.put('/sla', authorize('ADMIN'), validate(z.object({
  enabled: z.boolean(),
  thresholds: z.object({
    warningMinutes: z.coerce.number().int().min(1).max(10080),
    breachMinutes: z.coerce.number().int().min(1).max(10080),
    escalationMinutes: z.coerce.number().int().min(1).max(10080),
    reassignMinutes: z.coerce.number().int().min(1).max(10080),
  }).optional(),
  actions: z.object({
    onWarning: z.enum(['notify', 'none']).optional(),
    onBreach: z.enum(['remind', 'notify', 'none']).optional(),
    onEscalation: z.enum(['notify_manager', 'reassign', 'notify', 'none']).optional(),
    onReassign: z.enum(['reassign', 'notify', 'none']).optional(),
  }).optional(),
  escalationContactId: z.string().uuid().optional().nullable(),
  workingHoursOnly: z.boolean().optional(),
  excludeStatuses: z.array(z.string()).optional(),
})), async (req, res, next) => {
  try {
    const data = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const currentSla = settings.sla || {};

    const updatedSla = {
      ...DEFAULT_SLA_CONFIG,
      ...currentSla,
      ...data,
      thresholds: { ...DEFAULT_SLA_CONFIG.thresholds, ...(currentSla.thresholds || {}), ...(data.thresholds || {}) },
      actions: { ...DEFAULT_SLA_CONFIG.actions, ...(currentSla.actions || {}), ...(data.actions || {}) },
    };

    await prisma.organization.update({
      where: { id: req.orgId },
      data: { settings: { ...settings, sla: updatedSla } },
    });

    res.json(updatedSla);
  } catch (err) {
    next(err);
  }
});

// Get SLA dashboard stats
router.get('/sla/dashboard', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const config = getSLAConfig(settings);

    if (!config.enabled) {
      return res.json({ enabled: false });
    }

    // Get SLA status counts
    const [onTime, atRisk, breached, escalated, responded] = await Promise.all([
      prisma.lead.count({ where: { organizationId: { in: req.orgIds }, isArchived: false, slaStatus: 'ON_TIME', status: { notIn: config.excludeStatuses } } }),
      prisma.lead.count({ where: { organizationId: { in: req.orgIds }, isArchived: false, slaStatus: 'AT_RISK', status: { notIn: config.excludeStatuses } } }),
      prisma.lead.count({ where: { organizationId: { in: req.orgIds }, isArchived: false, slaStatus: 'BREACHED', status: { notIn: config.excludeStatuses } } }),
      prisma.lead.count({ where: { organizationId: { in: req.orgIds }, isArchived: false, slaStatus: 'ESCALATED', status: { notIn: config.excludeStatuses } } }),
      prisma.lead.count({ where: { organizationId: { in: req.orgIds }, isArchived: false, slaStatus: 'RESPONDED', status: { notIn: config.excludeStatuses } } }),
    ]);

    // Get average response time for responded leads
    const respondedLeads = await prisma.lead.findMany({
      where: {
        organizationId: { in: req.orgIds },
        isArchived: false,
        firstRespondedAt: { not: null },
      },
      select: { createdAt: true, firstRespondedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let avgResponseMinutes = 0;
    if (respondedLeads.length > 0) {
      const totalMinutes = respondedLeads.reduce((sum, l) => {
        const diff = new Date(l.firstRespondedAt).getTime() - new Date(l.createdAt).getTime();
        return sum + diff / 60000;
      }, 0);
      avgResponseMinutes = Math.round(totalMinutes / respondedLeads.length);
    }

    // Get breached leads needing attention
    const breachedLeads = await prisma.lead.findMany({
      where: {
        organizationId: { in: req.orgIds },
        isArchived: false,
        slaStatus: { in: ['BREACHED', 'ESCALATED', 'AT_RISK'] },
        status: { notIn: config.excludeStatuses },
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const enrichedBreachedLeads = breachedLeads.map(lead => ({
      ...lead,
      slaInfo: getLeadSLAInfo(lead, settings),
    }));

    res.json({
      enabled: true,
      thresholds: config.thresholds,
      counts: { onTime, atRisk, breached, escalated, responded },
      avgResponseMinutes,
      breachedLeads: enrichedBreachedLeads,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Email Configuration ─────────────────────────────────────

const { testConnection, sendTestEmail } = require('../services/emailService');

// Helper: resolve the target division ID for email settings
// SUPER_ADMIN must specify ?divisionId=<id>; ADMIN uses their own org
async function resolveEmailOrgId(req, res) {
  const { divisionId } = req.query;

  if (req.isSuperAdmin) {
    if (!divisionId) {
      res.status(400).json({ error: 'Please select a division to configure email settings' });
      return null;
    }
    // Verify divisionId is a valid child division
    if (!req.orgIds.includes(divisionId)) {
      res.status(403).json({ error: 'Division not found or access denied' });
      return null;
    }
    return divisionId;
  }

  // ADMIN uses their own orgId (which is already a division)
  return req.orgId;
}

// Get email config
router.get('/email', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const emailConfig = settings.emailConfig || {};

    // Never return the password in plain text
    const sanitized = { ...emailConfig };
    if (sanitized.smtpPass) {
      sanitized.smtpPass = '••••••••';
      sanitized.hasPassword = true;
    }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Save email config
router.put('/email', authorize('ADMIN'), validate(z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().optional(),
  fromName: z.string().min(1).max(200),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const existingConfig = settings.emailConfig || {};

    // If password is masked or empty, keep the existing one
    if (!data.smtpPass || data.smtpPass === '••••••••') {
      data.smtpPass = existingConfig.smtpPass || '';
    }

    const emailConfig = {
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: data.smtpPass,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
    };

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailConfig } },
    });

    const sanitized = { ...emailConfig, smtpPass: '••••••••', hasPassword: true };
    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Test SMTP connection
router.post('/email/test-connection', authorize('ADMIN'), validate(z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.smtpPass || data.smtpPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.smtpPass = settings.emailConfig?.smtpPass || '';
    }

    const result = await testConnection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Send test email
router.post('/email/send-test', authorize('ADMIN'), validate(z.object({
  toEmail: z.string().email(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { toEmail } = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const emailConfig = settings.emailConfig;

    if (!emailConfig || !emailConfig.smtpHost) {
      return res.status(400).json({ success: false, message: 'Email not configured. Please save your SMTP settings first.' });
    }

    const result = await sendTestEmail(emailConfig, toEmail);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Incoming Email Configuration (IMAP / POP3) ─────────────

const { testImapConnection, testPop3Connection, fetchEmails } = require('../services/emailReceiveService');

// Get incoming email config
router.get('/email/incoming', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const config = settings.incomingEmailConfig || {};

    // Never return passwords in plain text
    const sanitized = { ...config };
    if (sanitized.imapPass) {
      sanitized.imapPass = '••••••••';
      sanitized.hasImapPassword = true;
    }
    if (sanitized.popPass) {
      sanitized.popPass = '••••••••';
      sanitized.hasPopPassword = true;
    }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Save incoming email config
router.put('/email/incoming', authorize('ADMIN'), validate(z.object({
  protocol: z.enum(['imap', 'pop3']),
  // IMAP fields
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
  imapSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
  imapFolder: z.string().optional(),
  // POP3 fields
  popHost: z.string().optional(),
  popPort: z.coerce.number().int().min(1).max(65535).optional(),
  popUser: z.string().optional(),
  popPass: z.string().optional(),
  popSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
  popDeleteAfterFetch: z.boolean().optional(),
  // Common
  fetchInterval: z.coerce.number().int().min(1).max(1440).optional(),
  autoFetch: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const existingConfig = settings.incomingEmailConfig || {};

    // If passwords are masked or empty, keep the existing ones
    if (!data.imapPass || data.imapPass === '••••••••') {
      data.imapPass = existingConfig.imapPass || '';
    }
    if (!data.popPass || data.popPass === '••••••••') {
      data.popPass = existingConfig.popPass || '';
    }

    const incomingEmailConfig = {
      protocol: data.protocol,
      // IMAP
      imapHost: data.imapHost || existingConfig.imapHost || '',
      imapPort: data.imapPort || existingConfig.imapPort || 993,
      imapUser: data.imapUser || existingConfig.imapUser || '',
      imapPass: data.imapPass,
      imapSecurity: data.imapSecurity || existingConfig.imapSecurity || 'ssl',
      imapFolder: data.imapFolder || existingConfig.imapFolder || 'INBOX',
      // POP3
      popHost: data.popHost || existingConfig.popHost || '',
      popPort: data.popPort || existingConfig.popPort || 995,
      popUser: data.popUser || existingConfig.popUser || '',
      popPass: data.popPass,
      popSecurity: data.popSecurity || existingConfig.popSecurity || 'ssl',
      popDeleteAfterFetch: data.popDeleteAfterFetch ?? existingConfig.popDeleteAfterFetch ?? false,
      // Common
      fetchInterval: data.fetchInterval || existingConfig.fetchInterval || 5,
      autoFetch: data.autoFetch ?? existingConfig.autoFetch ?? false,
    };

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, incomingEmailConfig } },
    });

    // Return sanitized config
    const sanitized = { ...incomingEmailConfig };
    if (sanitized.imapPass) { sanitized.imapPass = '••••••••'; sanitized.hasImapPassword = true; }
    if (sanitized.popPass) { sanitized.popPass = '••••••••'; sanitized.hasPopPassword = true; }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Test IMAP connection
router.post('/email/incoming/test-imap', authorize('ADMIN'), validate(z.object({
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapUser: z.string().min(1),
  imapPass: z.string().optional(),
  imapSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.imapPass || data.imapPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.imapPass = settings.incomingEmailConfig?.imapPass || '';
    }

    const result = await testImapConnection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Test POP3 connection
router.post('/email/incoming/test-pop3', authorize('ADMIN'), validate(z.object({
  popHost: z.string().min(1),
  popPort: z.coerce.number().int().min(1).max(65535),
  popUser: z.string().min(1),
  popPass: z.string().optional(),
  popSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.popPass || data.popPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.popPass = settings.incomingEmailConfig?.popPass || '';
    }

    const result = await testPop3Connection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Fetch emails from configured incoming server
router.post('/email/incoming/fetch', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const result = await fetchEmails(targetOrgId, {
      limit: 20,
      markAsRead: false,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Email Templates ────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    name: 'welcome',
    label: 'Welcome',
    subject: 'Welcome to {{companyName}}!',
    body: `Welcome, {{firstName}}!

Thank you for your interest in {{companyName}}. We're excited to connect with you.

A member of our team will be in touch shortly to discuss how we can help.

Best regards,
{{senderName}}`,
    description: 'Sent to new leads when they first enter the system',
    isDefault: true,
  },
  {
    name: 'follow-up',
    label: 'Follow Up',
    subject: 'Following up — {{companyName}}',
    body: `Hi {{firstName}},

I wanted to follow up on our recent conversation. Do you have any questions or would you like to schedule a call?

I'm happy to help with anything you need.

Best regards,
{{senderName}}`,
    description: 'Follow-up email for leads that have been contacted',
    isDefault: true,
  },
  {
    name: 'proposal',
    label: 'Proposal',
    subject: 'Proposal from {{companyName}}',
    body: `Hi {{firstName}},

Please find our proposal details below. We've tailored this based on our discussion about your needs.

Feel free to reach out if you have any questions or would like to discuss further.

Best regards,
{{senderName}}`,
    description: 'Sent when sharing a proposal with a lead',
    isDefault: true,
  },
  {
    name: 'meeting-reminder',
    label: 'Meeting Reminder',
    subject: 'Reminder: Upcoming meeting — {{companyName}}',
    body: `Hi {{firstName}},

This is a friendly reminder about our upcoming meeting.

Looking forward to speaking with you!

Best regards,
{{senderName}}`,
    description: 'Reminder email before a scheduled meeting',
    isDefault: true,
  },
  {
    name: 'thank-you',
    label: 'Thank You',
    subject: 'Thank you — {{companyName}}',
    body: `Thank you, {{firstName}}!

We truly appreciate your business and trust in {{companyName}}.

If there's anything else we can help with, please don't hesitate to reach out.

Warm regards,
{{senderName}}`,
    description: 'Thank you email after closing a deal',
    isDefault: true,
  },
  {
    name: 'status-update',
    label: 'Status Update',
    subject: 'Lead Status Update: {{firstName}} {{lastName}}',
    body: `Hi,

This is to inform you that the status of lead {{firstName}} {{lastName}} has been updated.

New Status: {{status}}
Company: {{company}}
Email: {{email}}
Phone: {{phone}}

Please take the necessary action.

Best regards,
{{companyName}} CRM`,
    description: 'Notification when lead status changes — can be sent to users or external emails',
    isDefault: true,
  },
  {
    name: 'sla-breach-alert',
    label: 'SLA Breach Alert',
    subject: '⚠️ SLA Breach: {{firstName}} {{lastName}} needs immediate attention',
    body: `Hi {{senderName}},

URGENT: Lead {{firstName}} {{lastName}} has breached the SLA response time and requires immediate attention.

Lead Details:
• Name: {{firstName}} {{lastName}}
• Email: {{email}}
• Phone: {{phone}}
• Company: {{company}}
• Status: {{status}}

This lead has not been contacted within the expected response window. Please take action immediately or escalate to your manager.

— {{companyName}} CRM`,
    description: 'Sent to the assigned rep or manager when a lead breaches the SLA response time',
    isDefault: true,
  },
  {
    name: 'post-meeting-thank-you',
    label: 'Post-Meeting Thank You',
    subject: 'Great meeting with you — {{companyName}}',
    body: `Hi {{firstName}},

Thank you for taking the time to meet with us today. It was a pleasure learning more about your needs.

As discussed, here are the next steps we'll be taking:
• We will prepare a tailored proposal based on your requirements
• Our team will follow up within the next 2 business days

If you have any questions in the meantime, please don't hesitate to reach out.

Looking forward to working together!

Best regards,
{{senderName}}
{{companyName}}`,
    description: 'Sent after a meeting to thank the lead and outline next steps',
    isDefault: true,
  },
  {
    name: 're-engagement',
    label: 'Re-Engagement',
    subject: 'We miss you, {{firstName}}! — {{companyName}}',
    body: `Hi {{firstName}},

It's been a while since we last connected, and I wanted to reach out to see how things are going.

At {{companyName}}, we've been working on some exciting new offerings that might be of interest to you.

Would you be open to a quick call to catch up? I'd love to explore how we can help.

Looking forward to hearing from you!

Best regards,
{{senderName}}
{{companyName}}`,
    description: 'Sent to leads that have been inactive for 30+ days to re-engage them',
    isDefault: true,
  },
  {
    name: 'referral-request',
    label: 'Referral Request',
    subject: 'A small favour — {{companyName}}',
    body: `Hi {{firstName}},

I hope you've been enjoying your experience with {{companyName}}! We truly value our partnership.

If you know anyone who could benefit from our services, we'd be grateful for a referral. A warm introduction goes a long way, and we promise to take excellent care of anyone you send our way.

As a token of appreciation, we offer special benefits for both you and anyone you refer.

Thank you for your trust and support!

Warm regards,
{{senderName}}
{{companyName}}`,
    description: 'Sent to won customers 14 days after closing to request referrals',
    isDefault: true,
  },
];

// Get email templates
router.get('/email/templates', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const templates = settings.emailTemplates || DEFAULT_TEMPLATES;

    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// Save a single email template (create or update by name)
// Accepts plain text `body` (admin-friendly) or legacy `htmlBody`
router.put('/email/templates/:name', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).optional(),
  htmlBody: z.string().optional(),
  description: z.string().max(500).optional(),
}).refine((d) => d.body || d.htmlBody, { message: 'Either body or htmlBody is required' })), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { name } = req.params;
    const data = req.validated;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    let templates = settings.emailTemplates || [...DEFAULT_TEMPLATES];

    const existingIdx = templates.findIndex((t) => t.name === name);
    const templateData = {
      name,
      label: data.label,
      subject: data.subject,
      description: data.description || '',
      isDefault: false,
    };

    // Store plain text body (preferred) or legacy htmlBody
    if (data.body) {
      templateData.body = data.body;
      // Remove legacy htmlBody if switching to plain text
      templateData.htmlBody = undefined;
    } else if (data.htmlBody) {
      templateData.htmlBody = data.htmlBody;
    }

    if (existingIdx >= 0) {
      templates[existingIdx] = { ...templates[existingIdx], ...templateData };
      // Clean up: if switching to body, remove old htmlBody
      if (data.body) {
        delete templates[existingIdx].htmlBody;
      }
    } else {
      templates.push(templateData);
    }

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailTemplates: templates } },
    });

    res.json(templates[existingIdx >= 0 ? existingIdx : templates.length - 1]);
  } catch (err) {
    next(err);
  }
});

// Preview an email template — renders with sample variables
router.post('/email/templates/preview', authorize('ADMIN'), validate(z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  htmlBody: z.string().optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { renderTemplate, wrapInHtmlLayout, textToHtml } = require('../services/emailService');

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { name: true, tradeName: true, primaryColor: true },
    });

    const sampleVariables = {
      firstName: 'Ahmed',
      lastName: 'Al-Zaabi',
      email: 'ahmed@example.com',
      phone: '+971 50 123 4567',
      company: 'Sample Corp',
      companyName: org?.tradeName || org?.name || 'Your Company',
      senderName: 'Sales Team',
      status: 'QUALIFIED',
      source: 'WEBSITE',
      jobTitle: 'Manager',
      location: 'Dubai, UAE',
      assignedTo: 'Sarah Johnson',
    };

    const layoutOptions = {
      orgName: org?.tradeName || org?.name || 'Your Company',
      brandColor: org?.primaryColor || '#6366f1',
    };

    const template = {
      subject: req.validated.subject || 'Preview Subject',
      body: req.validated.body,
      htmlBody: req.validated.htmlBody,
    };

    const result = renderTemplate(template, sampleVariables, layoutOptions);
    res.json({ subject: result.subject, html: result.html });
  } catch (err) {
    next(err);
  }
});

// Delete an email template
router.delete('/email/templates/:name', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { name } = req.params;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    let templates = settings.emailTemplates || [...DEFAULT_TEMPLATES];

    templates = templates.filter((t) => t.name !== name);

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailTemplates: templates } },
    });

    res.json({ message: 'Template deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
