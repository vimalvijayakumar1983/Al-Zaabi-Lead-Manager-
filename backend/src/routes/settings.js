const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, orgScope);

// ─── Get Profile ────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true, isActive: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
        organization: {
          select: {
            id: true, name: true, tradeName: true, logo: true,
            primaryColor: true, secondaryColor: true, type: true,
            parentId: true, plan: true,
          },
        },
        _count: { select: { assignedLeads: true, tasks: true } },
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Update Profile ─────────────────────────────────────────────
router.put('/profile', validate(z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
})), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.validated,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatar: true, phone: true,
      },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Change Password ────────────────────────────────────────────
router.put('/password', validate(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.validated;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Get Organization ───────────────────────────────────────────
router.get('/organization', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: {
        id: true, name: true, tradeName: true, logo: true,
        primaryColor: true, secondaryColor: true, type: true,
        parentId: true, domain: true, plan: true,
        settings: true, createdAt: true, updatedAt: true,
        _count: {
          select: { users: true, leads: true, campaigns: true, automationRules: true },
        },
      },
    });
    res.json(org);
  } catch (err) {
    next(err);
  }
});

// ─── Update Organization ────────────────────────────────────────
router.put('/organization', authorize('ADMIN'), validate(z.object({
  name: z.string().min(1).max(200).optional(),
  tradeName: z.string().max(200).optional().nullable(),
  logo: z.string().optional().nullable(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  domain: z.string().max(200).optional().nullable(),
  settings: z.record(z.any()).optional(),
})), async (req, res, next) => {
  try {
    const data = { ...req.validated };

    // Merge settings instead of overwrite
    if (data.settings) {
      const existing = await prisma.organization.findUnique({
        where: { id: req.orgId },
        select: { settings: true },
      });
      const currentSettings = typeof existing.settings === 'object' ? existing.settings : {};
      data.settings = { ...currentSettings, ...data.settings };
    }

    const org = await prisma.organization.update({
      where: { id: req.orgId },
      data,
      select: {
        id: true, name: true, tradeName: true, logo: true,
        primaryColor: true, secondaryColor: true, type: true,
        domain: true, plan: true, settings: true, updatedAt: true,
      },
    });
    res.json(org);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Domain already in use' });
    }
    next(err);
  }
});

// ─── Get Notification Preferences ───────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });

    const settings = typeof org.settings === 'object' ? org.settings : {};
    const userNotifs = settings[`notifs_${req.user.id}`] || {
      emailNewLead: true,
      emailLeadAssigned: true,
      emailTaskDue: true,
      emailWeeklyDigest: true,
      inAppNewLead: true,
      inAppLeadAssigned: true,
      inAppTaskDue: true,
      inAppStatusChange: true,
    };

    res.json(userNotifs);
  } catch (err) {
    next(err);
  }
});

// ─── Update Notification Preferences ────────────────────────────
router.put('/notifications', validate(z.object({
  emailNewLead: z.boolean().optional(),
  emailLeadAssigned: z.boolean().optional(),
  emailTaskDue: z.boolean().optional(),
  emailWeeklyDigest: z.boolean().optional(),
  inAppNewLead: z.boolean().optional(),
  inAppLeadAssigned: z.boolean().optional(),
  inAppTaskDue: z.boolean().optional(),
  inAppStatusChange: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
      select: { settings: true },
    });

    const settings = typeof org.settings === 'object' ? org.settings : {};
    const currentNotifs = settings[`notifs_${req.user.id}`] || {};
    const updated = { ...currentNotifs, ...req.validated };

    await prisma.organization.update({
      where: { id: req.orgId },
      data: {
        settings: { ...settings, [`notifs_${req.user.id}`]: updated },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── Get Audit Log ──────────────────────────────────────────────
router.get('/audit-log', authorize('ADMIN'), async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: {
        id: true, action: true, entity: true, entityId: true,
        createdAt: true, ipAddress: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Account ─────────────────────────────────────────────
router.delete('/account', validate(z.object({
  password: z.string().min(1),
})), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true, role: true },
    });

    const valid = await bcrypt.compare(req.validated.password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Don't allow last admin/super_admin to delete account
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      const adminCount = await prisma.user.count({
        where: { organizationId: req.orgId, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account. Transfer admin role first.' });
      }
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: false },
    });

    res.json({ message: 'Account deactivated' });
  } catch (err) {
    next(err);
  }
});

// ─── Custom Fields ─────────────────────────────────────────────

// List custom fields
router.get('/custom-fields', async (req, res, next) => {
  try {
    const { divisionId } = req.query;

    // For super admin viewing all divisions (no specific divisionId):
    // return empty array since custom fields are division-specific and
    // showing all fields from all division templates is confusing
    if (!divisionId && req.isSuperAdmin) {
      return res.json([]);
    }

    // If super admin requests fields for a specific division, scope to that division only
    let orgFilter;
    if (divisionId && req.isSuperAdmin && req.orgIds.includes(divisionId)) {
      orgFilter = { organizationId: divisionId };
    } else {
      orgFilter = { organizationId: { in: req.orgIds } };
    }

    const fields = await prisma.customField.findMany({
      where: orgFilter,
      orderBy: { order: 'asc' },
    });

    res.json(fields);
  } catch (err) {
    next(err);
  }
});

// Create custom field
router.post('/custom-fields', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE']),
  options: z.array(z.string()).optional(),
  isRequired: z.boolean().optional(),
  divisionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const { label, type, options, isRequired, divisionId } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    // Generate name from label (e.g. "Company Size" -> "companySize")
    const name = label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
      .replace(/\s/g, '');

    // Get next order number
    const maxOrder = await prisma.customField.aggregate({
      where: { organizationId: targetOrgId },
      _max: { order: true },
    });

    const field = await prisma.customField.create({
      data: {
        name,
        label,
        type,
        options: (type === 'SELECT' || type === 'MULTI_SELECT') ? (options || []) : null,
        isRequired: isRequired || false,
        order: (maxOrder._max.order ?? -1) + 1,
        organizationId: targetOrgId,
      },
    });

    res.status(201).json(field);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A custom field with this name already exists' });
    }
    next(err);
  }
});

// Update custom field
router.put('/custom-fields/:id', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100).optional(),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL', 'EMAIL', 'PHONE']).optional(),
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const existing = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    const data = { ...req.validated };
    // If label changes, update name too
    if (data.label) {
      data.name = data.label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
        .replace(/\s/g, '');
    }

    const field = await prisma.customField.update({
      where: { id: req.params.id },
      data,
    });

    res.json(field);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A custom field with this name already exists' });
    }
    next(err);
  }
});

// Reorder custom fields
router.put('/custom-fields-reorder', authorize('ADMIN'), validate(z.object({
  fieldIds: z.array(z.string()),
})), async (req, res, next) => {
  try {
    const { fieldIds } = req.validated;
    const updates = fieldIds.map((id, index) =>
      prisma.customField.updateMany({
        where: { id, organizationId: { in: req.orgIds } },
        data: { order: index },
      })
    );
    await prisma.$transaction(updates);
    res.json({ message: 'Reordered' });
  } catch (err) {
    next(err);
  }
});

// Delete custom field
router.delete('/custom-fields/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    await prisma.customField.delete({ where: { id: req.params.id } });

    // Clean up: remove this field's data from all leads' customData
    const leads = await prisma.lead.findMany({
      where: { organizationId: existing.organizationId },
      select: { id: true, customData: true },
    });

    const updates = leads
      .filter(l => {
        const data = typeof l.customData === 'object' && l.customData ? l.customData : {};
        return existing.name in data;
      })
      .map(l => {
        const data = { ...(typeof l.customData === 'object' && l.customData ? l.customData : {}) };
        delete data[existing.name];
        return prisma.lead.update({ where: { id: l.id }, data: { customData: data } });
      });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    res.json({ message: 'Custom field deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Email Configuration ─────────────────────────────────────

const { testConnection, sendTestEmail } = require('../services/emailService');

// Helper: resolve the target division ID for email settings
// SUPER_ADMIN must specify ?divisionId=<id>; ADMIN uses their own org
async function resolveEmailOrgId(req, res) {
  const { divisionId } = req.query;

  if (req.isSuperAdmin) {
    if (!divisionId) {
      res.status(400).json({ error: 'Please select a division to configure email settings' });
      return null;
    }
    // Verify divisionId is a valid child division
    if (!req.orgIds.includes(divisionId)) {
      res.status(403).json({ error: 'Division not found or access denied' });
      return null;
    }
    return divisionId;
  }

  // ADMIN uses their own orgId (which is already a division)
  return req.orgId;
}

// Get email config
router.get('/email', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const emailConfig = settings.emailConfig || {};

    // Never return the password in plain text
    const sanitized = { ...emailConfig };
    if (sanitized.smtpPass) {
      sanitized.smtpPass = '••••••••';
      sanitized.hasPassword = true;
    }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Save email config
router.put('/email', authorize('ADMIN'), validate(z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().optional(),
  fromName: z.string().min(1).max(200),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().nullable(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const existingConfig = settings.emailConfig || {};

    // If password is masked or empty, keep the existing one
    if (!data.smtpPass || data.smtpPass === '••••••••') {
      data.smtpPass = existingConfig.smtpPass || '';
    }

    const emailConfig = {
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: data.smtpPass,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
    };

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailConfig } },
    });

    const sanitized = { ...emailConfig, smtpPass: '••••••••', hasPassword: true };
    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Test SMTP connection
router.post('/email/test-connection', authorize('ADMIN'), validate(z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.smtpPass || data.smtpPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.smtpPass = settings.emailConfig?.smtpPass || '';
    }

    const result = await testConnection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Send test email
router.post('/email/send-test', authorize('ADMIN'), validate(z.object({
  toEmail: z.string().email(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { toEmail } = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const emailConfig = settings.emailConfig;

    if (!emailConfig || !emailConfig.smtpHost) {
      return res.status(400).json({ success: false, message: 'Email not configured. Please save your SMTP settings first.' });
    }

    const result = await sendTestEmail(emailConfig, toEmail);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Incoming Email Configuration (IMAP / POP3) ─────────────

const { testImapConnection, testPop3Connection, fetchEmails } = require('../services/emailReceiveService');

// Get incoming email config
router.get('/email/incoming', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const config = settings.incomingEmailConfig || {};

    // Never return passwords in plain text
    const sanitized = { ...config };
    if (sanitized.imapPass) {
      sanitized.imapPass = '••••••••';
      sanitized.hasImapPassword = true;
    }
    if (sanitized.popPass) {
      sanitized.popPass = '••••••••';
      sanitized.hasPopPassword = true;
    }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Save incoming email config
router.put('/email/incoming', authorize('ADMIN'), validate(z.object({
  protocol: z.enum(['imap', 'pop3']),
  // IMAP fields
  imapHost: z.string().optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
  imapSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
  imapFolder: z.string().optional(),
  // POP3 fields
  popHost: z.string().optional(),
  popPort: z.coerce.number().int().min(1).max(65535).optional(),
  popUser: z.string().optional(),
  popPass: z.string().optional(),
  popSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
  popDeleteAfterFetch: z.boolean().optional(),
  // Common
  fetchInterval: z.coerce.number().int().min(1).max(1440).optional(),
  autoFetch: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const existingConfig = settings.incomingEmailConfig || {};

    // If passwords are masked or empty, keep the existing ones
    if (!data.imapPass || data.imapPass === '••••••••') {
      data.imapPass = existingConfig.imapPass || '';
    }
    if (!data.popPass || data.popPass === '••••••••') {
      data.popPass = existingConfig.popPass || '';
    }

    const incomingEmailConfig = {
      protocol: data.protocol,
      // IMAP
      imapHost: data.imapHost || existingConfig.imapHost || '',
      imapPort: data.imapPort || existingConfig.imapPort || 993,
      imapUser: data.imapUser || existingConfig.imapUser || '',
      imapPass: data.imapPass,
      imapSecurity: data.imapSecurity || existingConfig.imapSecurity || 'ssl',
      imapFolder: data.imapFolder || existingConfig.imapFolder || 'INBOX',
      // POP3
      popHost: data.popHost || existingConfig.popHost || '',
      popPort: data.popPort || existingConfig.popPort || 995,
      popUser: data.popUser || existingConfig.popUser || '',
      popPass: data.popPass,
      popSecurity: data.popSecurity || existingConfig.popSecurity || 'ssl',
      popDeleteAfterFetch: data.popDeleteAfterFetch ?? existingConfig.popDeleteAfterFetch ?? false,
      // Common
      fetchInterval: data.fetchInterval || existingConfig.fetchInterval || 5,
      autoFetch: data.autoFetch ?? existingConfig.autoFetch ?? false,
    };

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, incomingEmailConfig } },
    });

    // Return sanitized config
    const sanitized = { ...incomingEmailConfig };
    if (sanitized.imapPass) { sanitized.imapPass = '••••••••'; sanitized.hasImapPassword = true; }
    if (sanitized.popPass) { sanitized.popPass = '••••••••'; sanitized.hasPopPassword = true; }

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

// Test IMAP connection
router.post('/email/incoming/test-imap', authorize('ADMIN'), validate(z.object({
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapUser: z.string().min(1),
  imapPass: z.string().optional(),
  imapSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.imapPass || data.imapPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.imapPass = settings.incomingEmailConfig?.imapPass || '';
    }

    const result = await testImapConnection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Test POP3 connection
router.post('/email/incoming/test-pop3', authorize('ADMIN'), validate(z.object({
  popHost: z.string().min(1),
  popPort: z.coerce.number().int().min(1).max(65535),
  popUser: z.string().min(1),
  popPass: z.string().optional(),
  popSecurity: z.enum(['ssl', 'starttls', 'none']).optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const data = req.validated;

    // If password is masked, use the stored one
    if (!data.popPass || data.popPass === '••••••••') {
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });
      const settings = typeof org.settings === 'object' ? org.settings : {};
      data.popPass = settings.incomingEmailConfig?.popPass || '';
    }

    const result = await testPop3Connection(data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Fetch emails from configured incoming server
router.post('/email/incoming/fetch', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const result = await fetchEmails(targetOrgId, {
      limit: 20,
      markAsRead: false,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Email Templates ────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    name: 'welcome',
    label: 'Welcome',
    subject: 'Welcome to {{companyName}}!',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #6366f1;">Welcome, {{firstName}}!</h2>
  <p style="color: #374151; line-height: 1.6;">Thank you for your interest in {{companyName}}. We're excited to connect with you.</p>
  <p style="color: #374151; line-height: 1.6;">A member of our team will be in touch shortly to discuss how we can help.</p>
  <p style="color: #374151; line-height: 1.6;">Best regards,<br/>{{senderName}}</p>
</div>`,
    description: 'Sent to new leads when they first enter the system',
    isDefault: true,
  },
  {
    name: 'follow-up',
    label: 'Follow Up',
    subject: 'Following up — {{companyName}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #6366f1;">Hi {{firstName}},</h2>
  <p style="color: #374151; line-height: 1.6;">I wanted to follow up on our recent conversation. Do you have any questions or would you like to schedule a call?</p>
  <p style="color: #374151; line-height: 1.6;">I'm happy to help with anything you need.</p>
  <p style="color: #374151; line-height: 1.6;">Best regards,<br/>{{senderName}}</p>
</div>`,
    description: 'Follow-up email for leads that have been contacted',
    isDefault: true,
  },
  {
    name: 'proposal',
    label: 'Proposal',
    subject: 'Proposal from {{companyName}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #6366f1;">Hi {{firstName}},</h2>
  <p style="color: #374151; line-height: 1.6;">Please find our proposal details below. We've tailored this based on our discussion about your needs.</p>
  <p style="color: #374151; line-height: 1.6;">Feel free to reach out if you have any questions or would like to discuss further.</p>
  <p style="color: #374151; line-height: 1.6;">Best regards,<br/>{{senderName}}</p>
</div>`,
    description: 'Sent when sharing a proposal with a lead',
    isDefault: true,
  },
  {
    name: 'meeting-reminder',
    label: 'Meeting Reminder',
    subject: 'Reminder: Upcoming meeting — {{companyName}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #6366f1;">Hi {{firstName}},</h2>
  <p style="color: #374151; line-height: 1.6;">This is a friendly reminder about our upcoming meeting.</p>
  <p style="color: #374151; line-height: 1.6;">Looking forward to speaking with you!</p>
  <p style="color: #374151; line-height: 1.6;">Best regards,<br/>{{senderName}}</p>
</div>`,
    description: 'Reminder email before a scheduled meeting',
    isDefault: true,
  },
  {
    name: 'thank-you',
    label: 'Thank You',
    subject: 'Thank you — {{companyName}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #6366f1;">Thank you, {{firstName}}!</h2>
  <p style="color: #374151; line-height: 1.6;">We truly appreciate your business and trust in {{companyName}}.</p>
  <p style="color: #374151; line-height: 1.6;">If there's anything else we can help with, please don't hesitate to reach out.</p>
  <p style="color: #374151; line-height: 1.6;">Warm regards,<br/>{{senderName}}</p>
</div>`,
    description: 'Thank you email after closing a deal',
    isDefault: true,
  },
];

// Get email templates
router.get('/email/templates', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const templates = settings.emailTemplates || DEFAULT_TEMPLATES;

    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// Save a single email template (create or update by name)
router.put('/email/templates/:name', authorize('ADMIN'), validate(z.object({
  label: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  htmlBody: z.string().min(1),
  description: z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { name } = req.params;
    const data = req.validated;

    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    let templates = settings.emailTemplates || [...DEFAULT_TEMPLATES];

    const existingIdx = templates.findIndex((t) => t.name === name);
    const templateData = {
      name,
      label: data.label,
      subject: data.subject,
      htmlBody: data.htmlBody,
      description: data.description || '',
      isDefault: false,
    };

    if (existingIdx >= 0) {
      templates[existingIdx] = { ...templates[existingIdx], ...templateData };
    } else {
      templates.push(templateData);
    }

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailTemplates: templates } },
    });

    res.json(templateData);
  } catch (err) {
    next(err);
  }
});

// Delete an email template
router.delete('/email/templates/:name', authorize('ADMIN'), async (req, res, next) => {
  try {
    const targetOrgId = await resolveEmailOrgId(req, res);
    if (!targetOrgId) return;

    const { name } = req.params;
    const org = await prisma.organization.findUnique({
      where: { id: targetOrgId },
      select: { settings: true },
    });
    const settings = typeof org.settings === 'object' ? org.settings : {};
    let templates = settings.emailTemplates || [...DEFAULT_TEMPLATES];

    templates = templates.filter((t) => t.name !== name);

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: { settings: { ...settings, emailTemplates: templates } },
    });

    res.json({ message: 'Template deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
