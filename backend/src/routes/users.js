const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { broadcastDataChange } = require('../websocket/server');

const router = Router();
router.use(authenticate, orgScope);

// Default permission matrix
const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: true, invite: true, deleteData: true, exportData: true, divisions: true },
  ADMIN: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: true, invite: true, deleteData: true, exportData: true },
  MANAGER: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: false, invite: true, deleteData: false, exportData: true },
  SALES_REP: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: false, automations: false, campaigns: false, team: false, settings: false, invite: false, deleteData: false, exportData: false },
  VIEWER: { dashboard: true, leads: true, pipeline: true, tasks: false, analytics: true, automations: false, campaigns: false, team: false, settings: false, invite: false, deleteData: false, exportData: false },
};

// ─── Get Permissions Config ─────────────────────────────────────
router.get('/permissions', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' && org.settings !== null ? org.settings : {};
    const rolePermissions = settings.rolePermissions || DEFAULT_PERMISSIONS;
    const userOverrides = settings.userPermissionOverrides || {};
    res.json({ rolePermissions, userOverrides, defaults: DEFAULT_PERMISSIONS });
  } catch (err) {
    next(err);
  }
});

// ─── Update Role Permissions ────────────────────────────────────
router.put('/permissions/roles', authorize('ADMIN'), validate(z.object({
  rolePermissions: z.record(z.record(z.boolean())),
})), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' && org.settings !== null ? org.settings : {};
    const updated = { ...settings, rolePermissions: req.validated.rolePermissions };
    await prisma.organization.update({
      where: { id: req.orgId },
      data: { settings: updated },
    });
    res.json({ rolePermissions: req.validated.rolePermissions });
  } catch (err) {
    next(err);
  }
});

// ─── Update User Permission Overrides ───────────────────────────
router.put('/permissions/user/:userId', authorize('ADMIN'), validate(z.object({
  permissions: z.record(z.boolean()).nullable(),
})), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' && org.settings !== null ? org.settings : {};
    const overrides = settings.userPermissionOverrides || {};
    if (req.validated.permissions === null) {
      delete overrides[req.params.userId];
    } else {
      overrides[req.params.userId] = req.validated.permissions;
    }
    const updated = { ...settings, userPermissionOverrides: overrides };
    await prisma.organization.update({
      where: { id: req.orgId },
      data: { settings: updated },
    });
    res.json({ userId: req.params.userId, permissions: req.validated.permissions });
  } catch (err) {
    next(err);
  }
});

// ─── List Users ──────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { divisionId } = req.query;

    // SUPER_ADMIN sees users across all divisions; optionally filter by division
    let orgFilter;
    if (divisionId && req.isSuperAdmin) {
      orgFilter = divisionId;
    } else {
      orgFilter = { in: req.orgIds };
    }

    const users = await prisma.user.findMany({
      where: { organizationId: orgFilter },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true, isActive: true,
        lastLoginAt: true, createdAt: true, organizationId: true,
        _count: { select: { assignedLeads: true, tasks: true } },
      },
      orderBy: { firstName: 'asc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// ─── Invite User ─────────────────────────────────────────────────
router.post('/invite', authorize('ADMIN', 'MANAGER'), validate(z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']),
  password: z.string().min(8),
  divisionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const { email, firstName, lastName, role, password, divisionId } = req.validated;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // SUPER_ADMIN must specify which division when inviting
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email, firstName, lastName, role, passwordHash,
        organizationId: targetOrgId,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, createdAt: true, organizationId: true,
      },
    });

    res.status(201).json(user);

    // ── Fire-and-forget notification — notify org admins ──
    notifyOrgAdmins(targetOrgId, {
      type: NOTIFICATION_TYPES.TEAM_MEMBER_INVITED,
      title: 'New Team Member',
      message: `${req.user.firstName} ${req.user.lastName} invited ${email}`,
      entityType: 'user',
      entityId: user.id,
    }, req.user.id).catch(() => {});

    broadcastDataChange(targetOrgId, 'user', 'created', req.user.id, { entityId: user.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Update User ─────────────────────────────────────────────────
router.put('/:id', authorize('ADMIN'), validate(z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  phone: z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    // Verify user belongs to accessible orgs
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.validated,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, phone: true, organizationId: true,
      },
    });
    res.json(user);

    // ── Fire-and-forget notification — if role changed, notify the user ──
    if (req.validated.role && req.validated.role !== existing.role) {
      createNotification({
        type: NOTIFICATION_TYPES.TEAM_MEMBER_ROLE_CHANGED,
        title: 'Role Updated',
        message: `Your role has been changed to ${req.validated.role}`,
        userId: req.params.id,
        actorId: req.user.id,
        entityType: 'user',
        entityId: req.params.id,
        organizationId: existing.organizationId,
      }).catch(() => {});
    }

    broadcastDataChange(existing.organizationId, 'user', 'updated', req.user.id, { entityId: user.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Reset User Password (Admin) ─────────────────────────────────
router.put('/:id/reset-password', authorize('ADMIN'), validate(z.object({
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
    // Verify user belongs to accessible orgs
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const passwordHash = await bcrypt.hash(req.validated.newPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Reactivate User ────────────────────────────────────────────
router.post('/:id/reactivate', authorize('ADMIN'), async (req, res, next) => {
  try {
    // Verify user belongs to accessible orgs
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: true },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, organizationId: true,
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Deactivate User ─────────────────────────────────────────────
router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    // Verify user belongs to accessible orgs
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ message: 'User deactivated' });

    // ── Fire-and-forget notification — notify org admins ──
    notifyOrgAdmins(existing.organizationId, {
      type: NOTIFICATION_TYPES.TEAM_MEMBER_DEACTIVATED,
      title: 'Team Member Deactivated',
      message: `${req.user.firstName} ${req.user.lastName} deactivated ${existing.firstName} ${existing.lastName}`,
      entityType: 'user',
      entityId: existing.id,
    }, req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
