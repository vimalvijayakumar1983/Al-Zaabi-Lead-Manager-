const path = require('path');
const { config } = require('../config/env');
const { logger } = require('../config/logger');

function isAttachmentObjectStorageEnabled() {
  const s = config.attachmentsS3;
  return Boolean(s.bucket && s.region && s.accessKeyId && s.secretAccessKey);
}

function sanitizeFilename(name) {
  const base = path.basename(name || 'file').replace(/[^\w.\-()+ ]/g, '_') || 'file';
  return base.slice(0, 200);
}

function buildObjectKey({ organizationId, leadId, attachmentId, filename }) {
  const prefix = (config.attachmentsS3.keyPrefix || 'inbox').replace(/^\/+|\/+$/g, '');
  const safe = sanitizeFilename(filename);
  return `${prefix}/${organizationId}/${leadId}/${attachmentId}/${safe}`;
}

let _client;
function getS3Client() {
  if (_client) return _client;
  const { S3Client } = require('@aws-sdk/client-s3');
  const s = config.attachmentsS3;
  _client = new S3Client({
    region: s.region,
    credentials: {
      accessKeyId: s.accessKeyId,
      secretAccessKey: s.secretAccessKey,
    },
    ...(s.endpoint ? { endpoint: s.endpoint } : {}),
    ...(s.forcePathStyle ? { forcePathStyle: true } : {}),
  });
  return _client;
}

/**
 * Upload buffer to S3-compatible bucket. Returns storage key for DB.
 */
async function uploadInboxAttachmentBuffer({
  buffer,
  mimeType,
  organizationId,
  leadId,
  attachmentId,
  filename,
}) {
  if (!isAttachmentObjectStorageEnabled()) {
    throw new Error('Object storage is not configured');
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const Key = buildObjectKey({ organizationId, leadId, attachmentId, filename });
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.attachmentsS3.bucket,
      Key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    })
  );
  return Key;
}

/**
 * HTTPS URL for clients (GET). Uses presigned URL (private buckets).
 */
async function getInboxAttachmentReadUrl(storageKey) {
  if (!storageKey || !isAttachmentObjectStorageEnabled()) return null;
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const client = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: config.attachmentsS3.bucket,
      Key: storageKey,
    });
    const ttl = Math.min(Math.max(config.attachmentsS3.signedUrlTtlSeconds, 60), 86400);
    return await getSignedUrl(client, cmd, { expiresIn: ttl });
  } catch (err) {
    logger.error('attachmentStorage.getInboxAttachmentReadUrl failed', { message: err.message });
    return null;
  }
}

module.exports = {
  isAttachmentObjectStorageEnabled,
  uploadInboxAttachmentBuffer,
  getInboxAttachmentReadUrl,
};
