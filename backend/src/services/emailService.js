const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');

/**
 * Get email configuration for an organization.
 * Falls back to env-level SMTP config if org has none.
 */
const getEmailConfig = async (organizationId) => {
  if (organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });
      const settings = typeof org?.settings === 'object' ? org.settings : {};
      if (settings.emailConfig && settings.emailConfig.smtpHost) {
        return settings.emailConfig;
      }
    } catch (err) {
      logger.warn('Failed to load org email config, falling back to env:', err.message);
    }
  }

  // Fallback to environment config
  if (config.smtp.host) {
    return {
      smtpHost: config.smtp.host,
      smtpPort: config.smtp.port,
      smtpUser: config.smtp.user,
      smtpPass: config.smtp.pass,
      fromName: 'Al-Zaabi CRM',
      fromEmail: config.smtp.user,
    };
  }

  return null;
};

/**
 * Create a nodemailer transporter from email config
 */
const createTransporter = (emailConfig) => {
  return nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: parseInt(emailConfig.smtpPort, 10) || 587,
    secure: parseInt(emailConfig.smtpPort, 10) === 465,
    auth: {
      user: emailConfig.smtpUser,
      pass: emailConfig.smtpPass,
    },
  });
};

/**
 * Send an email using the organization's email config
 */
const sendEmail = async ({ to, subject, html, text, organizationId }) => {
  const emailConfig = await getEmailConfig(organizationId);

  if (!emailConfig) {
    logger.warn('Email not configured. Skipping send.');
    return { success: false, error: 'Email not configured' };
  }

  const transporter = createTransporter(emailConfig);
  const fromName = emailConfig.fromName || 'Al-Zaabi CRM';
  const fromEmail = emailConfig.fromEmail || emailConfig.smtpUser;

  try {
    const result = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text,
      replyTo: emailConfig.replyTo || fromEmail,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
    return { success: true, messageId: result.messageId };
  } catch (err) {
    logger.error('Email send failed:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Test SMTP connection with given config
 */
const testConnection = async (emailConfig) => {
  try {
    const transporter = createTransporter(emailConfig);
    await transporter.verify();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

/**
 * Send a test email
 */
const sendTestEmail = async (emailConfig, toEmail) => {
  try {
    const transporter = createTransporter(emailConfig);
    const fromName = emailConfig.fromName || 'Al-Zaabi CRM';
    const fromEmail = emailConfig.fromEmail || emailConfig.smtpUser;

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      subject: 'Test Email from Al-Zaabi CRM',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #6366f1; margin-bottom: 16px;">Email Configuration Test</h2>
          <p style="color: #374151; line-height: 1.6;">
            This is a test email from your Al-Zaabi CRM. If you're reading this, your email settings are configured correctly!
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            Sent from Al-Zaabi Lead Manager
          </p>
        </div>
      `,
      text: 'This is a test email from your Al-Zaabi CRM. If you are reading this, your email settings are configured correctly!',
    });

    return { success: true, message: `Test email sent to ${toEmail}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

/**
 * Convert plain text body (with line breaks) to styled HTML paragraphs.
 * Admins write plain text — this converts it to email-safe HTML.
 */
const textToHtml = (text) => {
  if (!text) return '';
  // Split on double newlines for paragraphs, single newlines for <br>
  return text
    .split(/\n\n+/)
    .map((para) => {
      const inner = para
        .split('\n')
        .map((line) => line.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]))
        .join('<br/>');
      return `<p style="color: #374151; line-height: 1.7; margin: 0 0 16px 0; font-size: 15px;">${inner}</p>`;
    })
    .join('\n');
};

/**
 * Wrap email body content in a professional, responsive HTML email layout.
 * Uses org branding (color, name) when available.
 */
const wrapInHtmlLayout = (bodyHtml, options = {}) => {
  const brandColor = options.brandColor || '#6366f1';
  const orgName = options.orgName || 'Al-Zaabi CRM';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${orgName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr>
    <td style="background-color:${brandColor};padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${orgName}</h1>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 32px 24px 32px;">
      ${bodyHtml}
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="padding:0 32px 28px 32px;">
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;"/>
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;text-align:center;">
        Sent by ${orgName}<br/>
        This is an automated message. Please do not reply directly to this email.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

/**
 * Render an email template with variable substitution.
 * Supports two modes:
 *   1. Plain text `body` field — auto-converts to HTML and wraps in branded layout (admin-friendly)
 *   2. Legacy `htmlBody` field — used as-is (backward compatible)
 */
const renderTemplate = (template, variables, options = {}) => {
  let subject = template.subject || '';

  // Replace {{variable}} placeholders in subject
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, String(value || ''));
  }

  let html;

  if (template.body) {
    // Admin-friendly mode: plain text body → auto-wrap in HTML layout
    let bodyText = template.body;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      bodyText = bodyText.replace(regex, String(value || ''));
    }
    const bodyHtml = textToHtml(bodyText);
    html = wrapInHtmlLayout(bodyHtml, options);
  } else {
    // Legacy mode: raw htmlBody
    html = template.htmlBody || '';
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      html = html.replace(regex, String(value || ''));
    }
  }

  // Generate plain text fallback
  const text = (template.body || template.htmlBody || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] || ''));

  return { subject, html, text };
};

/**
 * Get email template by name for an organization
 */
const getTemplate = async (templateName, organizationId) => {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = typeof org?.settings === 'object' ? org.settings : {};
  const templates = settings.emailTemplates || [];
  return templates.find((t) => t.name === templateName) || null;
};

/**
 * Send email using a named template
 */
const sendTemplateEmail = async ({ to, templateName, variables, organizationId }) => {
  const template = await getTemplate(templateName, organizationId);

  if (!template) {
    logger.warn(`Email template "${templateName}" not found for org ${organizationId}`);
    return { success: false, error: `Template "${templateName}" not found` };
  }

  // Fetch org branding for the HTML layout
  let layoutOptions = {};
  if (organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, tradeName: true, primaryColor: true },
      });
      if (org) {
        layoutOptions = {
          orgName: org.tradeName || org.name,
          brandColor: org.primaryColor || '#6366f1',
        };
      }
    } catch (err) {
      logger.warn('Failed to load org branding for email:', err.message);
    }
  }

  const { subject, html, text } = renderTemplate(template, variables, layoutOptions);

  return sendEmail({ to, subject, html, text, organizationId });
};

module.exports = { sendEmail, testConnection, sendTestEmail, renderTemplate, getTemplate, sendTemplateEmail, getEmailConfig, wrapInHtmlLayout, textToHtml };
