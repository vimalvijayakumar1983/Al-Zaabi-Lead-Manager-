const { prisma } = require('../config/database');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { broadcastDataChange } = require('../websocket/server');

/**
 * Normalize phone to digits-only (wa_id format). WhatsApp "from" is already digits.
 */
function normalizePhone(waId) {
  return String(waId || '').replace(/\D/g, '');
}

/**
 * Resolve organizationId from webhook phone_number_id.
 * Checks settings.whatsappNumbers[] first, then settings.whatsappPhoneNumberId, then env.
 * Normalizes all IDs to string for comparison (Meta may send number or string).
 */
async function resolveOrganizationId(phoneNumberId) {
  const id = String(phoneNumberId ?? '').trim();
  if (!id) return null;

  const orgs = await prisma.organization.findMany({
    select: { id: true, settings: true },
  });

  for (const org of orgs) {
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const numbers = settings.whatsappNumbers;
    if (Array.isArray(numbers)) {
      for (const entry of numbers) {
        const entryId = String(entry?.phoneNumberId ?? '').trim();
        if (entryId && entryId === id) {
          console.log('[WhatsApp Inbound] Matched division/org by whatsappNumbers[]', {
            webhookPhoneNumberId: id,
            organizationId: org.id,
            label: entry?.label || null,
          });
          return org.id;
        }
      }
    }
    const singleId = String(settings.whatsappPhoneNumberId ?? '').trim();
    if (singleId && singleId === id) {
      console.log('[WhatsApp Inbound] Matched division/org by legacy whatsappPhoneNumberId', {
        webhookPhoneNumberId: id,
        organizationId: org.id,
      });
      return org.id;
    }
  }

  const globalId = config.whatsapp?.phoneNumberId;
  if (globalId && String(globalId).trim() === id) {
    const first = await prisma.organization.findFirst({ select: { id: true } });
    console.log('[WhatsApp Inbound] Matched org via env WHATSAPP_PHONE_NUMBER_ID → first org fallback', {
      webhookPhoneNumberId: id,
      organizationId: first?.id ?? null,
    });
    return first?.id ?? null;
  }

  console.warn('[WhatsApp Inbound] No division/org for this phone_number_id — message not saved to inbox', {
    webhookPhoneNumberId: id,
    scannedOrgs: orgs.length,
    hint: 'Add this Phone Number ID under Settings → WhatsApp for the correct division.',
  });

  logger.warn('WhatsApp inbound: no organization for phone_number_id', {
    phoneNumberId: id,
    hint: 'Add this Phone Number ID in Settings → WhatsApp (admin). Or set WHATSAPP_PHONE_NUMBER_ID in .env.',
  });
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
    return;
  }

  const orgRow = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, type: true, parentId: true },
  });
  console.log('[WhatsApp Inbound] Saving to inbox under division/org', {
    organizationId,
    organizationName: orgRow?.name,
    organizationType: orgRow?.type,
    parentId: orgRow?.parentId,
    businessPhoneNumberId: phoneNumberId,
    senderWaId: from,
    messageId,
  });

  const phoneNormalized = normalizePhone(from);
  if (!phoneNormalized) {
    console.warn('[WhatsApp Inbound] Missing sender wa_id — not saving', { phoneNumberId, from });
    logger.warn('WhatsApp inbound: missing from (wa_id)', { phoneNumberId });
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

  broadcastDataChange(lead.organizationId, 'communication', 'created', null, { entityId: lead.id }).catch(() => {});

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: null,
      type: 'WHATSAPP_RECEIVED',
      description: `WhatsApp received: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`,
    },
  });

  logger.info('WhatsApp inbound: lead and message saved', {
    leadId: lead.id,
    organizationId: lead.organizationId,
    from: `+${phoneNormalized}`,
    messageId,
  });

  console.log('[WhatsApp Inbound] Inbox row created (Communication)', {
    leadId: lead.id,
    organizationId: lead.organizationId,
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    bodyPreview: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    messageId,
  });
}

module.exports = { processInboundWhatsAppMessage, resolveOrganizationId, findOrCreateLead, normalizePhone };
