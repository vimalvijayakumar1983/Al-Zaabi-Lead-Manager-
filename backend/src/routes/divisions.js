const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────

const createDivisionSchema = z.object({
  name: z.string().min(1, 'Division name is required'),
  tradeName: z.string().optional(),
  logo: z.string().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
});

const updateDivisionSchema = z.object({
  name: z.string().min(1).optional(),
  tradeName: z.string().optional(),
  logo: z.string().optional().or(z.literal('')).or(z.null()),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
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

    // ── Fire-and-forget notification — notify org admins (super admins) ──
    notifyOrgAdmins(req.user.organizationId, {
      type: NOTIFICATION_TYPES.DIVISION_CREATED,
      title: 'New Division Created',
      message: `${req.user.firstName} ${req.user.lastName} created division: ${name}`,
      entityType: 'division',
      entityId: division.id,
    }, req.user.id).catch(() => {});
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

module.exports = router;
