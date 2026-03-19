const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { prisma } = require('../config/database');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../email');
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

// Default pipeline stages used for new divisions
const DEFAULT_PIPELINE_STAGES = [
  { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true },
  { name: 'Contacted', order: 1, color: '#3b82f6' },
  { name: 'Qualified', order: 2, color: '#06b6d4' },
  { name: 'Proposal Sent', order: 3, color: '#f59e0b' },
  { name: 'Negotiation', order: 4, color: '#f97316' },
  { name: 'Won', order: 5, color: '#22c55e', isWonStage: true },
  { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true },
];

// ─── Register (creates group org + default division + super admin user) ───
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email: rawEmail, password, firstName, lastName, organizationName } = req.validated;
    const email = rawEmail.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      // Create group organization
      const org = await tx.organization.create({
        data: { name: organizationName, type: 'GROUP' },
      });

      // Create default "General" division under the group
      const division = await tx.organization.create({
        data: {
          name: 'General',
          type: 'DIVISION',
          parentId: org.id,
        },
      });

      // Create default pipeline stages for the division
      for (const stage of DEFAULT_PIPELINE_STAGES) {
        await tx.pipelineStage.create({
          data: { ...stage, organizationId: division.id },
        });
      }

      // Create SUPER_ADMIN user attached to the group org
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: 'SUPER_ADMIN',
          organizationId: org.id,
        },
      });

      return { org, division, user };
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
        organization: {
          id: result.org.id,
          name: result.org.name,
          type: result.org.type,
        },
      },
      divisions: [
        {
          id: result.division.id,
          name: result.division.name,
          type: result.division.type,
          parentId: result.division.parentId,
          _count: { users: 0, leads: 0 },
        },
      ],
    });
  } catch (err) {
    next(err);
  }
});

// ─── Login ───────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email: rawEmail, password } = req.validated;
    const email = rawEmail.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            tradeName: true,
            logo: true,
            primaryColor: true,
            secondaryColor: true,
            type: true,
            parentId: true,
          },
        },
      },
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

    const response = {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        organization: user.organization,
      },
    };

    // For SUPER_ADMIN, include divisions
    if (user.role === 'SUPER_ADMIN') {
      const divisions = await prisma.organization.findMany({
        where: { parentId: user.organizationId },
        select: {
          id: true,
          name: true,
          tradeName: true,
          logo: true,
          primaryColor: true,
          secondaryColor: true,
          type: true,
          parentId: true,
          _count: { select: { users: true, leads: true } },
        },
        orderBy: { name: 'asc' },
      });
      response.divisions = divisions;
    }

    res.json(response);
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
        organization: {
          select: {
            id: true,
            name: true,
            tradeName: true,
            logo: true,
            primaryColor: true,
            secondaryColor: true,
            type: true,
            parentId: true,
            plan: true,
          },
        },
      },
    });

    const response = { ...user };

    // For SUPER_ADMIN, include divisions
    if (user.role === 'SUPER_ADMIN') {
      const divisions = await prisma.organization.findMany({
        where: { parentId: user.organizationId },
        select: {
          id: true,
          name: true,
          tradeName: true,
          logo: true,
          primaryColor: true,
          secondaryColor: true,
          type: true,
          parentId: true,
          _count: { select: { users: true, leads: true } },
        },
        orderBy: { name: 'asc' },
      });
      response.divisions = divisions;
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});


// ─── Forgot Password ───────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await prisma.user.findUnique({ 
      where: { email: email.toLowerCase().trim() },
      select: { id: true, firstName: true, organizationId: true, isActive: true }
    });
    
    // Always return success (don't reveal if email exists)
    if (!user || !user.isActive) {
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }
    
    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Save token to user
    await prisma.$executeRaw`
      UPDATE users SET "resetToken" = ${resetToken}, "resetTokenExpiry" = ${resetTokenExpiry} WHERE id = ${user.id}
    `;
    
    // Send email
    try {
      await sendPasswordResetEmail(email, resetToken, user.firstName, user.organizationId);
    } catch (emailErr) {
      console.error('Failed to send reset email:', emailErr.message);
      return res.status(500).json({ error: 'Failed to send reset email. Please contact your administrator.' });
    }
    
    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

// ─── Reset Password (with token) ────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Find user with valid token
    const users = await prisma.$queryRaw`
      SELECT id, email, "firstName" FROM users 
      WHERE "resetToken" = ${token} AND "resetTokenExpiry" > NOW()
      LIMIT 1
    `;
    
    if (!users || users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token. Please request a new reset link.' });
    }
    
    const user = users[0];
    
    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Update password and clear token
    await prisma.$executeRaw`
      UPDATE users SET "passwordHash" = ${passwordHash}, "resetToken" = NULL, "resetTokenExpiry" = NULL WHERE id = ${user.id}
    `;
    
    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

// ─── Validate Reset Token ────────────────────────────────────────
router.get('/validate-reset-token', async (req, res, next) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }
    
    const users = await prisma.$queryRaw`
      SELECT id, email FROM users 
      WHERE "resetToken" = ${token} AND "resetTokenExpiry" > NOW()
      LIMIT 1
    `;
    
    res.json({ valid: users && users.length > 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
