const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, orgScope);

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
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });

    const settings = typeof org.settings === 'object' ? org.settings : {};
    const userNotifs = settings[`notifs_${req.user.id}`] || {
      emailNewLead: true,
      emailLeadAssigned: true,
      emailTaskDue: true,
      emailWeeklyDigest: true,
      inAppNewLead: true,
      inAppLeadAssigned: true,
      inAppTaskDue: true,
      inAppStatusChange: true,
    };

    res.json(userNotifs);
  } catch (err) {
    next(err);
  }
});

// ─── Update Notification Preferences ────────────────────────────
router.put('/notifications', validate(z.object({
  emailNewLead: z.boolean().optional(),
  emailLeadAssigned: z.boolean().optional(),
  emailTaskDue: z.boolean().optional(),
  emailWeeklyDigest: z.boolean().optional(),
  inAppNewLead: z.boolean().optional(),
  inAppLeadAssigned: z.boolean().optional(),
  inAppTaskDue: z.boolean().optional(),
  inAppStatusChange: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });

    const settings = typeof org.settings === 'object' ? org.settings : {};
    const currentNotifs = settings[`notifs_${req.user.id}`] || {};
    const updated = { ...currentNotifs, ...req.validated };

    await prisma.organization.update({
      where: { id: req.orgId },
      data: {
        settings: { ...settings, [`notifs_${req.user.id}`]: updated },
      },
    });

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

// ─── Custom Fields ─────────────────────────────────────────────

// List custom fields
router.get('/custom-fields', async (req, res, next) => {
  try {
    const fields = await prisma.customField.findMany({
      where: { organizationId: { in: req.orgIds } },
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
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE']),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional(),
  divisionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const { label, type, options, isRequired, divisionId } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

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
        organizationId: targetOrgId,
      },
    });

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
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE']).optional(),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const existing = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    const data = { ...req.validated };
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

module.exports = router;
