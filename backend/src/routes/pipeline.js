const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { executeAutomations } = require('../services/automationEngine');

const router = Router();
router.use(authenticate, orgScope);

// ─── Get Pipeline Stages ─────────────────────────────────────────
router.get('/stages', async (req, res, next) => {
  try {
    const leadFilter = { isArchived: false };
    if (req.isRestrictedRole) leadFilter.assignedToId = req.user.id;

    // Allow filtering to a single division via ?organizationId=
    const orgFilter = req.query.organizationId && req.orgIds.includes(req.query.organizationId)
      ? req.query.organizationId
      : undefined;

    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: orgFilter ? orgFilter : { in: req.orgIds } },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { leads: { where: leadFilter } } },
        leads: {
          where: leadFilter,
          orderBy: { stageOrder: 'asc' },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            tags: { include: { tag: true } },
          },
        },
      },
    });
    res.json(stages);
  } catch (err) {
    next(err);
  }
});

// ─── Create Pipeline Stage ───────────────────────────────────────
router.post('/stages', authorize('ADMIN', 'MANAGER'), validate(z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  isWonStage: z.boolean().optional(),
  isLostStage: z.boolean().optional(),
  divisionId: z.string().uuid().optional(),
})), async (req, res, next) => {
  try {
    const { divisionId, ...stageData } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    const maxOrder = await prisma.pipelineStage.aggregate({
      where: { organizationId: targetOrgId },
      _max: { order: true },
    });

    const stage = await prisma.pipelineStage.create({
      data: {
        ...stageData,
        order: (maxOrder._max.order ?? -1) + 1,
        organizationId: targetOrgId,
      },
    });
    res.status(201).json(stage);
  } catch (err) {
    next(err);
  }
});

// ─── Update Pipeline Stage ───────────────────────────────────────
router.put('/stages/:id', authorize('ADMIN', 'MANAGER'), validate(z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  order: z.number().int().optional(),
})), async (req, res, next) => {
  try {
    // Verify stage belongs to one of the user's orgs
    const existing = await prisma.pipelineStage.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Stage not found' });

    const stage = await prisma.pipelineStage.update({
      where: { id: req.params.id },
      data: req.validated,
    });
    res.json(stage);
  } catch (err) {
    next(err);
  }
});

// ─── Move Lead in Pipeline (drag-and-drop) ───────────────────────
router.post('/move', validate(z.object({
  leadId: z.string().uuid(),
  stageId: z.string().uuid(),
  order: z.number().int().min(0),
})), async (req, res, next) => {
  try {
    const { leadId, stageId, order } = req.validated;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, organizationId: { in: req.orgIds } },
    });
    if (!stage) return res.status(404).json({ error: 'Stage not found' });

    // Determine status based on stage
    let newStatus = lead.status;
    if (stage.isWonStage) newStatus = 'WON';
    else if (stage.isLostStage) newStatus = 'LOST';

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: leadId },
        data: {
          stageId,
          stageOrder: order,
          status: newStatus,
          wonAt: stage.isWonStage && !lead.wonAt ? new Date() : lead.wonAt,
          lostAt: stage.isLostStage && !lead.lostAt ? new Date() : lead.lostAt,
        },
      });

      if (stageId !== lead.stageId) {
        await tx.leadActivity.create({
          data: {
            leadId,
            userId: req.user.id,
            type: 'STAGE_CHANGE',
            description: `Moved to "${stage.name}"`,
          },
        });
      }

      return result;
    });

    res.json(updated);

    // ── Fire-and-forget notification — notify lead owner ──
    if (stageId !== lead.stageId && lead.assignedToId && lead.assignedToId !== req.user.id) {
      createNotification({
        type: NOTIFICATION_TYPES.PIPELINE_STAGE_CHANGED,
        title: 'Lead Moved',
        message: `${lead.firstName} ${lead.lastName} moved to ${stage.name}`,
        userId: lead.assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: leadId,
        organizationId: lead.organizationId,
      }).catch(() => {});
    }

    // Fire automation rules for stage change
    if (stageId !== lead.stageId) {
      executeAutomations('LEAD_STAGE_CHANGED', {
        organizationId: lead.organizationId,
        lead: updated,
        previousData: lead,
      }).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

// ─── Reorder Stages ──────────────────────────────────────────────
router.post('/stages/reorder', authorize('ADMIN', 'MANAGER'), validate(z.object({
  stageIds: z.array(z.string().uuid()),
})), async (req, res, next) => {
  try {
    const { stageIds } = req.validated;

    await prisma.$transaction(
      stageIds.map((id, index) =>
        prisma.pipelineStage.update({ where: { id }, data: { order: index } })
      )
    );

    res.json({ message: 'Stages reordered' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
