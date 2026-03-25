const crypto = require('crypto');
const { Router } = require('express');
const { prisma } = require('../config/database');

const router = Router();
const ERP_PROVIDERS = ['facts', 'focus', 'cortex', 'uniqorn'];

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
  const externalCustomerId = pickFirstNonEmpty(payload.externalCustomerId, payload.customerId, payload.id, payload.code);
  if (!externalCustomerId) {
    const body = { error: 'externalCustomerId (or customerId/id/code) is required' };
    await auditInboundRequest(integration.id, organizationId, 'erp_create_customer', payload, body, 400, body.error);
    return res.status(400).json(body);
  }

  const email = pickFirstNonEmpty(payload.email, payload.customerEmail);
  const phone = pickFirstNonEmpty(payload.phone, payload.mobile, payload.customerPhone);
  const fullName = pickFirstNonEmpty(payload.name, payload.fullName, payload.customerName);
  const names = splitName(fullName);
  const firstName = pickFirstNonEmpty(payload.firstName) || names.firstName;
  const lastName = pickFirstNonEmpty(payload.lastName) || names.lastName;
  const company = pickFirstNonEmpty(payload.company, payload.companyName);

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

      const contactData = {
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        email: email || null,
        phone: phone || null,
        mobile: phone || null,
        company: company || null,
        source: 'API',
        lifecycle: 'CUSTOMER',
        type: 'CUSTOMER',
        customData: { erp: { provider, externalCustomerId, lastInboundAction: 'create-customer' } },
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
  const externalSaleId = pickFirstNonEmpty(payload.externalSaleId, payload.saleId, payload.salesId, payload.id) || buildStableExternalId('sale', payload);

  try {
    await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType: 'sale', externalId: externalSaleId } },
          update: {
            crmEntityId: pickFirstNonEmpty(payload.externalCustomerId, payload.customerId) || 'N/A',
            externalPayload: payload,
            organizationId,
          },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType: 'sale',
            crmEntityId: pickFirstNonEmpty(payload.externalCustomerId, payload.customerId) || 'N/A',
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

  const externalAvailabilityId = pickFirstNonEmpty(payload.externalAvailabilityId, payload.availabilityId, payload.doctorId, payload.id)
    || buildStableExternalId('availability', payload);

  try {
    await prisma.$transaction(async (tx) => {
      const { erpExternalRef: erpExternalRefModel, erpSyncState: erpSyncStateModel } = getErpModels(tx);

      if (erpExternalRefModel) {
        await erpExternalRefModel.upsert({
          where: { integrationId_entityType_externalId: { integrationId: integration.id, entityType: 'doctor_availability', externalId: externalAvailabilityId } },
          update: {
            crmEntityId: pickFirstNonEmpty(payload.doctorId, payload.providerId) || 'N/A',
            externalPayload: payload,
            organizationId,
          },
          create: {
            integrationId: integration.id,
            organizationId,
            entityType: 'doctor_availability',
            crmEntityId: pickFirstNonEmpty(payload.doctorId, payload.providerId) || 'N/A',
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

module.exports = router;
