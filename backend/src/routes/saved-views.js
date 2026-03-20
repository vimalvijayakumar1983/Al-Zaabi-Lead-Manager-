const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { auth } = require('../middleware/auth');

// ─── GET /api/saved-views — List views visible to current user ──────────
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const organizationId = req.user.organizationId;
    const divisionId = req.query.divisionId || null;

    const views = await prisma.savedView.findMany({
      where: {
        organizationId,
        // If division scoped, include views for that division + org-wide views (divisionId = null)
        ...(divisionId ? {
          OR: [{ divisionId }, { divisionId: null }],
        } : {}),
        // Visibility filtering: user sees views they have access to
        AND: {
          OR: [
            { visibility: 'everyone' },
            { createdById: userId }, // Creator always sees their own views
            { visibility: 'specific_users', visibleToUsers: { has: userId } },
            { visibility: 'specific_roles', visibleToRoles: { has: userRole } },
          ],
        },
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(views);
  } catch (error) {
    console.error('Error fetching saved views:', error);
    res.status(500).json({ error: 'Failed to fetch saved views' });
  }
});

// ─── POST /api/saved-views — Create a new view ─────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const organizationId = req.user.organizationId;
    const {
      name, icon, filters, sortBy, sortOrder, columns,
      visibility, visibleToUsers, visibleToRoles, divisionId,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'View name is required' });
    }

    const view = await prisma.savedView.create({
      data: {
        name: name.trim(),
        icon: icon || null,
        filters: filters || {},
        sortBy: sortBy || null,
        sortOrder: sortOrder || 'desc',
        columns: columns || null,
        visibility: visibility || 'everyone',
        visibleToUsers: visibleToUsers || [],
        visibleToRoles: visibleToRoles || [],
        organizationId,
        divisionId: divisionId || null,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.status(201).json(view);
  } catch (error) {
    console.error('Error creating saved view:', error);
    res.status(500).json({ error: 'Failed to create saved view' });
  }
});

// ─── PUT /api/saved-views/:id — Update a view ──────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = req.params;

    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'View not found' });
    }

    // Only creator or admin can edit
    if (existing.createdById !== userId && !['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'Only the creator or an admin can edit this view' });
    }

    const {
      name, icon, filters, sortBy, sortOrder, columns,
      visibility, visibleToUsers, visibleToRoles,
    } = req.body;

    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(icon !== undefined && { icon }),
        ...(filters !== undefined && { filters }),
        ...(sortBy !== undefined && { sortBy }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(columns !== undefined && { columns }),
        ...(visibility !== undefined && { visibility }),
        ...(visibleToUsers !== undefined && { visibleToUsers }),
        ...(visibleToRoles !== undefined && { visibleToRoles }),
        updatedAt: new Date(),
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json(view);
  } catch (error) {
    console.error('Error updating saved view:', error);
    res.status(500).json({ error: 'Failed to update saved view' });
  }
});

// ─── DELETE /api/saved-views/:id — Delete a view ────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = req.params;

    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'View not found' });
    }

    // Only creator or admin can delete
    if (existing.createdById !== userId && !['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'Only the creator or an admin can delete this view' });
    }

    await prisma.savedView.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting saved view:', error);
    res.status(500).json({ error: 'Failed to delete saved view' });
  }
});

// ─── POST /api/saved-views/migrate — Bulk migrate localStorage views ────
router.post('/migrate', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const organizationId = req.user.organizationId;
    const { views, divisionId } = req.body;

    if (!Array.isArray(views) || views.length === 0) {
      return res.json({ migrated: 0 });
    }

    const created = [];
    for (const v of views) {
      try {
        const view = await prisma.savedView.create({
          data: {
            name: (v.name || 'Untitled View').trim(),
            icon: v.icon || null,
            filters: v.filters || {},
            sortBy: v.sortBy || null,
            sortOrder: v.sortOrder || 'desc',
            columns: v.columns || null,
            visibility: 'private', // Migrated views default to private (they were personal)
            visibleToUsers: [],
            visibleToRoles: [],
            organizationId,
            divisionId: divisionId || null,
            createdById: userId,
          },
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        });
        created.push(view);
      } catch (err) {
        console.error('Error migrating view:', v.name, err);
      }
    }

    res.json({ migrated: created.length, views: created });
  } catch (error) {
    console.error('Error migrating views:', error);
    res.status(500).json({ error: 'Failed to migrate views' });
  }
});

module.exports = router;
