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
          select: { id: true, name: true, plan: true },
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
        id: true, name: true, domain: true, plan: true,
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
        id: true, name: true, domain: true, plan: true,
        settings: true, updatedAt: true,
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
      where: { organizationId: req.orgId },
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

    // Don't allow last admin to delete account
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { organizationId: req.orgId, role: 'ADMIN', isActive: true },
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

module.exports = router;
