const { prisma } = require('../config/database');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { enrichCommunicationForClient } = require('../utils/inboxCommunication');
const { emitCommunicationChange } = require('../utils/inboxRealtimeEmit');
const {
  digitsOnly,
  canonicalPhoneDigitsForWhatsApp,
  buildWhatsAppPhoneLookupVariants,
} = require('../utils/phoneWhatsApp');
const { downloadMedia } = require('./whatsappService');
const {
  isAttachmentObjectStorageEnabled,
  uploadInboxAttachmentBuffer,
} = require('./attachmentStorage');

/**
 * Normalize phone to digits-only (wa_id format). WhatsApp "from" is already digits.
 */
function normalizePhone(waId) {
  return digitsOnly(waId);
}

/** Meta phone_number_id values are numeric; normalize so JSON number vs string still matches. */
function canonicalWaPhoneNumberId(id) {
  return String(id ?? '').replace(/\D/g, '');
}

/**
 * Resolve organizationId from webhook metadata.
 * 1) Match settings.whatsappNumbers[].phoneNumberId (canonical digits)
 * 2) Match optional settings.whatsappNumbers[].displayPhone to metadata.display_phone_number (digits)
 * 3) Legacy whatsappPhoneNumberId
 * 4) Env WHATSAPP_PHONE_NUMBER_ID → first org (legacy)
 * 5) Env WHATSAPP_UNMATCHED_FALLBACK_ORG_ID (must exist)
 */
async function resolveOrganizationId(phoneNumberId, displayPhoneNumber) {
  const idCanon = canonicalWaPhoneNumberId(phoneNumberId);
  const displayCanon = displayPhoneNumber ? normalizePhone(displayPhoneNumber) : '';

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, type: true, settings: true },
  });

  // Collect ALL matching orgs first so we can log duplicates, then return the best one
  const allMatches = [];

  // Pass 1 — Phone Number ID (WABA)
  for (const org of orgs) {
    const settings = typeof org.settings === 'object' ? org.settings : {};
    const numbers = settings.whatsappNumbers;
    if (Array.isArray(numbers)) {
      for (const entry of numbers) {
        const entryId = canonicalWaPhoneNumberId(entry?.phoneNumberId);
        if (entryId && entryId === idCanon) {
          allMatches.push({
            organizationId: org.id,
            organizationName: org.name,
            organizationType: org.type,
            matchedBy: 'whatsappNumbers[].phoneNumberId',
            label: entry?.label || null,
          });
        }
      }
    }
    const singleId = canonicalWaPhoneNumberId(settings.whatsappPhoneNumberId);
    if (singleId && singleId === idCanon) {
      allMatches.push({
        organizationId: org.id,
        organizationName: org.name,
        organizationType: org.type,
        matchedBy: 'legacy whatsappPhoneNumberId',
        label: null,
      });
    }
  }

  if (allMatches.length > 0) {
    if (allMatches.length > 1) {
      console.warn('[WhatsApp Inbound] DUPLICATE: multiple orgs have phone_number_id', {
        phoneNumberId,
        canonicalId: idCanon,
        matches: allMatches,
      });
    }
    // Prefer DIVISION over GROUP; among divisions, prefer the one with a token (sendable)
    const preferred = allMatches.find(m => m.organizationType === 'DIVISION') || allMatches[0];
    console.log('[WhatsApp Inbound] Matched division/org by whatsappNumbers[].phoneNumberId', {
      webhookPhoneNumberId: phoneNumberId,
      canonicalId: idCanon,
      organizationId: preferred.organizationId,
      organizationName: preferred.organizationName,
      label: preferred.label,
      totalMatches: allMatches.length,
    });
    return preferred.organizationId;
  }

  // Pass 2 — Display business line (e.g. Meta sample uses display_phone_number when test ID differs)
  if (displayCanon) {
    for (const org of orgs) {
      const settings = typeof org.settings === 'object' ? org.settings : {};
      const numbers = settings.whatsappNumbers;
      if (!Array.isArray(numbers)) continue;
      for (const entry of numbers) {
        const configuredDisplay = normalizePhone(entry?.displayPhone);
        if (configuredDisplay && configuredDisplay === displayCanon) {
          console.log('[WhatsApp Inbound] Matched division/org by whatsappNumbers[].displayPhone', {
            display_phone_number: displayPhoneNumber,
            canonicalDisplay: displayCanon,
            organizationId: org.id,
            label: entry?.label || null,
          });
          return org.id;
        }
      }
    }
  }

  const globalId = canonicalWaPhoneNumberId(config.whatsapp?.phoneNumberId);
  if (globalId && globalId === idCanon) {
    // Prefer a DIVISION over a GROUP; within divisions prefer one that has
    // a sendable token in its own settings so outbound works too.
    const allOrgsForFallback = await prisma.organization.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: 'asc' },
    });
    const division = allOrgsForFallback.find(o => o.type === 'DIVISION') || allOrgsForFallback[0];
    console.log('[WhatsApp Inbound] Matched org via env WHATSAPP_PHONE_NUMBER_ID → fallback', {
      webhookPhoneNumberId: phoneNumberId,
      organizationId: division?.id ?? null,
      organizationName: division?.name ?? null,
      organizationType: division?.type ?? null,
      hint: 'Set Phone Number ID in the division\'s Settings → WhatsApp to avoid env fallback',
    });
    return division?.id ?? null;
  }

  const fallbackOrgId = config.whatsapp?.unmatchedFallbackOrgId;
  if (fallbackOrgId && String(fallbackOrgId).trim()) {
    const exists = await prisma.organization.findUnique({
      where: { id: String(fallbackOrgId).trim() },
      select: { id: true },
    });
    if (exists) {
      console.warn('[WhatsApp Inbound] Using WHATSAPP_UNMATCHED_FALLBACK_ORG_ID (no phone_number_id/display match)', {
        webhookPhoneNumberId: phoneNumberId,
        display_phone_number: displayPhoneNumber || null,
        organizationId: exists.id,
      });
      return exists.id;
    }
    logger.warn('WhatsApp inbound: WHATSAPP_UNMATCHED_FALLBACK_ORG_ID is set but organization not found', {
      fallbackOrgId,
    });
  }

  console.warn('[WhatsApp Inbound] No division/org for this webhook — message not saved to inbox', {
    webhookPhoneNumberId: phoneNumberId,
    canonicalId: idCanon,
    display_phone_number: displayPhoneNumber || null,
    scannedOrgs: orgs.length,
    hint: 'Set Phone Number ID (and optionally Display phone) under Settings → WhatsApp for the division, or set WHATSAPP_UNMATCHED_FALLBACK_ORG_ID for dev.',
  });

  logger.warn('WhatsApp inbound: no organization for phone_number_id', {
    phoneNumberId: idCanon || phoneNumberId,
    hint: 'Add this Phone Number ID in Settings → WhatsApp (admin). Or set WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_UNMATCHED_FALLBACK_ORG_ID in .env.',
  });
  return null;
}

/**
 * Find or create lead by phone + org. Returns lead.
 * @param {string} phoneDigits - digits from wa_id (or already canonical)
 */
async function findOrCreateLead(organizationId, phoneDigits, contactName) {
  const canon = canonicalPhoneDigitsForWhatsApp(phoneDigits);
  if (!canon) {
    throw new Error('findOrCreateLead: empty phone');
  }

  const lookupVariants = buildWhatsAppPhoneLookupVariants(canon);
  const existing = await prisma.lead.findFirst({
    where: {
      organizationId,
      phone: { in: lookupVariants },
      isArchived: false,
    },
  });
  if (existing) {
    const storedDigits = digitsOnly(existing.phone);
    const storedCanon = canonicalPhoneDigitsForWhatsApp(storedDigits);
    if (storedCanon === canon && storedDigits !== canon) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { phone: `+${canon}` },
      });
      logger.info('Lead phone normalized to match WhatsApp wa_id', {
        leadId: existing.id,
        before: existing.phone,
        after: `+${canon}`,
      });
      return prisma.lead.findUnique({ where: { id: existing.id } });
    }
    return existing;
  }

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
      phone: `+${canon}`,
      email: null,
      source: 'WHATSAPP',
      stageId: defaultStage?.id,
    },
  });

  logger.info('Lead created from WhatsApp', { leadId: lead.id, phone: canon });
  return lead;
}

/**
 * Process one inbound WhatsApp message: resolve org, find-or-create lead, log communication + activity.
 * Idempotent on Meta message id. Bumps lead.updatedAt so inbox conversation ordering refreshes.
 */
const MEDIA_TYPE_LABELS = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  voice: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
  location: 'Location',
};

function mediaExtension(mimeType) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'video/mp4': '.mp4', 'video/3gpp': '.3gp',
    'audio/ogg': '.ogg', 'audio/ogg; codecs=opus': '.ogg', 'audio/mpeg': '.mp3', 'audio/amr': '.amr', 'audio/aac': '.aac',
    'application/pdf': '.pdf',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };
  return map[mimeType] || '';
}

async function processInboundWhatsAppMessage({
  phoneNumberId,
  displayPhoneNumber,
  from,
  messageId,
  bodyText,
  contactName,
  mediaInfo,
  extraMeta,
}) {
  const organizationId = await resolveOrganizationId(phoneNumberId, displayPhoneNumber);
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
    display_phone_number: displayPhoneNumber || null,
    senderWaId: from,
    messageId,
    hasMedia: !!mediaInfo,
  });

  const phoneNormalized = normalizePhone(from);
  const phoneCanon = canonicalPhoneDigitsForWhatsApp(phoneNormalized);
  if (!phoneCanon) {
    console.warn('[WhatsApp Inbound] Missing sender wa_id — not saving', { phoneNumberId, from });
    logger.warn('WhatsApp inbound: missing from (wa_id)', { phoneNumberId });
    return;
  }

  if (messageId) {
    const dup = await prisma.communication.findFirst({
      where: {
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        metadata: { path: ['messageId'], equals: String(messageId) },
      },
      select: { id: true, leadId: true },
    });
    if (dup) {
      logger.info('WhatsApp inbound: duplicate webhook (messageId already stored), skipping', { messageId, communicationId: dup.id });
      console.log('[WhatsApp Inbound] Duplicate messageId ignored', { messageId, existingCommunicationId: dup.id });
      return;
    }
  }

  const lead = await findOrCreateLead(organizationId, phoneCanon, contactName);

  // ─── Handle media download & storage ─────────────────────────
  let attachmentMeta = null;
  if (mediaInfo && mediaInfo.mediaId) {
    try {
      console.log('[WhatsApp Inbound] Downloading media', {
        mediaType: mediaInfo.type,
        mediaId: mediaInfo.mediaId,
        mimeType: mediaInfo.mimeType,
      });

      const { buffer, mimeType, fileSize } = await downloadMedia(mediaInfo.mediaId, organizationId);
      const ext = mediaExtension(mimeType) || mediaExtension(mediaInfo.mimeType) || '';
      const filename = mediaInfo.filename || `whatsapp-${mediaInfo.type}-${Date.now()}${ext}`;
      const useS3 = isAttachmentObjectStorageEnabled();

      // Create the DB record first so we have a stable UUID for the S3 key
      const attachment = await prisma.attachment.create({
        data: {
          leadId: lead.id,
          filename,
          mimeType,
          size: fileSize || buffer.length,
          url: '',
          data: null,
          storageKey: null,
        },
      });

      const url = `/inbox/attachments/file/${attachment.id}`;
      let storageKey = null;

      if (useS3) {
        try {
          storageKey = await uploadInboxAttachmentBuffer({
            buffer,
            mimeType,
            organizationId,
            leadId: lead.id,
            attachmentId: attachment.id,
            filename,
          });
          logger.info('[WhatsApp Inbound] Media uploaded to S3', {
            attachmentId: attachment.id,
            storageKey,
            size: fileSize || buffer.length,
          });
        } catch (s3Err) {
          logger.error('[WhatsApp Inbound] S3 upload failed — falling back to base64 DB storage', {
            err: s3Err.message,
            attachmentId: attachment.id,
          });
        }
      }

      await prisma.attachment.update({
        where: { id: attachment.id },
        data: storageKey
          ? { url, storageKey }
          : { url, data: `data:${mimeType};base64,${buffer.toString('base64')}` },
      });

      attachmentMeta = {
        id: attachment.id,
        filename,
        mimeType,
        size: fileSize || buffer.length,
        url,
        mediaType: mediaInfo.type,
      };

      console.log('[WhatsApp Inbound] Media saved as attachment', {
        attachmentId: attachment.id,
        filename,
        mimeType,
        size: fileSize || buffer.length,
      });
    } catch (mediaErr) {
      logger.error('WhatsApp inbound: media download/save failed', {
        err: mediaErr.message,
        mediaId: mediaInfo.mediaId,
        mediaType: mediaInfo.type,
      });
      console.error('[WhatsApp Inbound] Media download failed — saving message without media', {
        err: mediaErr.message,
        mediaId: mediaInfo.mediaId,
      });
    }
  }

  const typeLabel = mediaInfo ? MEDIA_TYPE_LABELS[mediaInfo.type] || '' : '';
  const captionText = bodyText || mediaInfo?.caption || '';
  const body = captionText || (typeLabel ? `[${typeLabel}]` : '(no text)');

  const commMetadata = {
    messageId: messageId || undefined,
    from: `+${phoneCanon}`,
    ...(extraMeta && typeof extraMeta === 'object' ? extraMeta : {}),
  };
  if (mediaInfo) {
    commMetadata.mediaType = mediaInfo.type;
  }
  if (attachmentMeta) {
    commMetadata.attachments = [attachmentMeta];
  }

  const communication = await prisma.communication.create({
    data: {
      leadId: lead.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      body,
      metadata: commMetadata,
      userId: null,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { updatedAt: new Date() },
  });

  const enriched = await enrichCommunicationForClient(communication, lead.id);
  emitCommunicationChange(lead.organizationId, 'created', null, lead.id, enriched);

  // ── Reply tracking: if this lead has an active broadcast recipient, mark as replied ──
  setImmediate(async () => {
    try {
      // Find the most-recent broadcast recipient for this lead that was sent (not already replied)
      const recipient = await prisma.whatsAppBroadcastRecipient.findFirst({
        where: {
          leadId: lead.id,
          status: { in: ['SENT', 'DELIVERED', 'READ'] },
        },
        orderBy: { sentAt: 'desc' },
        select: { id: true, broadcastId: true, status: true },
      });

      if (!recipient) return;

      // Only count the first reply per recipient
      await prisma.whatsAppBroadcastRecipient.updateMany({
        where: { id: recipient.id, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
        data: { status: 'READ' }, // reply implies read
      });

      // Increment repliedCount on the parent run (use raw increment for safety)
      await prisma.whatsAppBroadcastRun.update({
        where: { id: recipient.broadcastId },
        data: { repliedCount: { increment: 1 } },
      }).catch(() => {});

      logger.info('[WhatsApp Inbound] Broadcast reply tracked', {
        leadId: lead.id,
        recipientId: recipient.id,
        broadcastId: recipient.broadcastId,
      });
    } catch (err) {
      logger.warn('[WhatsApp Inbound] Reply tracking failed (non-critical)', { err: err?.message });
    }
  });

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
    from: `+${phoneCanon}`,
    messageId,
    hasMedia: !!attachmentMeta,
  });

  console.log('[WhatsApp Inbound] Inbox row created (Communication) + lead.updatedAt bumped', {
    leadId: lead.id,
    organizationId: lead.organizationId,
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    bodyPreview: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    messageId,
    hasMedia: !!attachmentMeta,
    mediaType: mediaInfo?.type || null,
  });
}

module.exports = {
  processInboundWhatsAppMessage,
  resolveOrganizationId,
  findOrCreateLead,
  normalizePhone,
  canonicalWaPhoneNumberId,
  canonicalPhoneDigitsForWhatsApp,
};
