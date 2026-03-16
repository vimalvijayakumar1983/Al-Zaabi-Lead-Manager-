const { prisma } = require('../config/database');
const { config } = require('../config/env');
const { logger } = require('../config/logger');

/**
 * Normalize phone to digits-only (wa_id format). WhatsApp "from" is already digits.
 */
function normalizePhone(waId) {
  return String(waId || '').replace(/\D/g, '');
}

/**
 * Resolve organizationId from webhook phone_number_id.
 * Option B: find org where settings.whatsappPhoneNumberId matches; else fallback to env + first org.
 */
async function resolveOrganizationId(phoneNumberId) {
  const id = String(phoneNumberId || '');

  const orgs = await prisma.organization.findMany({
    select: { id: true, settings: true },
  });

  for (const org of orgs) {
    const settings = typeof org.settings === 'object' ? org.settings : {};
    if (settings.whatsappPhoneNumberId === id) {
      return org.id;
    }
  }

  const globalId = config.whatsapp?.phoneNumberId;
  if (globalId && String(globalId) === id) {
    const first = await prisma.organization.findFirst({ select: { id: true } });
    return first?.id ?? null;
  }

  return null;
}

/**
 * Find or create lead by phone + org. Returns lead.
 */
async function findOrCreateLead(organizationId, phoneNormalized, contactName) {
  const existing = await prisma.lead.findFirst({
    where: {
      organizationId,
      phone: { in: [phoneNormalized, `+${phoneNormalized}`] },
      isArchived: false,
    },
  });
  if (existing) return existing;

  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });

  const firstName = contactName ? contactName.split(/\s+/)[0] || 'WhatsApp' : 'WhatsApp';
  const lastName = contactName ? contactName.split(/\s+/).slice(1).join(' ') || '' : '';

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      firstName,
      lastName,
      phone: `+${phoneNormalized}`,
      email: null,
      source: 'WHATSAPP',
      stageId: defaultStage?.id,
    },
  });

  logger.info('Lead created from WhatsApp', { leadId: lead.id, phone: phoneNormalized });
  return lead;
}

/**
 * Process one inbound WhatsApp message: resolve org, find-or-create lead, log communication + activity.
 */
async function processInboundWhatsAppMessage({ phoneNumberId, from, messageId, bodyText, contactName }) {
  const organizationId = await resolveOrganizationId(phoneNumberId);
  if (!organizationId) {
    logger.warn('WhatsApp inbound: no organization for phone_number_id', { phoneNumberId });
    return;
  }

  const phoneNormalized = normalizePhone(from);
  if (!phoneNormalized) {
    logger.warn('WhatsApp inbound: missing from (wa_id)');
    return;
  }

  const lead = await findOrCreateLead(organizationId, phoneNormalized, contactName);

  const body = bodyText || '(no text)';

  await prisma.communication.create({
    data: {
      leadId: lead.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      body,
      metadata: { messageId, from: `+${phoneNormalized}` },
      userId: null,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: null,
      type: 'WHATSAPP_RECEIVED',
      description: `WhatsApp received: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`,
    },
  });
}

module.exports = { processInboundWhatsAppMessage, resolveOrganizationId, findOrCreateLead, normalizePhone };
