const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────

const createDivisionSchema = z.object({
  name: z.string().min(1, 'Division name is required'),
  tradeName: z.string().optional(),
  logo: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

const updateDivisionSchema = z.object({
  name: z.string().min(1).optional(),
  tradeName: z.string().optional(),
  logo: z.string().url().optional().or(z.literal('')).or(z.null()),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

const transferUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  targetDivisionId: z.string().uuid('Invalid target division ID'),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']),
  password: z.string().min(8),
});

const updateDivisionUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  phone: z.string().optional().nullable(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

// Default pipeline stages (same as auth.js register)
const DEFAULT_PIPELINE_STAGES = [
  { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true },
  { name: 'Contacted', order: 1, color: '#3b82f6' },
  { name: 'Qualified', order: 2, color: '#06b6d4' },
  { name: 'Proposal Sent', order: 3, color: '#f59e0b' },
  { name: 'Negotiation', order: 4, color: '#f97316' },
  { name: 'Won', order: 5, color: '#22c55e', isWonStage: true },
  { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true },
];

// All routes require authentication and org scoping
router.use(authenticate, orgScope);

// ─── GET / — List divisions ─────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'SUPER_ADMIN') {
      // Super Admin: list all child divisions of their group
      const divisions = await prisma.organization.findMany({
        where: {
          parentId: req.user.organizationId,
          type: 'DIVISION',
        },
        include: {
          _count: {
            select: { users: true, leads: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return res.json(divisions);
    }

    // ADMIN / MANAGER / others: return just their own organization
    const division = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      include: {
        _count: {
          select: { users: true, leads: true },
        },
      },
    });

    res.json(division ? [division] : []);
  } catch (err) {
    next(err);
  }
});

// ─── POST / — Create a new division (SUPER_ADMIN only) ─────────
router.post('/', authorize('SUPER_ADMIN'), validate(createDivisionSchema), async (req, res, next) => {
  try {
    const { name, tradeName, logo, primaryColor, secondaryColor } = req.validated;

    const result = await prisma.$transaction(async (tx) => {
      // Create the division organization
      const division = await tx.organization.create({
        data: {
          name,
          tradeName: tradeName || null,
          logo: logo || null,
          primaryColor: primaryColor || '#6366f1',
          secondaryColor: secondaryColor || '#1e293b',
          type: 'DIVISION',
          parentId: req.user.organizationId,
        },
      });

      // Create default pipeline stages for the new division
      for (const stage of DEFAULT_PIPELINE_STAGES) {
        await tx.pipelineStage.create({
          data: { ...stage, organizationId: division.id },
        });
      }

      return division;
    });

    // Fetch the created division with counts
    const division = await prisma.organization.findUnique({
      where: { id: result.id },
      include: {
        _count: {
          select: { users: true, leads: true },
        },
      },
    });

    res.status(201).json(division);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id — Get single division ────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // SUPER_ADMIN can get any child division; others can only get their own org
    if (req.user.role === 'SUPER_ADMIN') {
      const division = await prisma.organization.findFirst({
        where: {
          id,
          OR: [
            { parentId: req.user.organizationId },
            { id: req.user.organizationId },
          ],
        },
        include: {
          _count: {
            select: { users: true, leads: true, pipelineStages: true },
          },
        },
      });

      if (!division) {
        return res.status(404).json({ error: 'Division not found' });
      }

      return res.json(division);
    }

    // Non-super-admin: can only get their own org
    if (id !== req.user.organizationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const division = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, leads: true, pipelineStages: true },
        },
      },
    });

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    res.json(division);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id — Update division branding ────────────────────────
router.put('/:id', validate(updateDivisionSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, tradeName, logo, primaryColor, secondaryColor } = req.validated;

    if (req.user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can update any child division
      const division = await prisma.organization.findFirst({
        where: {
          id,
          parentId: req.user.organizationId,
          type: 'DIVISION',
        },
      });

      if (!division) {
        return res.status(404).json({ error: 'Division not found' });
      }
    } else if (req.user.role === 'ADMIN') {
      // ADMIN can only update their own org's branding
      if (id !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Build update data — only include provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (tradeName !== undefined) updateData.tradeName = tradeName;
    if (logo !== undefined) updateData.logo = logo || null;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;

    const updated = await prisma.organization.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { users: true, leads: true },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id — Delete a division (SUPER_ADMIN only) ─────────
router.delete('/:id', authorize('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the division — must be a child of the super admin's group
    const division = await prisma.organization.findFirst({
      where: {
        id,
        parentId: req.user.organizationId,
      },
    });

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    // Don't allow deleting GROUP type orgs
    if (division.type === 'GROUP') {
      return res.status(400).json({ error: 'Cannot delete a GROUP organization. Only divisions can be deleted.' });
    }

    // Cascade delete will remove all data (users, leads, stages, etc.)
    await prisma.organization.delete({
      where: { id },
    });

    res.json({ message: 'Division deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════
// ─── NEW ENDPOINTS: Division User Management & Analytics ────────
// ═══════════════════════════════════════════════════════════════════

// ─── GET /:id/users — List users in a specific division ─────────
router.get('/:id/users', authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { search, role, isActive, sort, order } = req.query;

    // Verify division access
    if (req.isSuperAdmin) {
      // SUPER_ADMIN: division must be a child of their group or the group itself
      const division = await prisma.organization.findFirst({
        where: {
          id,
          OR: [
            { parentId: req.user.organizationId },
            { id: req.user.organizationId },
          ],
        },
      });
      if (!division) {
        return res.status(404).json({ error: 'Division not found' });
      }
    } else {
      // ADMIN: can only list users in their own org
      if (id !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Build where clause
    const where = { organizationId: id };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Build orderBy
    let orderBy = { firstName: 'asc' };
    const sortOrder = order === 'desc' ? 'desc' : 'asc';

    if (sort === 'name') {
      orderBy = { firstName: sortOrder };
    } else if (sort === 'role') {
      orderBy = { role: sortOrder };
    } else if (sort === 'lastLogin') {
      orderBy = { lastLoginAt: sortOrder };
    } else if (sort === 'leads') {
      orderBy = { assignedLeads: { _count: sortOrder } };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        organizationId: true,
        _count: {
          select: { assignedLeads: true, tasks: true },
        },
      },
      orderBy,
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/stats — Get detailed division statistics ──────────
router.get('/:id/stats', authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify division access
    if (req.isSuperAdmin) {
      const division = await prisma.organization.findFirst({
        where: {
          id,
          OR: [
            { parentId: req.user.organizationId },
            { id: req.user.organizationId },
          ],
        },
      });
      if (!division) {
        return res.status(404).json({ error: 'Division not found' });
      }
    } else {
      if (id !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get pipeline stages for this division
    const pipelineStages = await prisma.pipelineStage.findMany({
      where: { organizationId: id },
      select: { id: true, name: true, isWonStage: true, isLostStage: true },
    });

    const wonStageIds = pipelineStages.filter(s => s.isWonStage).map(s => s.id);

    // Get all leads in this division
    const leads = await prisma.lead.findMany({
      where: { organizationId: id },
      select: {
        id: true,
        budget: true,
        stageId: true,
        createdAt: true,
        assignedToId: true,
      },
    });

    const totalLeads = leads.length;

    // Get users stats
    const allUsers = await prisma.user.findMany({
      where: { organizationId: id },
      select: { id: true, isActive: true },
    });
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.isActive).length;

    // Leads by stage with value
    const stageMap = {};
    for (const stage of pipelineStages) {
      stageMap[stage.id] = { stage: stage.name, count: 0, value: 0 };
    }
    let totalPipelineValue = 0;
    for (const lead of leads) {
      if (stageMap[lead.stageId]) {
        stageMap[lead.stageId].count += 1;
        stageMap[lead.stageId].value += lead.budget || 0;
      }
      totalPipelineValue += lead.budget || 0;
    }
    const leadsByStage = Object.values(stageMap);

    // Conversion rate
    const wonLeads = leads.filter(l => wonStageIds.includes(l.stageId)).length;
    const conversionRate = totalLeads > 0 ? parseFloat(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;

    // Average lead value
    const avgLeadValue = totalLeads > 0 ? parseFloat((totalPipelineValue / totalLeads).toFixed(2)) : 0;

    // Recent leads (last 5 created)
    const recentLeads = await prisma.lead.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        budget: true,
        createdAt: true,
        stage: { select: { name: true, color: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Top performers: top 3 users by won leads count
    const wonLeadsByUser = {};
    for (const lead of leads) {
      if (wonStageIds.includes(lead.stageId) && lead.assignedToId) {
        wonLeadsByUser[lead.assignedToId] = (wonLeadsByUser[lead.assignedToId] || 0) + 1;
      }
    }

    const topPerformerIds = Object.entries(wonLeadsByUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([userId]) => userId);

    let topPerformers = [];
    if (topPerformerIds.length > 0) {
      const performerUsers = await prisma.user.findMany({
        where: { id: { in: topPerformerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      });

      topPerformers = topPerformerIds.map(uid => {
        const user = performerUsers.find(u => u.id === uid);
        return user ? { ...user, wonLeads: wonLeadsByUser[uid] } : null;
      }).filter(Boolean);
    }

    res.json({
      totalLeads,
      totalUsers,
      activeUsers,
      leadsByStage,
      totalPipelineValue,
      conversionRate,
      avgLeadValue,
      recentLeads,
      topPerformers,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/users/transfer — Transfer user to another division ─
router.post('/:id/users/transfer', authorize('SUPER_ADMIN'), validate(transferUserSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, targetDivisionId } = req.validated;

    // Verify source division belongs to super admin's group
    const sourceDivision = await prisma.organization.findFirst({
      where: {
        id,
        OR: [
          { parentId: req.user.organizationId },
          { id: req.user.organizationId },
        ],
      },
    });
    if (!sourceDivision) {
      return res.status(404).json({ error: 'Source division not found' });
    }

    // Verify target division belongs to same parent group
    const targetDivision = await prisma.organization.findFirst({
      where: {
        id: targetDivisionId,
        OR: [
          { parentId: req.user.organizationId },
          { id: req.user.organizationId },
        ],
      },
    });
    if (!targetDivision) {
      return res.status(404).json({ error: 'Target division not found or does not belong to the same group' });
    }

    // Source and target must be different
    if (id === targetDivisionId) {
      return res.status(400).json({ error: 'Source and target divisions must be different' });
    }

    // Verify user belongs to the source division
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: id },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found in the source division' });
    }

    // Transfer user — leads stay in original division
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { organizationId: targetDivisionId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
      },
    });

    res.json({
      message: 'User transferred successfully',
      user: updatedUser,
      fromDivision: id,
      toDivision: targetDivisionId,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/users/invite — Invite a user to a specific division ─
router.post('/:id/users/invite', authorize('SUPER_ADMIN'), validate(inviteUserSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, role, password } = req.validated;

    // Verify division belongs to super admin's group
    const division = await prisma.organization.findFirst({
      where: {
        id,
        OR: [
          { parentId: req.user.organizationId },
          { id: req.user.organizationId },
        ],
      },
    });
    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        role,
        passwordHash,
        organizationId: id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        organizationId: true,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id/users/:userId — Update user within division context ─
router.put('/:id/users/:userId', authorize('ADMIN', 'SUPER_ADMIN'), validate(updateDivisionUserSchema), async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    // Verify division access
    if (req.isSuperAdmin) {
      const division = await prisma.organization.findFirst({
        where: {
          id,
          OR: [
            { parentId: req.user.organizationId },
            { id: req.user.organizationId },
          ],
        },
      });
      if (!division) {
        return res.status(404).json({ error: 'Division not found' });
      }
    } else {
      // ADMIN can only update users in their own org
      if (id !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Verify user belongs to the specified division
    const existing = await prisma.user.findFirst({
      where: { id: userId, organizationId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found in this division' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: req.validated,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        phone: true,
        organizationId: true,
      },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id/users/:userId/reset-password — Reset user password ─
router.put('/:id/users/:userId/reset-password', authorize('SUPER_ADMIN'), validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    // Verify division belongs to super admin's group
    const division = await prisma.organization.findFirst({
      where: {
        id,
        OR: [
          { parentId: req.user.organizationId },
          { id: req.user.organizationId },
        ],
      },
    });
    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    // Verify user belongs to the specified division
    const existing = await prisma.user.findFirst({
      where: { id: userId, organizationId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found in this division' });
    }

    const passwordHash = await bcrypt.hash(req.validated.newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
