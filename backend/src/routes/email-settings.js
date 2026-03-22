const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendTestEmail } = require('../email');

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Get Email Settings ──────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    
    // Only SUPER_ADMIN and ADMIN can view email settings
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    // Get group org ID
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, parentId: true, type: true }
    });
    
    const groupOrgId = org.type === 'GROUP' ? org.id : org.parentId;
    
    const settings = await prisma.$queryRaw`
      SELECT * FROM email_settings WHERE "organizationId" = ${groupOrgId} LIMIT 1
    `;
    
    if (settings && settings.length > 0) {
      // Mask password for security
      const s = settings[0];
      res.json({
        ...s,
        smtpPassword: s.smtpPassword ? '••••••••' : '',
        hasPassword: !!s.smtpPassword
      });
    } else {
      res.json({
        smtpHost: 'mail.alzaabigroup.com',
        smtpPort: 465,
        smtpSecure: true,
        smtpUsername: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'Al-Zaabi Lead Manager',
        imapHost: 'mail.alzaabigroup.com',
        imapPort: 993,
        imapSecure: true,
        hasPassword: false
      });
    }
  } catch (err) {
    next(err);
  }
});

// ─── Update Email Settings ───────────────────────────────────────
router.put('/', async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const { smtpHost, smtpPort, smtpSecure, smtpUsername, smtpPassword, fromEmail, fromName, imapHost, imapPort, imapSecure } = req.body;
    
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, parentId: true, type: true }
    });
    
    const groupOrgId = org.type === 'GROUP' ? org.id : org.parentId;
    
    // Check if settings exist
    const existing = await prisma.$queryRaw`
      SELECT id, "smtpPassword" FROM email_settings WHERE "organizationId" = ${groupOrgId} LIMIT 1
    `;
    
    // Don't overwrite password if masked value sent
    const actualPassword = (smtpPassword && smtpPassword !== '••••••••') 
      ? smtpPassword 
      : (existing && existing.length > 0 ? existing[0].smtpPassword : '');
    
    if (existing && existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE email_settings SET 
          "smtpHost" = ${smtpHost || 'mail.alzaabigroup.com'},
          "smtpPort" = ${smtpPort || 465},
          "smtpSecure" = ${smtpSecure !== false},
          "smtpUsername" = ${smtpUsername || ''},
          "smtpPassword" = ${actualPassword},
          "fromEmail" = ${fromEmail || ''},
          "fromName" = ${fromName || 'Al-Zaabi Lead Manager'},
          "imapHost" = ${imapHost || ''},
          "imapPort" = ${imapPort || 993},
          "imapSecure" = ${imapSecure !== false},
          "updatedAt" = NOW()
        WHERE "organizationId" = ${groupOrgId}
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO email_settings ("id", "organizationId", "smtpHost", "smtpPort", "smtpSecure", "smtpUsername", "smtpPassword", "fromEmail", "fromName", "imapHost", "imapPort", "imapSecure")
        VALUES (gen_random_uuid()::text, ${groupOrgId}, ${smtpHost || ''}, ${smtpPort || 465}, ${smtpSecure !== false}, ${smtpUsername || ''}, ${actualPassword}, ${fromEmail || ''}, ${fromName || 'Al-Zaabi Lead Manager'}, ${imapHost || ''}, ${imapPort || 993}, ${imapSecure !== false})
      `;
    }
    
    res.json({ message: 'Email settings saved successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Send Test Email ─────────────────────────────────────────────
router.post('/test', async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const { toEmail } = req.body;
    const targetEmail = toEmail || user.email;
    
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, parentId: true, type: true }
    });
    
    const groupOrgId = org.type === 'GROUP' ? org.id : org.parentId;
    
    try {
      await sendTestEmail(targetEmail, groupOrgId);
      res.json({ message: `Test email sent to ${targetEmail}` });
    } catch (emailErr) {
      console.error('Test email failed:', emailErr.message);
      res.status(400).json({ error: `Failed to send: ${emailErr.message}` });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
