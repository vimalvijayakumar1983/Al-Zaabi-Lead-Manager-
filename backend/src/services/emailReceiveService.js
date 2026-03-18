const { ImapFlow } = require('imapflow');
const Pop3Command = require('node-pop3');
const { simpleParser } = require('mailparser');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');

/**
 * Get incoming email (IMAP/POP) configuration for an organization.
 */
const getIncomingEmailConfig = async (organizationId) => {
  if (!organizationId) return null;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = typeof org?.settings === 'object' ? org.settings : {};
    return settings.incomingEmailConfig || null;
  } catch (err) {
    logger.warn('Failed to load incoming email config:', err.message);
    return null;
  }
};

/**
 * Test IMAP connection with given config.
 */
const testImapConnection = async (config) => {
  const security = config.imapSecurity || 'ssl';
  const client = new ImapFlow({
    host: config.imapHost,
    port: parseInt(config.imapPort, 10) || 993,
    secure: security === 'ssl',
    auth: {
      user: config.imapUser,
      pass: config.imapPass,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
      ...(security === 'starttls' ? { servername: config.imapHost } : {}),
    },
  });

  try {
    await client.connect();
    const mailboxes = [];
    const tree = await client.listTree();
    const flatten = (folders) => {
      for (const f of folders) {
        mailboxes.push(f.path);
        if (f.folders?.length) flatten(f.folders);
      }
    };
    flatten(tree.folders || []);
    await client.logout();
    return { success: true, message: 'IMAP connection successful', mailboxes };
  } catch (err) {
    try { await client.logout(); } catch (_) { /* ignore */ }
    let message = err.message || 'Unknown IMAP error';
    if (message.includes('self signed') || message.includes('certificate')) {
      message = 'TLS certificate error – the server may use a self-signed certificate. ' + message;
    } else if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) {
      message = 'Authentication failed – please check your username and password.';
    } else if (message.includes('ECONNREFUSED')) {
      message = `Connection refused – unable to reach ${config.imapHost}:${config.imapPort}. Check the host and port.`;
    } else if (message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) {
      message = `Cannot reach ${config.imapHost} – check the hostname and your network connection.`;
    }
    return { success: false, message };
  }
};

/**
 * Test POP3 connection with given config.
 */
const testPop3Connection = async (config) => {
  const pop3 = new Pop3Command({
    host: config.popHost,
    port: parseInt(config.popPort, 10) || 995,
    tls: config.popSecurity !== 'none',
    user: config.popUser,
    password: config.popPass,
    tlsOptions: config.popSecurity === 'starttls'
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    // STAT returns count and size
    const stat = await pop3.STAT();
    await pop3.QUIT();
    return {
      success: true,
      message: `POP3 connection successful. ${stat.split(' ')[0] || 0} messages on server.`,
    };
  } catch (err) {
    try { await pop3.QUIT(); } catch (_) { /* ignore */ }
    return { success: false, message: err.message };
  }
};

/**
 * Fetch emails via IMAP.
 * Returns array of parsed email objects.
 */
const fetchImapEmails = async (config, options = {}) => {
  const {
    folder = 'INBOX',
    limit = 20,
    since = null,
    markAsRead = false,
  } = options;

  const security = config.imapSecurity || 'ssl';
  const client = new ImapFlow({
    host: config.imapHost,
    port: parseInt(config.imapPort, 10) || 993,
    secure: security === 'ssl',
    auth: {
      user: config.imapUser,
      pass: config.imapPass,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
      ...(security === 'starttls' ? { servername: config.imapHost } : {}),
    },
  });

  const emails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      // Build search criteria
      const searchCriteria = { seen: false };
      if (since) {
        searchCriteria.since = new Date(since);
      }

      // Search for messages
      const uids = [];
      for await (const msg of client.fetch(
        { seen: false },
        { source: true, uid: true, flags: true, envelope: true },
        { uid: true }
      )) {
        const parsed = await simpleParser(msg.source);
        emails.push({
          uid: msg.uid,
          messageId: parsed.messageId,
          from: parsed.from?.value || [],
          to: parsed.to?.value || [],
          cc: parsed.cc?.value || [],
          subject: parsed.subject || '(No Subject)',
          date: parsed.date || new Date(),
          text: parsed.text || '',
          html: parsed.html || '',
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
          flags: msg.flags ? [...msg.flags] : [],
        });

        if (markAsRead) {
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
        }

        if (emails.length >= limit) break;
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    logger.error('IMAP fetch failed:', err);
    try { await client.logout(); } catch (_) { /* ignore */ }
    throw err;
  }

  return emails;
};

/**
 * Fetch emails via POP3.
 * Returns array of parsed email objects.
 */
const fetchPop3Emails = async (config, options = {}) => {
  const { limit = 20, deleteAfterFetch = false } = options;

  const pop3 = new Pop3Command({
    host: config.popHost,
    port: parseInt(config.popPort, 10) || 995,
    tls: config.popSecurity !== 'none',
    user: config.popUser,
    password: config.popPass,
    tlsOptions: config.popSecurity === 'starttls'
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const emails = [];

  try {
    const list = await pop3.LIST();
    const messageIds = Array.isArray(list) ? list : [];
    const fetchCount = Math.min(messageIds.length, limit);

    // Fetch most recent messages first (highest ID = most recent)
    for (let i = messageIds.length; i > messageIds.length - fetchCount && i > 0; i--) {
      const msgNum = Array.isArray(messageIds[i - 1])
        ? messageIds[i - 1][0]
        : String(i);

      const raw = await pop3.RETR(msgNum);
      const parsed = await simpleParser(raw);

      emails.push({
        messageNum: msgNum,
        messageId: parsed.messageId,
        from: parsed.from?.value || [],
        to: parsed.to?.value || [],
        cc: parsed.cc?.value || [],
        subject: parsed.subject || '(No Subject)',
        date: parsed.date || new Date(),
        text: parsed.text || '',
        html: parsed.html || '',
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
      });

      if (deleteAfterFetch) {
        await pop3.DELE(msgNum);
      }
    }

    await pop3.QUIT();
  } catch (err) {
    logger.error('POP3 fetch failed:', err);
    try { await pop3.QUIT(); } catch (_) { /* ignore */ }
    throw err;
  }

  return emails;
};

/**
 * Fetch emails using the organization's configured protocol (IMAP or POP3).
 */
const fetchEmails = async (organizationId, options = {}) => {
  const config = await getIncomingEmailConfig(organizationId);
  if (!config || !config.protocol) {
    return { success: false, error: 'Incoming email not configured' };
  }

  try {
    let emails;
    if (config.protocol === 'imap') {
      emails = await fetchImapEmails(config, options);
    } else if (config.protocol === 'pop3') {
      emails = await fetchPop3Emails(config, options);
    } else {
      return { success: false, error: `Unknown protocol: ${config.protocol}` };
    }

    return { success: true, emails, count: emails.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = {
  getIncomingEmailConfig,
  testImapConnection,
  testPop3Connection,
  fetchImapEmails,
  fetchPop3Emails,
  fetchEmails,
};
