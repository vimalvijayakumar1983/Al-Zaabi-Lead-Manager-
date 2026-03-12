const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, orgScope);

// ─── List Users ──────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.orgId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true, isActive: true,
        lastLoginAt: true, createdAt: true,
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
})), async (req, res, next) => {
  try {
    const { email, firstName, lastName, role, password } = req.validated;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email, firstName, lastName, role, passwordHash,
        organizationId: req.orgId,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, createdAt: true,
      },
    });

    res.status(201).json(user);
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.validated,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, phone: true,
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Reset User Password (Admin) ─────────────────────────────────
router.put('/:id/reset-password', authorize('ADMIN'), validate(z.object({
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: true },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true,
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
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
