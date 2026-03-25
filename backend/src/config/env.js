const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Email
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  // IMAP (Incoming)
  imap: {
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10) || 993,
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
    security: process.env.IMAP_SECURITY || 'ssl',
  },

  // POP3 (Incoming)
  pop3: {
    host: process.env.POP3_HOST,
    port: parseInt(process.env.POP3_PORT, 10) || 995,
    user: process.env.POP3_USER,
    pass: process.env.POP3_PASS,
    security: process.env.POP3_SECURITY || 'ssl',
  },

  // WhatsApp
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL,
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    /** When no division matches webhook phone_number_id / display phone, route inbound here (dev / single-tenant). Must be a valid Organization id. */
    unmatchedFallbackOrgId: process.env.WHATSAPP_UNMATCHED_FALLBACK_ORG_ID || null,
  },

  // AI
  ai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL || 'gpt-4',
  },

  // Webhook
  webhookSecret: process.env.WEBHOOK_SECRET || 'webhook-secret',

  /** Optional S3-compatible object storage for inbox attachments (AWS S3, R2, MinIO). */
  attachmentsS3: {
    bucket: process.env.S3_BUCKET || process.env.ATTACHMENTS_S3_BUCKET || '',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    endpoint: process.env.S3_ENDPOINT || process.env.ATTACHMENTS_S3_ENDPOINT || '',
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === 'true' ||
      process.env.ATTACHMENTS_S3_FORCE_PATH_STYLE === 'true',
    keyPrefix: process.env.S3_ATTACHMENT_PREFIX || process.env.ATTACHMENTS_S3_PREFIX || 'inbox',
    /** Presigned GET redirect TTL (seconds). */
    signedUrlTtlSeconds: parseInt(
      process.env.S3_SIGNED_URL_TTL_SECONDS || process.env.ATTACHMENTS_S3_URL_TTL || '3600',
      10
    ) || 3600,
  },
};

module.exports = { config };
