const { prisma } = require('../config/database');

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

async function findConnectedIntegration(organizationId, platform) {
  return prisma.integration.findFirst({
    where: {
      organizationId,
      platform,
      status: { not: 'disconnected' },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

function normalizeGraphError(payload, status) {
  const err = payload?.error || {};
  const parts = [];
  if (err.code != null) parts.push(`code ${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode ${err.error_subcode}`);
  const prefix = parts.length ? `[Meta ${parts.join('/')}] ` : '';
  const base = err.message || `HTTP ${status}`;
  return `${prefix}${base}`;
}

async function sendGraphMessage({
  pageId,
  accessToken,
  recipientId,
  text,
}) {
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(normalizeGraphError(payload, response.status));
  }
  return payload;
}

async function sendFacebookMessage(organizationId, recipientId, text) {
  const integration = await findConnectedIntegration(organizationId, 'messenger');
  if (!integration) throw new Error('Facebook Messenger integration is not connected');
  const accessToken = String(integration.credentials?.accessToken || '').trim();
  const pageId = String(integration.config?.pageId || '').trim();
  if (!accessToken || !pageId) {
    throw new Error('Facebook Messenger integration is missing pageId or accessToken');
  }
  const result = await sendGraphMessage({ pageId, accessToken, recipientId, text });
  return {
    messageId: result.message_id || null,
    recipientId: result.recipient_id || recipientId,
  };
}

async function sendInstagramMessage(organizationId, recipientId, text) {
  const integration = await findConnectedIntegration(organizationId, 'instagram');
  if (!integration) throw new Error('Instagram integration is not connected');
  const accessToken = String(integration.credentials?.accessToken || '').trim();
  const pageId = String(integration.config?.pageId || '').trim();
  if (!accessToken || !pageId) {
    throw new Error('Instagram integration is missing pageId or accessToken');
  }
  const result = await sendGraphMessage({ pageId, accessToken, recipientId, text });
  return {
    messageId: result.message_id || null,
    recipientId: result.recipient_id || recipientId,
  };
}

module.exports = {
  sendFacebookMessage,
  sendInstagramMessage,
  findConnectedIntegration,
};
