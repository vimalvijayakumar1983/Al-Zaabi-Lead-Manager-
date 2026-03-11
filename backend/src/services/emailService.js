const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const { logger } = require('../config/logger');

let transporter = null;

const getTransporter = () => {
  if (!transporter && config.smtp.host) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
};

/**
 * Send an email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('Email not configured. Skipping send.');
    return null;
  }

  try {
    const result = await transport.sendMail({
      from: config.smtp.user,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
    return result;
  } catch (err) {
    logger.error('Email send failed:', err);
    throw err;
  }
};

module.exports = { sendEmail };
