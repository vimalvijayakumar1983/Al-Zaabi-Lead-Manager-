const nodemailer = require('nodemailer');
const { prisma } = require('./config/database');

// Get email settings for an organization
async function getEmailSettings(organizationId) {
  // Try to find org-specific settings
  let settings = await prisma.$queryRaw`
    SELECT * FROM email_settings WHERE "organizationId" = ${organizationId} LIMIT 1
  `;
  
  if (settings && settings.length > 0) {
    return settings[0];
  }
  
  // Try to find parent org settings (for divisions)
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { parentId: true }
  });
  
  if (org?.parentId) {
    settings = await prisma.$queryRaw`
      SELECT * FROM email_settings WHERE "organizationId" = ${org.parentId} LIMIT 1
    `;
    if (settings && settings.length > 0) {
      return settings[0];
    }
  }
  
  // Fallback defaults
  return {
    smtpHost: 'mail.alzaabigroup.com',
    smtpPort: 465,
    smtpSecure: true,
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: 'noreply@alzaabigroup.com',
    fromName: 'Al-Zaabi Lead Manager'
  };
}

// Create a transporter from settings
function createTransporter(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure, // true for 465
    auth: {
      user: settings.smtpUsername,
      pass: settings.smtpPassword,
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certs (common with Zimbra)
    }
  });
}

// Send password reset email
async function sendPasswordResetEmail(toEmail, resetToken, userName, organizationId) {
  const settings = await getEmailSettings(organizationId);
  const transporter = createTransporter(settings);
  
  // Use frontend URL - Vercel deployment
  const resetUrl = `${process.env.FRONTEND_URL || 'https://al-zaabi-lead-manager.vercel.app'}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 32px;text-align:center;">
          <div style="width:56px;height:56px;margin:0 auto 16px;background:rgba(255,255,255,0.15);border-radius:14px;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">🔐</span>
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Password Reset</h1>
          <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Al-Zaabi Lead Manager</p>
        </div>
        
        <!-- Body -->
        <div style="padding:32px;">
          <p style="color:#1f2937;font-size:16px;line-height:1.6;margin:0 0 16px;">
            Hi <strong>${userName || 'there'}</strong>,
          </p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
            We received a request to reset your password. Click the button below to create a new password. This link expires in <strong>1 hour</strong>.
          </p>
          
          <!-- Button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 40px;border-radius:12px;box-shadow:0 4px 12px rgba(79,70,229,0.3);">
              Reset My Password
            </a>
          </div>
          
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:24px 0 0;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color:#4f46e5;font-size:13px;word-break:break-all;margin:8px 0 24px;">
            ${resetUrl}
          </p>
          
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;margin-top:20px;">
            <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
              If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            © ${new Date().getFullYear()} Al-Zaabi Group · Enterprise Lead Manager
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: toEmail,
    subject: 'Reset Your Password - Al-Zaabi Lead Manager',
    html
  });
}

// Send test email
async function sendTestEmail(toEmail, organizationId) {
  const settings = await getEmailSettings(organizationId);
  const transporter = createTransporter(settings);
  
  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: toEmail,
    subject: 'Test Email - Al-Zaabi Lead Manager',
    html: `
      <div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#4f46e5;">✅ Email Configuration Working!</h2>
        <p>This is a test email from Al-Zaabi Lead Manager.</p>
        <p style="color:#6b7280;">SMTP Host: ${settings.smtpHost}:${settings.smtpPort}</p>
        <p style="color:#6b7280;">Sent at: ${new Date().toISOString()}</p>
      </div>
    `
  });
}

module.exports = { getEmailSettings, sendPasswordResetEmail, sendTestEmail, createTransporter };
