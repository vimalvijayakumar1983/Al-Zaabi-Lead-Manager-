const crypto = require('crypto');
const { Router } = require('express');
const { prisma } = require('../config/database');

const router = Router();
const ERP_PROVIDERS = ['facts', 'focus', 'cortex', 'uniqorn'];
const RESERVED_ERP_TABLE_SLUGS = new Set(['create-customer', 'customer-sales', 'doctor-availability']);
const ERP_CUSTOM_TABLE_SLUG_RE = /^[a-z][a-z0-9_]{1,50}$/;

/** Canonical CRM targets for create-customer (config.erpFieldMapping.customer maps target -> ERP payload key). */
const ERP_CUSTOMER_MAP_TARGETS = new Set([
  'externalCustomerId',
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
]);

/** Canonical targets for customer-sales payload resolution. */
const ERP_SALE_MAP_TARGETS = new Set(['externalSaleId', 'externalCustomerId', 'customerId']);

/** Canonical targets for doctor-availability payload resolution. */
const ERP_AVAILABILITY_MAP_TARGETS = new Set([
  'externalAvailabilityId',
  'availabilityId',
  'doctorId',
  'providerId',
  'id',
]);

/** Allowed custom target keys for erpFieldMappingCustom (not canonical/reserved names). */
const ERP_CUSTOM_MAP_TARGET_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

function getBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim();
}

function getInboundToken(req) {
  return req.header('x-erp-token') || getBearerToken(req.header('authorization')) || null;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function splitName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return { firstName: 'Unknown', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0] || 'Unknown', lastName: parts.slice(1).join(' ') };
}

function buildStableExternalId(prefix, payload) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload || {}))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${digest}`;
}

/**
 * Normalize config.erpFieldMapping: only string values, only allowed targets per section.
 * Shape: { customer: { email: "erp_key" }, sale: {...}, doctor_availability: {...} }
 */
function sanitizeErpFieldMapping(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const sections = [
    ['customer', ERP_CUSTOMER_MAP_TARGETS],
    ['sale', ERP_SALE_MAP_TARGETS],
    ['doctor_availability', ERP_AVAILABILITY_MAP_TARGETS],
  ];
  for (const [section, allowed] of sections) {
    const src = raw[section];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const cleaned = {};
    for (const [crmTarget, erpKey] of Object.entries(src)) {
      if (!allowed.has(crmTarget)) {
        console.warn(`[erp] Ignoring unknown erpFieldMapping.${section} target: ${crmTarget}`);
        continue;
      }
      if (typeof erpKey !== 'string' || !erpKey.trim()) {
        console.warn(`[erp] Ignoring invalid erpFieldMapping.${section}.${crmTarget} (non-string key)`);
        continue;
      }
      cleaned[crmTarget] = erpKey.trim();
    }
    if (Object.keys(cleaned).length) out[section] = cleaned;
  }
  return out;
}

/**
 * Normalize config.erpFieldMappingCustom: arbitrary safe target keys -> ERP payload key.
 * Reserved canonical names per section are rejected (use erpFieldMapping instead).
 */
function sanitizeErpFieldMappingCustom(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const reservedBySection = {
    customer: ERP_CUSTOMER_MAP_TARGETS,
    sale: ERP_SALE_MAP_TARGETS,
    doctor_availability: ERP_AVAILABILITY_MAP_TARGETS,
  };
  const sectionNames = ['customer', 'sale', 'doctor_availability'];
  const out = {};
  for (const section of sectionNames) {
    const src = raw[section];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const cleaned = {};
    for (const [targetKey, erpKey] of Object.entries(src)) {
      if (typeof targetKey !== 'string' || !ERP_CUSTOM_MAP_TARGET_RE.test(targetKey.trim())) {
        console.warn(`[erp] Ignoring invalid erpFieldMappingCustom.${section} target: ${String(targetKey)}`);
        continue;
      }
      const tk = targetKey.trim();
      if (reservedBySection[section].has(tk)) {
        console.warn(
          `[erp] Ignoring erpFieldMappingCustom.${section}.${tk} — reserved; use erpFieldMapping for canonical fields`
        );
        continue;
      }
      if (typeof erpKey !== 'string' || !erpKey.trim()) {
        console.warn(`[erp] Ignoring invalid erpFieldMappingCustom.${section}.${tk} (empty ERP key)`);
        continue;
      }
      cleaned[tk] = erpKey.trim();
    }
    if (Object.keys(cleaned).length) out[section] = cleaned;
  }
  return out;
}

/**
 * Apply customer-only custom mappings: copy payload[erpKey] into mappedFields[targetKey].
 * Skips ERP keys already consumed by canonical resolution.
 */
function resolveCustomerCustomMappedFields(payload, customCustomerMap, usedKeys) {
  const mappedFields = {};
  if (!customCustomerMap || typeof customCustomerMap !== 'object') return mappedFields;
  for (const [targetKey, erpKey] of Object.entries(customCustomerMap)) {
    if (usedKeys.has(erpKey)) {
      console.warn(
        `[erp] Skipping custom mapped field "${targetKey}"; ERP key "${erpKey}" already used by canonical mapping`
      );
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(payload, erpKey)) continue;
    const v = payload[erpKey];
    if (v === undefined || v === null) continue;
    usedKeys.add(erpKey);
    mappedFields[targetKey] = v;
  }
  return mappedFields;
}

function getPayloadValue(payload, key) {
  if (!key || !payload || typeof payload !== 'object') return undefined;
  const v = payload[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/**
 * Resolve one logical field: mapped ERP key first, then alias keys on payload.
 * Records which payload key produced the value in usedKeys.
 */
function resolveMappedField(payload, sectionMap, fieldName, aliasKeys, usedKeys) {
  const mappedKey = sectionMap && sectionMap[fieldName];
  if (mappedKey) {
    const v = getPayloadValue(payload, mappedKey);
    if (v) {
      usedKeys.add(mappedKey);
      return v;
    }
  }
  for (const k of aliasKeys) {
    const v = getPayloadValue(payload, k);
    if (v) {
      usedKeys.add(k);
      return v;
    }
  }
  return null;
}

/**
 * Top-level keys not used to populate core fields — stored on contact.customData.erp.extra.
 * If config.erpExtraFieldKeys is a non-empty string array, only those keys (when present) are copied to extra; otherwise all unused top-level keys.
 */
function buildExtraPayload(payload, usedKeys, explicitExtraKeys) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const keys = Object.keys(payload);
  const allowList =
    Array.isArray(explicitExtraKeys) && explicitExtraKeys.length
      ? new Set(explicitExtraKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()))
      : null;
  const extra = {};
  for (const k of keys) {
    if (usedKeys.has(k)) continue;
    if (allowList && !allowList.has(k)) continue;
    extra[k] = payload[k];
  }
  return extra;
}

/**
 * Parse inbound create-customer body using erpFieldMapping.customer + default aliases.
 */
function parseCustomerInbound(integrationConfig, payload) {
  const mapping = sanitizeErpFieldMapping(integrationConfig?.erpFieldMapping);
  const customerMap = mapping.customer || {};
  const usedKeys = new Set();

  const externalCustomerId = resolveMappedField(payload, customerMap, 'externalCustomerId', [
    'externalCustomerId',
    'customerId',
    'id',
    'code',
  ], usedKeys);

  const email = resolveMappedField(payload, customerMap, 'email', ['email', 'customerEmail'], usedKeys);
  const phone = resolveMappedField(payload, customerMap, 'phone', ['phone', 'mobile', 'customerPhone'], usedKeys);

  const mappedFull = resolveMappedField(payload, customerMap, 'fullName', ['name', 'fullName', 'customerName'], usedKeys);
  const firstMapped = resolveMappedField(payload, customerMap, 'firstName', ['firstName'], usedKeys);
  const lastMapped = resolveMappedField(payload, customerMap, 'lastName', ['lastName'], usedKeys);

  let firstName = firstMapped;
  let lastName = lastMapped;
  if (mappedFull) {
    const names = splitName(mappedFull);
    if (!firstName) firstName = names.firstName;
    if (!lastName) lastName = names.lastName;
  }

  const company = resolveMappedField(payload, customerMap, 'company', ['company', 'companyName'], usedKeys);

  const customAll = sanitizeErpFieldMappingCustom(integrationConfig?.erpFieldMappingCustom);
  const customCustomerMap = customAll.customer || {};
  const mappedFields = resolveCustomerCustomMappedFields(payload, customCustomerMap, usedKeys);

  const explicitExtra = integrationConfig?.erpExtraFieldKeys;
  const extra = buildExtraPayload(payload, usedKeys, explicitExtra);

  return {
    externalCustomerId,
    email,
    phone,
    firstName,
    lastName,
    company,
    usedKeys,
    extra,
    mappedFields,
  };
}

function parseSaleInbound(integrationConfig, payload) {
  const mapping = sanitizeErpFieldMapping(integrationConfig?.erpFieldMapping);
  const saleMap = mapping.sale || {};
  const usedKeys = new Set();

  let externalSaleId = resolveMappedField(payload, saleMap, 'externalSaleId', [
    'externalSaleId',
    'saleId',
    'salesId',
    'id',
  ], usedKeys);

  if (!externalSaleId) {
    externalSaleId = buildStableExternalId('sale', payload);
  }

  const externalCustomerId = resolveMappedField(payload, saleMap, 'externalCustomerId', ['externalCustomerId'], usedKeys);
  const customerId = resolveMappedField(payload, saleMap, 'customerId', ['customerId'], usedKeys);

  return { externalSaleId, externalCustomerId, customerId, usedKeys };
}

function parseAvailabilityInbound(integrationConfig, payload) {
  const mapping = sanitizeErpFieldMapping(integrationConfig?.erpFieldMapping);
  const avMap = mapping.doctor_availability || {};
  const usedKeys = new Set();

  let externalAvailabilityId = resolveMappedField(payload, avMap, 'externalAvailabilityId', [
    'externalAvailabilityId',
    'availabilityId',
    'doctorId',
    'id',
  ], usedKeys);

  if (!externalAvailabilityId) {
    externalAvailabilityId = buildStableExternalId('availability', payload);
  }

  const doctorId = resolveMappedField(payload, avMap, 'doctorId', ['doctorId'], usedKeys);
  const providerId = resolveMappedField(payload, avMap, 'providerId', ['providerId'], usedKeys);

  return { externalAvailabilityId, doctorId, providerId, usedKeys };
}

function parseErpCustomTables(config) {
  const src = config?.erpCustomTables;
  if (!Array.isArray(src)) return [];
  const cleaned = [];
  for (const row of src) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const slug = String(row.slug || '').trim().toLowerCase();
    if (!ERP_CUSTOM_TABLE_SLUG_RE.test(slug)) continue;
    if (RESERVED_ERP_TABLE_SLUGS.has(slug)) continue;
    const label = String(row.label || slug).trim();
    const externalIdKeys = Array.isArray(row.externalIdKeys)
      ? row.externalIdKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim())
      : [];
    cleaned.push({
      slug,
      label: label || slug,
      externalIdKeys,
      fieldMapping: row.fieldMapping && typeof row.fieldMapping === 'object' ? row.fieldMapping : {},
      fieldMappingCustom: row.fieldMappingCustom && typeof row.fieldMappingCustom === 'object' ? row.fieldMappingCustom : {},
    });
  }
  return cleaned;
}

function getErpModels(db) {
  return {
    erpExternalRef: db.erpExternalRef || db.erpExternalRefs || null,
    erpSyncState: db.erpSyncState || db.erpSyncStates || null,
  };
}

async function findErpIntegration(organizationId, divisionId) {
  const list = await prisma.integration.findMany({
    where: { organizationId, platform: 'erp', status: { not: 'disconnected' } },
    select: { id: true, organizationId: true, config: true, credentials: true },
    orderBy: { createdAt: 'desc' },
  });

  return list.find((row) => String(row?.config?.divisionId || '') === String(divisionId)) || null;
}

async function auditInboundRequest(integrationId, organizationId, action, reqBody, responsePayload, statusCode, errorMessage) {
  try {
    await prisma.erpRequestAudit.create({
      data: {
        integrationId,
        organizationId,
        action,
        requestPayload: reqBody || {},
        responsePayload: responsePayload || {},
        statusCode,
        retryable: statusCode >= 500,
        errorMessage: errorMessage || null,
      },
    });
  } catch (_) {}
}

async function logIntegrationEvent(integrationId, action, status, payload, errorMessage) {
  try {
    await prisma.integrationLog.create({
      data: {
        integrationId,
        action,
        status,
        payload: payload || {},
        errorMessage: errorMessage || null,
      },
    });
  } catch (_) {}
}

async function verifyInboundAuth(req, res, action) {
  const { organizationId, divisionId } = req.params;
  const integration = await findErpIntegration(organizationId, divisionId);
  if (!integration) {
    const body = { error: 'ERP integration not found for this organization/division' };
    await auditInboundRequest(null, organizationId, action, req.body, body, 404, body.error);
    res.status(404).json(body);
    return null;
  }

  const provider = String(integration?.config?.erpProvider || '').toLowerCase();
  if (!ERP_PROVIDERS.includes(provider)) {
    const body = { error: 'ERP provider configuration is invalid' };
    await auditInboundRequest(integration.id, organizationId, action, req.body, body, 400, body.error);
    res.status(400).json(body);
    return null;
  }

  const expectedToken = integration?.credentials?.token || integration?.config?.token;
  const inboundToken = getInboundToken(req);
  if (!expectedToken || !inboundToken || String(expectedToken) !== String(inboundToken)) {
    const body = { error: 'Invalid ERP token' };
    await auditInboundRequest(integration.id, organizationId, action, req.body, body, 401, body.error);
    res.status(401).json(body);
    return null;
  }

  return { integration, provider };
}

router.post('/erp/:organizationId/:divisionId/create-customer', async (req, res) => {
  const auth = await verifyInboundAuth(req, res, 'erp_create_customer');
  if (!auth) return;

  const { integration, provider } = auth;
  const { organizationId } = req.params;
  const payload = req.body || {};
  const cfg = integration.config && typeof integration.config === 'object' ? integration.config : {};
  const parsed = parseCustomerInbound(cfg, payload);
  const { externalCustomerId, email, phone, firstName: fnRaw, lastName: lnRaw, company, extra, mappedFields } = parsed;

  if (!externalCustomerId) {
    const body = { error: 'externalCustomerId (or customerId/id/code) is required' };
    await auditInboundRequest(integration.id, organizationId, 'erp_create_customer', payload, body, 400, body.error);
    return res.status(400).json(body);
  }

  const firstName = fnRaw || 'Unknown';
  const lastName = lnRaw || '';

  try {
    const contact = await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);
      let matchedContact = null;
      if (erpExternalRefModel) {
        const existingRef = await erpExternalRefModel.findUnique({
          where: {
            integrationId_entityType_externalId: {
              integrationId: integration.id,
              entityType: 'customer',
              externalId: externalCustomerId,
            },
          },
        });
        if (existingRef?.crmEntityId) {
          matchedContact = await tx.contact.findFirst({ where: { id: existingRef.crmEntityId, organizationId } });
        }
      }

      // Fallback idempotency when ERP ref tables are unavailable or missing records:
      // find contact by stored externalCustomerId in customData JSON.
      if (!matchedContact) {
        matchedContact = await tx.contact.findFirst({
          where: {
            organizationId,
            customData: {
              path: ['erp', 'externalCustomerId'],
              equals: externalCustomerId,
            },
          },
          orderBy: { createdAt: 'asc' },
        });
      }

      if (!matchedContact && (email || phone)) {
        matchedContact = await tx.contact.findFirst({
          where: { organizationId, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }, { mobile: phone }] : [])] },
          orderBy: { createdAt: 'asc' },
        });
      }

      const prevCustom =
        matchedContact?.customData && typeof matchedContact.customData === 'object' && !Array.isArray(matchedContact.customData)
          ? { ...matchedContact.customData }
          : {};
      const prevErp =
        typeof prevCustom.erp === 'object' && prevCustom.erp && !Array.isArray(prevCustom.erp) ? prevCustom.erp : {};
      const prevMappedFields =
        prevErp.mappedFields && typeof prevErp.mappedFields === 'object' && !Array.isArray(prevErp.mappedFields)
          ? { ...prevErp.mappedFields }
          : {};
      const mergedMappedFields =
        mappedFields && typeof mappedFields === 'object' && Object.keys(mappedFields).length > 0
          ? { ...prevMappedFields, ...mappedFields }
          : prevMappedFields;

      const erpBlock = {
        ...prevErp,
        provider,
        externalCustomerId,
        lastInboundAction: 'create-customer',
      };
      if (Object.keys(mergedMappedFields).length > 0) {
        erpBlock.mappedFields = mergedMappedFields;
      } else {
        delete erpBlock.mappedFields;
      }
      if (extra && typeof extra === 'object' && Object.keys(extra).length > 0) {
        erpBlock.extra = extra;
      }

      const contactData = {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        mobile: phone || null,
        company: company || null,
        source: 'API',
        lifecycle: 'CUSTOMER',
        type: 'CUSTOMER',
        customData: { ...prevCustom, erp: erpBlock },
        organizationId,
      };

      let saved;
      if (matchedContact) {
        saved = await tx.contact.update({ where: { id: matchedContact.id }, data: contactData });
      } else {
        // Some deployments have DB-level NOT NULL for createdById despite optional Prisma schema.
        // Use an active org user as system creator/owner for ERP-created contacts.
        const creator = await tx.user.findFirst({
          where: { organizationId, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!creator?.id) {
          throw new Error('No active user found in this division to assign ERP-created contact.');
        }
        saved = await tx.contact.create({
          data: {
            ...contactData,
            createdById: creator.id,
            ownerId: creator.id,
          },
        });
      }

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType: 'customer', externalId: externalCustomerId } },
          update: { crmEntityId: saved.id, externalPayload: payload, organizationId },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType: 'customer',
            crmEntityId: saved.id,
            externalId: externalCustomerId,
            externalPayload: payload,
          },
        });
      }

      if (erpSyncStateModel) {
        await erpSyncStateModel.upsert({
          where: { organizationId_integrationId_entityType: { organizationId, integrationId: integration.id, entityType: 'customer' } },
          update: { lastSyncedAt: new Date(), status: 'success', lastError: null },
          create: { organizationId, integrationId: integration.id, entityType: 'customer', status: 'success', lastSyncedAt: new Date() },
        });
      }

      return saved;
    });

    const body = { success: true, contactId: contact.id, externalCustomerId };
    await logIntegrationEvent(integration.id, 'erp_create_customer', 'success', payload, null);
    await auditInboundRequest(integration.id, organizationId, 'erp_create_customer', payload, body, 200, null);
    return res.status(200).json(body);
  } catch (err) {
    const message = err?.message || 'Failed to process create-customer request';
    const body = { error: message };
    await logIntegrationEvent(integration.id, 'erp_create_customer', 'error', payload, message);
    await auditInboundRequest(integration.id, organizationId, 'erp_create_customer', payload, body, 500, message);
    return res.status(500).json(body);
  }
});

router.post('/erp/:organizationId/:divisionId/customer-sales', async (req, res) => {
  const auth = await verifyInboundAuth(req, res, 'erp_customer_sales');
  if (!auth) return;
  const { integration } = auth;
  const { organizationId } = req.params;
  const payload = req.body || {};
  const cfg = integration.config && typeof integration.config === 'object' ? integration.config : {};
  const saleParsed = parseSaleInbound(cfg, payload);
  const { externalSaleId } = saleParsed;
  const crmCustomerRef = pickFirstNonEmpty(saleParsed.externalCustomerId, saleParsed.customerId) || 'N/A';

  try {
    await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType: 'sale', externalId: externalSaleId } },
          update: {
            crmEntityId: crmCustomerRef,
            externalPayload: payload,
            organizationId,
          },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType: 'sale',
            crmEntityId: crmCustomerRef,
            externalId: externalSaleId,
            externalPayload: payload,
          },
        });
      }

      if (erpSyncStateModel) {
        await erpSyncStateModel.upsert({
          where: { organizationId_integrationId_entityType: { organizationId, integrationId: integration.id, entityType: 'sale' } },
          update: { lastSyncedAt: new Date(), status: 'success', lastError: null },
          create: { organizationId, integrationId: integration.id, entityType: 'sale', status: 'success', lastSyncedAt: new Date() },
        });
      }
    });

    const body = { success: true, externalSaleId };
    await logIntegrationEvent(integration.id, 'erp_customer_sales', 'success', payload, null);
    await auditInboundRequest(integration.id, organizationId, 'erp_customer_sales', payload, body, 200, null);
    return res.status(200).json(body);
  } catch (err) {
    const message = err?.message || 'Failed to process customer-sales request';
    const body = { error: message };
    await logIntegrationEvent(integration.id, 'erp_customer_sales', 'error', payload, message);
    await auditInboundRequest(integration.id, organizationId, 'erp_customer_sales', payload, body, 500, message);
    return res.status(500).json(body);
  }
});

router.post('/erp/:organizationId/:divisionId/doctor-availability', async (req, res) => {
  const auth = await verifyInboundAuth(req, res, 'erp_doctor_availability');
  if (!auth) return;
  const { integration, provider } = auth;
  const { organizationId } = req.params;
  const payload = req.body || {};

  if (provider !== 'cortex') {
    const body = { error: 'doctor-availability API is only enabled for CORTEX ERP' };
    await logIntegrationEvent(integration.id, 'erp_doctor_availability', 'error', payload, body.error);
    await auditInboundRequest(integration.id, organizationId, 'erp_doctor_availability', payload, body, 400, body.error);
    return res.status(400).json(body);
  }

  const cfg = integration.config && typeof integration.config === 'object' ? integration.config : {};
  const avParsed = parseAvailabilityInbound(cfg, payload);
  const { externalAvailabilityId } = avParsed;
  const crmDoctorRef = pickFirstNonEmpty(avParsed.doctorId, avParsed.providerId) || 'N/A';

  try {
    await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType: 'doctor_availability', externalId: externalAvailabilityId } },
          update: {
            crmEntityId: crmDoctorRef,
            externalPayload: payload,
            organizationId,
          },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType: 'doctor_availability',
            crmEntityId: crmDoctorRef,
            externalId: externalAvailabilityId,
            externalPayload: payload,
          },
        });
      }

      if (erpSyncStateModel) {
        await erpSyncStateModel.upsert({
          where: { organizationId_integrationId_entityType: { organizationId, integrationId: integration.id, entityType: 'doctor_availability' } },
          update: { lastSyncedAt: new Date(), status: 'success', lastError: null },
          create: {
            organizationId,
            integrationId: integration.id,
            entityType: 'doctor_availability',
            status: 'success',
            lastSyncedAt: new Date(),
          },
        });
      }
    });

    const body = { success: true, externalAvailabilityId };
    await logIntegrationEvent(integration.id, 'erp_doctor_availability', 'success', payload, null);
    await auditInboundRequest(integration.id, organizationId, 'erp_doctor_availability', payload, body, 200, null);
    return res.status(200).json(body);
  } catch (err) {
    const message = err?.message || 'Failed to process doctor-availability request';
    const body = { error: message };
    await logIntegrationEvent(integration.id, 'erp_doctor_availability', 'error', payload, message);
    await auditInboundRequest(integration.id, organizationId, 'erp_doctor_availability', payload, body, 500, message);
    return res.status(500).json(body);
  }
});

router.post('/erp/:organizationId/:divisionId/:tableSlug', async (req, res) => {
  const auth = await verifyInboundAuth(req, res, 'erp_custom_table');
  if (!auth) return;

  const { integration } = auth;
  const { organizationId } = req.params;
  const payload = req.body || {};
  const tableSlug = String(req.params.tableSlug || '').trim().toLowerCase();

  if (RESERVED_ERP_TABLE_SLUGS.has(tableSlug)) {
    const body = { error: `"${tableSlug}" is a reserved ERP endpoint` };
    await auditInboundRequest(integration.id, organizationId, `erp_custom_${tableSlug}`, payload, body, 400, body.error);
    return res.status(400).json(body);
  }
  if (!ERP_CUSTOM_TABLE_SLUG_RE.test(tableSlug)) {
    const body = { error: 'Invalid custom table slug' };
    await auditInboundRequest(integration.id, organizationId, 'erp_custom_table', payload, body, 400, body.error);
    return res.status(400).json(body);
  }

  const cfg = integration.config && typeof integration.config === 'object' ? integration.config : {};
  const customTables = parseErpCustomTables(cfg);
  const tableDef = customTables.find((t) => t.slug === tableSlug);
  if (!tableDef) {
    const body = { error: `Custom ERP table "${tableSlug}" is not configured` };
    await auditInboundRequest(integration.id, organizationId, `erp_custom_${tableSlug}`, payload, body, 404, body.error);
    return res.status(404).json(body);
  }

  const externalId =
    pickFirstNonEmpty(...tableDef.externalIdKeys.map((k) => getPayloadValue(payload, k))) ||
    buildStableExternalId(`custom_${tableSlug}`, payload);
  const entityType = `custom_${tableSlug}`;
  const action = `erp_custom_${tableSlug}`;

  try {
    await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType, externalId } },
          update: {
            crmEntityId: 'N/A',
            externalPayload: payload,
            organizationId,
          },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType,
            crmEntityId: 'N/A',
            externalId,
            externalPayload: payload,
          },
        });
      }

      if (erpSyncStateModel) {
        await erpSyncStateModel.upsert({
          where: { organizationId_integrationId_entityType: { organizationId, integrationId: integration.id, entityType } },
          update: { lastSyncedAt: new Date(), status: 'success', lastError: null },
          create: { organizationId, integrationId: integration.id, entityType, status: 'success', lastSyncedAt: new Date() },
        });
      }
    });

    const body = { success: true, tableSlug, entityType, externalId };
    await logIntegrationEvent(integration.id, action, 'success', payload, null);
    await auditInboundRequest(integration.id, organizationId, action, payload, body, 200, null);
    return res.status(200).json(body);
  } catch (err) {
    const message = err?.message || `Failed to process ${tableSlug} request`;
    const body = { error: message };
    await logIntegrationEvent(integration.id, action, 'error', payload, message);
    await auditInboundRequest(integration.id, organizationId, action, payload, body, 500, message);
    return res.status(500).json(body);
  }
});

module.exports = router;
