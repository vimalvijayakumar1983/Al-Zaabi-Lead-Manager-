const nodemailer = require('nodemailer');
const { prisma } = require('./config/database');

// Get email settings for an organization
// Priority: 1) Division's Settings page config  2) email_settings table  3) Parent org  4) Defaults
async function getEmailSettings(organizationId) {
  // 1) Check division's organization.settings.emailConfig (set from Settings page)
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true, parentId: true, type: true }
  });

  if (org) {
    const orgSettings = typeof org.settings === 'object' && org.settings ? org.settings : {};
    const emailConfig = orgSettings.emailConfig;
    if (emailConfig && emailConfig.smtpHost && emailConfig.smtpUser) {
      // Map Settings page field names to email.js field names
      return {
        smtpHost: emailConfig.smtpHost,
        smtpPort: emailConfig.smtpPort || 465,
        smtpSecure: emailConfig.smtpPort === 587 ? false : true,
        smtpUsername: emailConfig.smtpUser,
        smtpPassword: emailConfig.smtpPass,
        fromEmail: emailConfig.fromEmail || emailConfig.smtpUser,
        fromName: emailConfig.fromName || 'Al-Zaabi Lead Manager'
      };
    }
  }

  // 2) Check email_settings table for this org
  let settings = await prisma.$queryRaw`
    SELECT * FROM email_settings WHERE "organizationId" = ${organizationId} LIMIT 1
  `;
  if (settings && settings.length > 0) {
    return settings[0];
  }

  // 3) Try parent org (for divisions inheriting group settings)
  if (org?.parentId) {
    // Check parent's organization.settings.emailConfig
    const parentOrg = await prisma.organization.findUnique({
      where: { id: org.parentId },
      select: { settings: true }
    });
    if (parentOrg) {
      const parentSettings = typeof parentOrg.settings === 'object' && parentOrg.settings ? parentOrg.settings : {};
      const parentEmailConfig = parentSettings.emailConfig;
      if (parentEmailConfig && parentEmailConfig.smtpHost && parentEmailConfig.smtpUser) {
        return {
          smtpHost: parentEmailConfig.smtpHost,
          smtpPort: parentEmailConfig.smtpPort || 465,
          smtpSecure: parentEmailConfig.smtpPort === 587 ? false : true,
          smtpUsername: parentEmailConfig.smtpUser,
          smtpPassword: parentEmailConfig.smtpPass,
          fromEmail: parentEmailConfig.fromEmail || parentEmailConfig.smtpUser,
          fromName: parentEmailConfig.fromName || 'Al-Zaabi Lead Manager'
        };
      }
    }

    // Check parent's email_settings table
    settings = await prisma.$queryRaw`
      SELECT * FROM email_settings WHERE "organizationId" = ${org.parentId} LIMIT 1
    `;
    if (settings && settings.length > 0) {
      return settings[0];
    }
  }

  // 4) Fallback defaults (Zimbra)
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
            &copy; ${new Date().getFullYear()} Al-Zaabi Group &middot; Enterprise Lead Manager
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

// Send user invitation email with login credentials
async function sendInviteEmail(toEmail, password, userName, divisionName, role, inviterName, organizationId) {
  const settings = await getEmailSettings(organizationId);
  const transporter = createTransporter(settings);
  
  const loginUrl = process.env.FRONTEND_URL || 'https://al-zaabi-lead-manager.vercel.app';
  
  const roleLabels = {
    'ADMIN': 'Administrator',
    'MANAGER': 'Manager',
    'SALES_REP': 'Sales Representative',
    'VIEWER': 'Viewer',
    'SUPER_ADMIN': 'Super Administrator'
  };
  const roleDisplay = roleLabels[role] || role;
  
  const divisionRow = divisionName
    ? `<tr><td style="color:#64748b;font-size:14px;padding:8px 0;width:100px;">Division:</td><td style="color:#0f172a;font-size:14px;font-weight:600;padding:8px 0;">${divisionName}</td></tr>`
    : '';
  
  const inviteText = inviterName
    ? `${inviterName} has invited you to join`
    : 'You have been invited to join';
  
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
            <span style="font-size:28px;">🎉</span>
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Welcome to the Team!</h1>
          <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Al-Zaabi Lead Manager</p>
        </div>
        
        <!-- Body -->
        <div style="padding:32px;">
          <p style="color:#1f2937;font-size:16px;line-height:1.6;margin:0 0 16px;">
            Hi <strong>${userName || 'there'}</strong>,
          </p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
            ${inviteText} <strong>${divisionName || 'Al-Zaabi Group'}</strong> as a <strong>${roleDisplay}</strong> on the Al-Zaabi Lead Manager platform.
          </p>
          
          <!-- Credentials Box -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;">
            <h3 style="color:#1e293b;font-size:14px;font-weight:600;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.5px;">Your Login Credentials</h3>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="color:#64748b;font-size:14px;padding:8px 0;width:100px;">Email:</td>
                <td style="color:#0f172a;font-size:14px;font-weight:600;padding:8px 0;">${toEmail}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:14px;padding:8px 0;width:100px;">Password:</td>
                <td style="padding:8px 0;"><span style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;background:#fff7ed;padding:4px 12px;border-radius:6px;border:1px solid #fed7aa;">${password}</span></td>
              </tr>
              <tr>
                <td style="color:#64748b;font-size:14px;padding:8px 0;width:100px;">Role:</td>
                <td style="color:#0f172a;font-size:14px;font-weight:600;padding:8px 0;">${roleDisplay}</td>
              </tr>
              ${divisionRow}
            </table>
          </div>
          
          <!-- Login Button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 40px;border-radius:12px;box-shadow:0 4px 12px rgba(79,70,229,0.3);">
              Log In Now
            </a>
          </div>
          
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:24px 0;">
            <p style="color:#92400e;font-size:13px;line-height:1.5;margin:0;">
              <strong>⚠️ Important:</strong> Please change your password after your first login for security. Go to Settings to update your password.
            </p>
          </div>
          
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;margin-top:20px;">
            <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
              If you didn't expect this invitation, please contact your administrator.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            &copy; ${new Date().getFullYear()} Al-Zaabi Group &middot; Enterprise Lead Manager
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: toEmail,
    subject: `Welcome to ${divisionName || 'Al-Zaabi Group'} - Your Login Credentials`,
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

module.exports = { getEmailSettings, sendPasswordResetEmail, sendTestEmail, sendInviteEmail, createTransporter };
