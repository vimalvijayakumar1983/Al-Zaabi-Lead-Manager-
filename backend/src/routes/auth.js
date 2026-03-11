const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { config } = require('../config/env');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Register (creates org + admin user) ─────────────────────────
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, organizationName } = req.validated;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: organizationName },
      });

      // Create default pipeline stages
      const defaultStages = [
        { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true },
        { name: 'Contacted', order: 1, color: '#3b82f6' },
        { name: 'Qualified', order: 2, color: '#06b6d4' },
        { name: 'Proposal Sent', order: 3, color: '#f59e0b' },
        { name: 'Negotiation', order: 4, color: '#f97316' },
        { name: 'Won', order: 5, color: '#22c55e', isWonStage: true },
        { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true },
      ];

      for (const stage of defaultStages) {
        await tx.pipelineStage.create({
          data: { ...stage, organizationId: org.id },
        });
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: 'ADMIN',
          organizationId: org.id,
        },
      });

      return { org, user };
    });

    const token = jwt.sign({ userId: result.user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        organizationId: result.org.id,
        organizationName: result.org.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Login ───────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: { select: { name: true } } },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Current User ────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        phone: true,
        organizationId: true,
        organization: { select: { name: true, plan: true } },
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
