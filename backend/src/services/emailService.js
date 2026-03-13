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
 * Render an email template with variable substitution
 */
const renderTemplate = (template, variables) => {
  let html = template.htmlBody || '';
  let subject = template.subject || '';

  // Replace {{variable}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, String(value || ''));
    subject = subject.replace(regex, String(value || ''));
  }

  return { subject, html };
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

  const { subject, html } = renderTemplate(template, variables);

  return sendEmail({ to, subject, html, organizationId });
};

module.exports = { sendEmail, testConnection, sendTestEmail, renderTemplate, getTemplate, sendTemplateEmail, getEmailConfig };
