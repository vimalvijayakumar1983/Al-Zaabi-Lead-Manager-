const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Fetch lead data from Facebook Graph API using a leadgen_id.
 * Returns normalized lead fields.
 */
async function fetchLeadData(leadgenId, accessToken) {
  const url = `${GRAPH_API_BASE}/${leadgenId}?access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Facebook Graph API error: ${errMsg}`);
  }

  const data = await res.json();
  return data; // { id, created_time, field_data: [{ name, values }], ... }
}

/**
 * Parse Facebook Lead Ads field_data into a flat object.
 * Example field_data: [{ name: "full_name", values: ["John Doe"] }, ...]
 */
function parseFieldData(fieldData) {
  const fields = {};
  if (!Array.isArray(fieldData)) return fields;

  for (const field of fieldData) {
    const name = field.name?.toLowerCase();
    const value = field.values?.[0] || '';
    if (name && value) {
      fields[name] = value;
    }
  }

  return fields;
}

/**
 * Apply field mapping to convert Facebook field names to CRM field names.
 * fieldMapping: [{ source: 'full_name', target: 'firstName' }, ...]
 */
function applyFieldMapping(fbFields, fieldMapping) {
  const mapped = {};

  if (Array.isArray(fieldMapping) && fieldMapping.length > 0) {
    for (const mapping of fieldMapping) {
      const sourceKey = mapping.source?.toLowerCase();
      const targetKey = mapping.target;
      if (sourceKey && targetKey && fbFields[sourceKey] !== undefined) {
        mapped[targetKey] = fbFields[sourceKey];
      }
    }
  }

  // Default mapping if no custom mapping or missing essential fields
  if (!mapped.firstName && !mapped.lastName) {
    const fullName = fbFields.full_name || fbFields.name || '';
    if (fullName) {
      const parts = fullName.split(' ');
      mapped.firstName = mapped.firstName || parts[0] || 'Facebook';
      mapped.lastName = mapped.lastName || parts.slice(1).join(' ') || 'Lead';
    }
  }

  if (!mapped.email) {
    mapped.email = fbFields.email || fbFields.email_address || null;
  }

  if (!mapped.phone) {
    mapped.phone = fbFields.phone_number || fbFields.phone || fbFields.mobile_number || null;
  }

  if (!mapped.company) {
    mapped.company = fbFields.company_name || fbFields.company || null;
  }

  if (!mapped.jobTitle) {
    mapped.jobTitle = fbFields.job_title || fbFields.jobtitle || null;
  }

  if (!mapped.city) {
    mapped.city = fbFields.city || null;
  }

  return mapped;
}

/**
 * Find the Facebook integration for a given organization and optionally a page ID.
 */
async function findFacebookIntegration(organizationId, pageId) {
  const integrations = await prisma.integration.findMany({
    where: {
      organizationId,
      platform: 'facebook',
      status: 'connected',
    },
  });

  if (integrations.length === 0) return null;

  // If pageId provided, try to find one matching the page
  if (pageId) {
    const match = integrations.find((i) => i.config?.pageId === pageId);
    if (match) return match;
  }

  // Fallback to first connected Facebook integration
  return integrations[0];
}

/**
 * Validate a Facebook Page Access Token by calling the Graph API.
 */
async function validateAccessToken(accessToken) {
  try {
    const url = `${GRAPH_API_BASE}/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        valid: false,
        message: errBody?.error?.message || `Token validation failed (HTTP ${res.status})`,
      };
    }
    const data = await res.json();
    return {
      valid: true,
      pageId: data.id,
      pageName: data.name,
      message: `Connected to Facebook page: ${data.name} (${data.id})`,
    };
  } catch (err) {
    return { valid: false, message: `Connection error: ${err.message}` };
  }
}

/**
 * Subscribe a Facebook Page to leadgen webhooks.
 */
async function subscribeToLeadgen(pageId, accessToken) {
  try {
    const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        message: errBody?.error?.message || `Subscription failed (HTTP ${res.status})`,
      };
    }
    const data = await res.json();
    return { success: data.success === true, message: 'Page subscribed to leadgen events' };
  } catch (err) {
    return { success: false, message: `Subscription error: ${err.message}` };
  }
}

/**
 * Verify the Facebook webhook signature using the app secret.
 */
function verifyWebhookSignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false;

  const crypto = require('crypto');
  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  return signature === `sha256=${expectedSig}`;
}

module.exports = {
  fetchLeadData,
  parseFieldData,
  applyFieldMapping,
  findFacebookIntegration,
  validateAccessToken,
  subscribeToLeadgen,
  verifyWebhookSignature,
  GRAPH_API_BASE,
};
