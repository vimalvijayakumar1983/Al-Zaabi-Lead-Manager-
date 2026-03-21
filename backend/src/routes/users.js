const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { broadcastDataChange } = require('../websocket/server');
const { sendInviteEmail } = require('../email');

// ─── Display name helper (deduplication) ─────────────────────────
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown';
  if (!ln) return fn;
  if (!fn) return ln;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

const router = Router();
router.use(authenticate, orgScope);

// Default permission matrix
const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, integrations: true, import: true, team: true, roles: true, settings: true, invite: true, notifications: true, deleteData: true, exportData: true, divisions: true },
  ADMIN: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, integrations: true, import: true, team: true, roles: true, settings: true, invite: true, notifications: true, deleteData: true, exportData: true, divisions: false },
  MANAGER: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, integrations: false, import: false, team: true, roles: false, settings: false, invite: true, notifications: true, deleteData: false, exportData: true, divisions: false },
  SALES_REP: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: false, automations: false, campaigns: false, integrations: false, import: false, team: false, roles: false, settings: false, invite: false, notifications: true, deleteData: false, exportData: false, divisions: false },
  VIEWER: { dashboard: true, leads: true, contacts: true, inbox: false, pipeline: true, tasks: false, analytics: true, automations: false, campaigns: false, integrations: false, import: false, team: false, roles: false, settings: false, invite: false, notifications: true, deleteData: false, exportData: false, divisions: false },
};

function mergeRolePermissions(input) {
  const incoming = input && typeof input === 'object' ? input : {};
  const merged = {};

  for (const [role, defaults] of Object.entries(DEFAULT_PERMISSIONS)) {
    merged[role] = { ...defaults, ...(incoming[role] || {}) };
  }

  for (const [role, perms] of Object.entries(incoming)) {
    if (!merged[role]) {
      merged[role] = perms;
    }
  }

  return merged;
}

// ─── Get Permissions Config ─────────────────────────────────────
router.get('/permissions', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' && org.settings !== null ? org.settings : {};
    const rolePermissions = mergeRolePermissions(settings.rolePermissions);
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
    const normalizedRolePermissions = mergeRolePermissions(req.validated.rolePermissions);
    const updated = { ...settings, rolePermissions: normalizedRolePermissions };
    await prisma.organization.update({
      where: { id: req.orgId },
      data: { settings: updated },
    });
    res.json({ rolePermissions: normalizedRolePermissions });
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

    // ── Fire-and-forget: Send invitation email with credentials ──
    const orgInfo = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { name: true, parentId: true } });
    const emailOrgId = orgInfo?.parentId || targetOrgId;
    const inviterName = getDisplayName(req.user);
    sendInviteEmail(email, password, getDisplayName({ firstName, lastName }), orgInfo?.name, role, inviterName, emailOrgId).catch((err) => {
      console.error('Failed to send invite email:', err.message);
    });

    // ── Fire-and-forget notification — notify org admins ──
    notifyOrgAdmins(targetOrgId, {
      type: NOTIFICATION_TYPES.TEAM_MEMBER_INVITED,
      title: 'New Team Member',
      message: `${getDisplayName(req.user)} invited ${email}`,
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
      message: `${getDisplayName(req.user)} deactivated ${getDisplayName(existing)}`,
      entityType: 'user',
      entityId: existing.id,
    }, req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});




// ─── Permanent Delete ────────────────────────────────────────────
// DELETE /users/:id/permanent - Permanently delete a user and all associated data
router.delete('/:id/permanent', authorize('ADMIN'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      include: {
        _count: { select: { assignedLeads: true, tasks: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const { reassignTo } = req.body || {};

    // If user has leads, they must be reassigned
    if (existing._count.assignedLeads > 0 && !reassignTo) {
      return res.status(400).json({
        error: 'User has assigned leads. Provide reassignTo userId or reassign leads first.',
        leadsCount: existing._count.assignedLeads,
        tasksCount: existing._count.tasks,
      });
    }

    // Reassign leads and tasks if specified
    if (reassignTo) {
      const reassignUser = await prisma.user.findFirst({
        where: { id: reassignTo, organizationId: { in: req.orgIds }, isActive: true },
      });
      if (!reassignUser) {
        return res.status(400).json({ error: 'Reassign target user not found or inactive' });
      }

      await prisma.lead.updateMany({
        where: { assignedToId: req.params.id },
        data: { assignedToId: reassignTo },
      });

      await prisma.task.updateMany({
        where: { assigneeId: req.params.id },
        data: { assigneeId: reassignTo },
      });
    }

    // Delete related records in order (handle foreign key constraints)
    await prisma.$transaction(async (tx) => {
      // Delete division memberships
      await tx.divisionMembership.deleteMany({ where: { userId: req.params.id } });

      // Delete notifications
      await tx.notification.deleteMany({ where: { userId: req.params.id } });

      // Delete notification preferences
      await tx.notificationPreference.deleteMany({ where: { userId: req.params.id } });

      // Delete lead activities by user
      await tx.leadActivity.deleteMany({ where: { userId: req.params.id } });

      // Delete the user
      await tx.user.delete({ where: { id: req.params.id } });
    });

    res.json({
      message: `User ${getDisplayName(existing)} permanently deleted`,
      reassignedLeads: existing._count.assignedLeads,
      reassignedTasks: existing._count.tasks,
    });

    // Fire-and-forget notification
    notifyOrgAdmins(existing.organizationId, {
      type: NOTIFICATION_TYPES.TEAM_MEMBER_DEACTIVATED || 'TEAM_MEMBER_DEACTIVATED',
      title: 'Team Member Deleted',
      message: `${getDisplayName(req.user)} permanently deleted ${getDisplayName(existing)}`,
      entityType: 'user',
      entityId: existing.id,
    }, req.user.id).catch(() => {});

    broadcastDataChange(existing.organizationId, 'user', 'deleted', req.user.id, { entityId: existing.id }).catch(() => {});
  } catch (err) {
    // Handle foreign key constraint errors gracefully
    if (err.code === 'P2003') {
      return res.status(400).json({
        error: 'Cannot delete user: they have associated records. Try deactivating instead, or reassign all their data first.',
      });
    }
    next(err);
  }
});


// ─── Division Memberships ─────────────────────────────────────


// GET /users/:userId/divisions - Get user's division memberships
router.get('/:userId/divisions', async (req, res) => {
  try {
    const memberships = await prisma.divisionMembership.findMany({
      where: { userId: req.params.userId },
      include: {
        division: {
          select: { id: true, name: true, tradeName: true, logo: true, primaryColor: true, type: true }
        }
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
    });
    res.json({ memberships });
  } catch (error) {
    console.error('Get user divisions error:', error);
    res.status(500).json({ error: 'Failed to fetch division memberships' });
  }
});

// POST /users/:userId/divisions - Add user to a division with role
router.post('/:userId/divisions', async (req, res) => {
  try {
    const { divisionId, role } = req.body;
    if (!divisionId) return res.status(400).json({ error: 'divisionId is required' });

    // Check if membership already exists
    const existing = await prisma.divisionMembership.findUnique({
      where: { userId_divisionId: { userId: req.params.userId, divisionId } }
    });
    if (existing) return res.status(409).json({ error: 'User already belongs to this division' });

    // Check if user has any memberships (first one becomes primary)
    const count = await prisma.divisionMembership.count({
      where: { userId: req.params.userId }
    });

    const membership = await prisma.divisionMembership.create({
      data: {
        userId: req.params.userId,
        divisionId,
        role: role || 'SALES_REP',
        isPrimary: count === 0
      },
      include: {
        division: {
          select: { id: true, name: true, tradeName: true, logo: true, primaryColor: true, type: true }
        }
      }
    });

    res.status(201).json({ membership });
  } catch (error) {
    console.error('Add division membership error:', error);
    res.status(500).json({ error: 'Failed to add division membership' });
  }
});

// PUT /users/:userId/divisions/:divisionId - Update role in division
router.put('/:userId/divisions/:divisionId', async (req, res) => {
  try {
    const { role, isPrimary } = req.body;

    const updateData = {};
    if (role) updateData.role = role;
    if (typeof isPrimary === 'boolean') {
      updateData.isPrimary = isPrimary;
      // If setting as primary, unset other primaries
      if (isPrimary) {
        await prisma.divisionMembership.updateMany({
          where: { userId: req.params.userId, NOT: { divisionId: req.params.divisionId } },
          data: { isPrimary: false }
        });
      }
    }

    const membership = await prisma.divisionMembership.update({
      where: {
        userId_divisionId: {
          userId: req.params.userId,
          divisionId: req.params.divisionId
        }
      },
      data: { ...updateData, updatedAt: new Date() },
      include: {
        division: {
          select: { id: true, name: true, tradeName: true, logo: true, primaryColor: true, type: true }
        }
      }
    });

    res.json({ membership });
  } catch (error) {
    console.error('Update division membership error:', error);
    res.status(500).json({ error: 'Failed to update division membership' });
  }
});

// DELETE /users/:userId/divisions/:divisionId - Remove from division
router.delete('/:userId/divisions/:divisionId', async (req, res) => {
  try {
    // Don't allow removing the primary division (or the last one)
    const memberships = await prisma.divisionMembership.findMany({
      where: { userId: req.params.userId }
    });

    if (memberships.length <= 1) {
      return res.status(400).json({ error: 'Cannot remove user from their only division' });
    }

    const target = memberships.find(m => m.divisionId === req.params.divisionId);
    if (!target) return res.status(404).json({ error: 'Membership not found' });

    await prisma.divisionMembership.delete({
      where: {
        userId_divisionId: {
          userId: req.params.userId,
          divisionId: req.params.divisionId
        }
      }
    });

    // If we deleted the primary, make the first remaining one primary
    if (target.isPrimary) {
      const remaining = memberships.filter(m => m.divisionId !== req.params.divisionId);
      if (remaining.length > 0) {
        await prisma.divisionMembership.update({
          where: {
            userId_divisionId: {
              userId: req.params.userId,
              divisionId: remaining[0].divisionId
            }
          },
          data: { isPrimary: true }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete division membership error:', error);
    res.status(500).json({ error: 'Failed to remove division membership' });
  }
});


module.exports = router;
