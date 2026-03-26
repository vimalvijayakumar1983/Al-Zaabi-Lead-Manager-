const { prisma } = require('../config/database');

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
      select: { id: true, filename: true, url: true },
    });
    const attByFilename = {};
    for (const a of leadAttachments) {
      attByFilename[a.filename] = a;
    }
    meta.attachments = meta.attachments.map((att) => {
      if (att.id) return { ...att, url: `/inbox/attachments/file/${att.id}` };
      const match = attByFilename[att.filename];
      if (match) return { ...att, id: match.id, url: `/inbox/attachments/file/${match.id}` };
      return att;
    });
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
