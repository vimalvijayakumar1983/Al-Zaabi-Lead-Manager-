const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { getTemplate, getAllTemplates, labelToFieldName } = require('../config/industryTemplates');

const bcrypt = require('bcryptjs');
const { sendInviteEmail } = require('../email');

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────

const createDivisionSchema = z.object({
  name: z.string().min(1, 'Division name is required'),
  tradeName: z.string().optional(),
  logo: z.string().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').optional(),
  templateId: z.string().optional(),
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

// ─── GET /templates — List available industry templates ──────────
router.get('/templates', authorize('SUPER_ADMIN', 'ADMIN'), (req, res) => {
  res.json(getAllTemplates());
});

// ─── POST / — Create a new division (SUPER_ADMIN only) ─────────
router.post('/', authorize('SUPER_ADMIN'), validate(createDivisionSchema), async (req, res, next) => {
  try {
    const { name, tradeName, logo, primaryColor, secondaryColor, templateId } = req.validated;

    // Resolve template: use selected template or fall back to defaults
    const template = templateId ? getTemplate(templateId) : null;
    const stages = template ? template.pipelineStages : DEFAULT_PIPELINE_STAGES;

    const result = await prisma.$transaction(async (tx) => {
      // Create the division organization, store templateId in settings
      const division = await tx.organization.create({
        data: {
          name,
          tradeName: tradeName || null,
          logo: logo || null,
          primaryColor: primaryColor || (template ? template.color : '#6366f1'),
          secondaryColor: secondaryColor || '#1e293b',
          type: 'DIVISION',
          parentId: req.user.organizationId,
          settings: template ? { templateId: template.id, templateName: template.name } : {},
        },
      });

      // Create pipeline stages from template (or defaults)
      for (const stage of stages) {
        await tx.pipelineStage.create({
          data: {
            name: stage.name,
            order: stage.order,
            color: stage.color || '#6366f1',
            isDefault: stage.isDefault || false,
            isWonStage: stage.isWonStage || false,
            isLostStage: stage.isLostStage || false,
            organizationId: division.id,
          },
        });
      }

      // Create custom fields from template
      if (template && template.customFields) {
        for (let i = 0; i < template.customFields.length; i++) {
          const field = template.customFields[i];
          await tx.customField.create({
            data: {
              name: labelToFieldName(field.label),
              label: field.label,
              type: field.type,
              options: field.options || null,
              isRequired: field.isRequired || false,
              order: i,
              organizationId: division.id,
            },
          });
        }
      }

      // Create tags from template
      if (template && template.tags) {
        for (const tag of template.tags) {
          await tx.tag.create({
            data: {
              name: tag.name,
              color: tag.color || '#6366f1',
              organizationId: division.id,
            },
          });
        }
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
      message: `${req.user.firstName} ${req.user.lastName} created division: ${name}${template ? ` (${template.name} template)` : ''}`,
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

// ─── POST /:id/apply-template — Apply industry template to existing division ──
router.post('/:id/apply-template', authorize('SUPER_ADMIN', 'ADMIN'), validate(z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  replaceStages: z.boolean().optional().default(false),
  replaceFields: z.boolean().optional().default(false),
  replaceTags: z.boolean().optional().default(false),
})), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { templateId, replaceStages, replaceFields, replaceTags } = req.validated;

    // Verify access
    const division = await prisma.organization.findFirst({
      where: {
        id,
        ...(req.user.role === 'SUPER_ADMIN'
          ? { parentId: req.user.organizationId, type: 'DIVISION' }
          : { id: req.user.organizationId }),
      },
    });

    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const summary = { stagesAdded: 0, fieldsAdded: 0, tagsAdded: 0, stagesRemoved: 0, fieldsRemoved: 0, tagsRemoved: 0 };

    await prisma.$transaction(async (tx) => {
      // ── Pipeline Stages ──
      if (replaceStages) {
        // Check if any leads are assigned to existing stages
        const leadsOnStages = await tx.lead.count({
          where: { organizationId: id, stageId: { not: null } },
        });

        if (leadsOnStages > 0) {
          // Don't delete stages with leads — just add missing ones
          const existingStages = await tx.pipelineStage.findMany({ where: { organizationId: id } });
          const existingNames = new Set(existingStages.map((s) => s.name.toLowerCase()));
          let maxOrder = existingStages.reduce((m, s) => Math.max(m, s.order), -1);

          for (const stage of template.pipelineStages) {
            if (!existingNames.has(stage.name.toLowerCase())) {
              maxOrder++;
              await tx.pipelineStage.create({
                data: {
                  name: stage.name,
                  order: maxOrder,
                  color: stage.color || '#6366f1',
                  isDefault: false,
                  isWonStage: stage.isWonStage || false,
                  isLostStage: stage.isLostStage || false,
                  organizationId: id,
                },
              });
              summary.stagesAdded++;
            }
          }
        } else {
          // Safe to replace — no leads on stages
          const deleted = await tx.pipelineStage.deleteMany({ where: { organizationId: id } });
          summary.stagesRemoved = deleted.count;

          for (const stage of template.pipelineStages) {
            await tx.pipelineStage.create({
              data: {
                name: stage.name,
                order: stage.order,
                color: stage.color || '#6366f1',
                isDefault: stage.isDefault || false,
                isWonStage: stage.isWonStage || false,
                isLostStage: stage.isLostStage || false,
                organizationId: id,
              },
            });
            summary.stagesAdded++;
          }
        }
      } else {
        // Merge: add only stages that don't exist yet
        const existingStages = await tx.pipelineStage.findMany({ where: { organizationId: id } });
        const existingNames = new Set(existingStages.map((s) => s.name.toLowerCase()));
        let maxOrder = existingStages.reduce((m, s) => Math.max(m, s.order), -1);

        for (const stage of template.pipelineStages) {
          if (!existingNames.has(stage.name.toLowerCase())) {
            maxOrder++;
            await tx.pipelineStage.create({
              data: {
                name: stage.name,
                order: maxOrder,
                color: stage.color || '#6366f1',
                isDefault: false,
                isWonStage: stage.isWonStage || false,
                isLostStage: stage.isLostStage || false,
                organizationId: id,
              },
            });
            summary.stagesAdded++;
          }
        }
      }

      // ── Custom Fields ──
      if (replaceFields) {
        const deleted = await tx.customField.deleteMany({ where: { organizationId: id } });
        summary.fieldsRemoved = deleted.count;

        for (let i = 0; i < template.customFields.length; i++) {
          const field = template.customFields[i];
          await tx.customField.create({
            data: {
              name: labelToFieldName(field.label),
              label: field.label,
              type: field.type,
              options: field.options || null,
              isRequired: field.isRequired || false,
              order: i,
              organizationId: id,
            },
          });
          summary.fieldsAdded++;
        }
      } else {
        // Merge: add only fields that don't exist yet
        const existingFields = await tx.customField.findMany({ where: { organizationId: id } });
        const existingNames = new Set(existingFields.map((f) => f.name.toLowerCase()));
        let maxOrder = existingFields.reduce((m, f) => Math.max(m, f.order), -1);

        for (const field of template.customFields) {
          const fieldName = labelToFieldName(field.label);
          if (!existingNames.has(fieldName.toLowerCase())) {
            maxOrder++;
            await tx.customField.create({
              data: {
                name: fieldName,
                label: field.label,
                type: field.type,
                options: field.options || null,
                isRequired: field.isRequired || false,
                order: maxOrder,
                organizationId: id,
              },
            });
            summary.fieldsAdded++;
          }
        }
      }

      // ── Tags ──
      if (replaceTags) {
        // Only delete tags not attached to any leads
        const tagsWithLeads = await tx.leadTag.findMany({
          where: { tag: { organizationId: id } },
          select: { tagId: true },
        });
        const usedTagIds = new Set(tagsWithLeads.map((t) => t.tagId));

        const allTags = await tx.tag.findMany({ where: { organizationId: id } });
        const deletableIds = allTags.filter((t) => !usedTagIds.has(t.id)).map((t) => t.id);

        if (deletableIds.length > 0) {
          const deleted = await tx.tag.deleteMany({ where: { id: { in: deletableIds } } });
          summary.tagsRemoved = deleted.count;
        }

        // Add template tags
        const remainingTags = await tx.tag.findMany({ where: { organizationId: id } });
        const remainingNames = new Set(remainingTags.map((t) => t.name.toLowerCase()));

        for (const tag of template.tags) {
          if (!remainingNames.has(tag.name.toLowerCase())) {
            await tx.tag.create({
              data: { name: tag.name, color: tag.color || '#6366f1', organizationId: id },
            });
            summary.tagsAdded++;
          }
        }
      } else {
        // Merge: add only tags that don't exist yet
        const existingTags = await tx.tag.findMany({ where: { organizationId: id } });
        const existingNames = new Set(existingTags.map((t) => t.name.toLowerCase()));

        for (const tag of template.tags) {
          if (!existingNames.has(tag.name.toLowerCase())) {
            await tx.tag.create({
              data: { name: tag.name, color: tag.color || '#6366f1', organizationId: id },
            });
            summary.tagsAdded++;
          }
        }
      }

      // Update division settings with template info
      const currentSettings = division.settings && typeof division.settings === 'object' ? division.settings : {};
      await tx.organization.update({
        where: { id },
        data: {
          settings: { ...currentSettings, templateId: template.id, templateName: template.name },
        },
      });
    });

    res.json({
      message: `Template "${template.name}" applied successfully`,
      template: { id: template.id, name: template.name },
      summary,
    });
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
// DIVISION USER MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════════════

// ─── 1. List Division Users ─────────────────────────────────────
router.get('/:id/users', async (req, res, next) => {
  try {
    const divisionId = req.params.id;
    const { search, role, isActive } = req.query;

    // Verify division exists and requester has access
    const division = await prisma.organization.findFirst({
      where: { id: divisionId, ...(req.isSuperAdmin ? {} : { id: { in: req.orgIds } }) },
    });
    if (!division) return res.status(404).json({ error: 'Division not found' });

    const where = { organizationId: divisionId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (isActive !== undefined && isActive !== '') where.isActive = isActive === 'true';

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, createdAt: true, lastLoginAt: true,
        organizationId: true, avatar: true,
        _count: { select: { assignedLeads: true, tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users.map(u => ({
      ...u,
      leadCount: u._count?.assignedLeads ?? 0,
      taskCount: u._count?.tasks ?? 0,
      _count: undefined,
    })));
  } catch (err) {
    console.error('Division users list error:', err?.message || err);
    res.status(500).json({ error: 'Failed to load users', detail: err?.message || String(err) });
  }
});

// ─── 2. Division Stats ──────────────────────────────────────────
router.get('/:id/stats', async (req, res, next) => {
  try {
    const divisionId = req.params.id;

    const division = await prisma.organization.findFirst({
      where: { id: divisionId, ...(req.isSuperAdmin ? {} : { id: { in: req.orgIds } }) },
    });
    if (!division) return res.status(404).json({ error: 'Division not found' });

    const [totalUsers, activeUsers, totalLeads, newLeadsThisMonth, pipelineCount, taskCount] = await Promise.all([
      prisma.user.count({ where: { organizationId: divisionId } }),
      prisma.user.count({ where: { organizationId: divisionId, isActive: true } }),
      prisma.lead.count({ where: { organizationId: divisionId } }),
      prisma.lead.count({
        where: {
          organizationId: divisionId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      prisma.pipelineStage.count({ where: { organizationId: divisionId } }).catch(() => 0),
      prisma.task.count({ where: { organizationId: divisionId } }).catch(() => 0),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      totalLeads,
      newLeadsThisMonth,
      pipelineStages: pipelineCount,
      totalTasks: taskCount,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 3. Invite User to Division ─────────────────────────────────
router.post('/:id/users/invite', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), validate(z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']),
  password: z.string().min(8),
})), async (req, res, next) => {
  try {
    const divisionId = req.params.id;
    const { email, firstName, lastName, role, password } = req.validated;

    // Verify division exists and requester has access
    const division = await prisma.organization.findFirst({
      where: { id: divisionId, ...(req.isSuperAdmin ? {} : { id: { in: req.orgIds } }) },
      select: { id: true, name: true, parentId: true },
    });
    if (!division) return res.status(404).json({ error: 'Division not found' });

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email, firstName, lastName, role, passwordHash,
        organizationId: divisionId,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, createdAt: true, organizationId: true,
      },
    });

    res.status(201).json(user);

    // ── Fire-and-forget: Send invitation email with credentials ──
    const parentOrgId = division.parentId || divisionId;
    const inviterFullName = `${req.user.firstName} ${req.user.lastName}`;
    sendInviteEmail(email, password, `${firstName} ${lastName}`, division.name, role, inviterFullName, parentOrgId).catch((err) => {
      console.error('Failed to send invite email:', err.message);
    });

    // Fire-and-forget notification
    notifyOrgAdmins(divisionId, {
      type: NOTIFICATION_TYPES.TEAM_MEMBER_INVITED || 'TEAM_MEMBER_INVITED',
      title: 'New Team Member',
      message: `${req.user.firstName} ${req.user.lastName} invited ${email} to ${division.name}`,
      entityType: 'user',
      entityId: user.id,
    }, req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── 4. Transfer User Between Divisions ─────────────────────────
router.post('/:id/users/transfer', authorize('SUPER_ADMIN', 'ADMIN'), validate(z.object({
  userId: z.string().uuid(),
  targetDivisionId: z.string().uuid(),
})), async (req, res, next) => {
  try {
    const sourceDivisionId = req.params.id;
    const { userId, targetDivisionId } = req.validated;

    // Verify both divisions exist
    const [sourcDiv, targetDiv, user] = await Promise.all([
      prisma.organization.findFirst({ where: { id: sourceDivisionId } }),
      prisma.organization.findFirst({ where: { id: targetDivisionId } }),
      prisma.user.findFirst({ where: { id: userId, organizationId: sourceDivisionId } }),
    ]);

    if (!sourcDiv) return res.status(404).json({ error: 'Source division not found' });
    if (!targetDiv) return res.status(404).json({ error: 'Target division not found' });
    if (!user) return res.status(404).json({ error: 'User not found in source division' });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { organizationId: targetDivisionId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, organizationId: true,
      },
    });

    res.json({ ...updated, message: `User transferred from ${sourcDiv.name} to ${targetDiv.name}` });
  } catch (err) {
    next(err);
  }
});

// ─── 5. Update Division User (role, active status) ──────────────
router.put('/:id/users/:userId', authorize('SUPER_ADMIN', 'ADMIN'), validate(z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
})), async (req, res, next) => {
  try {
    const { id: divisionId, userId } = req.params;

    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: divisionId },
    });
    if (!user) return res.status(404).json({ error: 'User not found in this division' });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: req.validated,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, organizationId: true,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── 6. Reset Division User Password ────────────────────────────
router.put('/:id/users/:userId/reset-password', authorize('SUPER_ADMIN', 'ADMIN'), validate(z.object({
  newPassword: z.string().min(4),
})), async (req, res, next) => {
  try {
    const { id: divisionId, userId } = req.params;
    const { newPassword } = req.validated;

    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: divisionId },
    });
    if (!user) return res.status(404).json({ error: 'User not found in this division' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
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
