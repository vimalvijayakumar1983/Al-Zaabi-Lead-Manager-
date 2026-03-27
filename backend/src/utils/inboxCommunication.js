const { prisma } = require('../config/database');
const { getInboxAttachmentReadUrl, isAttachmentObjectStorageEnabled } = require('../services/attachmentStorage');

const PLATFORM_MAP = {
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', icon: 'whatsapp' },
  EMAIL: { label: 'Email', color: '#EA4335', icon: 'email' },
  SMS: { label: 'SMS', color: '#6366f1', icon: 'sms' },
  PHONE: { label: 'Phone', color: '#06b6d4', icon: 'phone' },
  CHAT: { label: 'Live Chat', color: '#3b82f6', icon: 'chat' },
  FACEBOOK: { label: 'Facebook', color: '#1877F2', icon: 'facebook' },
  INSTAGRAM: { label: 'Instagram', color: '#E4405F', icon: 'instagram' },
  GOOGLE: { label: 'Google', color: '#4285F4', icon: 'google' },
  WEBCHAT: { label: 'Website Chat', color: '#8b5cf6', icon: 'webchat' },
};

function resolvePlatform(comm) {
  if (comm.channel === 'CHAT' && comm.metadata?.platform) {
    return comm.metadata.platform.toUpperCase();
  }
  return comm.channel;
}

/**
 * Same enrichment as GET /inbox/conversations/:leadId/messages (platform + attachment URLs).
 */
async function enrichCommunicationForClient(comm, leadId) {
  const meta = { ...(comm.metadata || {}) };
  if (meta.attachments && Array.isArray(meta.attachments)) {
    const leadAttachments = await prisma.attachment.findMany({
      where: { leadId },
      select: { id: true, filename: true, url: true, storageKey: true },
    });
    const attById = {};
    const attByFilename = {};
    for (const a of leadAttachments) {
      attById[a.id] = a;
      attByFilename[a.filename] = a;
    }

    const useS3 = isAttachmentObjectStorageEnabled();

    // Resolve presigned URL for an attachment record (falls back to proxy route)
    const resolveUrl = async (record) => {
      if (!record) return null;
      if (useS3 && record.storageKey) {
        const signed = await getInboxAttachmentReadUrl(record.storageKey);
        if (signed) return signed;
      }
      return `/inbox/attachments/file/${record.id}`;
    };

    const enriched = [];
    for (const att of meta.attachments) {
      const record = att.id ? attById[att.id] : attByFilename[att.filename];
      if (record) {
        const url = await resolveUrl(record);
        enriched.push({ ...att, id: record.id, url });
      } else if (att.id) {
        enriched.push({ ...att, url: `/inbox/attachments/file/${att.id}` });
      } else {
        enriched.push(att);
      }
    }
    meta.attachments = enriched;
  }

  const platform = resolvePlatform(comm);
  return {
    ...comm,
    metadata: meta,
    platform,
    platformInfo: PLATFORM_MAP[platform] || PLATFORM_MAP.CHAT,
  };
}

module.exports = {
  PLATFORM_MAP,
  resolvePlatform,
  enrichCommunicationForClient,
};
