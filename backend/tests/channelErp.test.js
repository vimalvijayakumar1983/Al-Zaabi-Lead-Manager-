const express = require('express');
const request = require('supertest');

const mockPrisma = {
  integration: { findMany: jest.fn() },
  erpRequestAudit: { create: jest.fn() },
  integrationLog: { create: jest.fn() },
  erpExternalRef: { findUnique: jest.fn(), upsert: jest.fn() },
  erpSyncState: { upsert: jest.fn() },
  contact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../src/config/database', () => ({ prisma: mockPrisma }));

const router = require('../src/routes/channel-erp');

describe('channel-erp routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  it('returns 401 when token is invalid', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-1',
        organizationId: 'org-1',
        config: { divisionId: 'div-1', erpProvider: 'facts' },
        credentials: { token: 'expected-token' },
      },
    ]);

    const response = await request(app)
      .post('/erp/org-1/div-1/create-customer')
      .set('x-erp-token', 'wrong-token')
      .send({ externalCustomerId: 'c-1', firstName: 'John' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Invalid ERP token/i);
  });

  it('returns 400 for doctor-availability when provider is not cortex', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-2',
        organizationId: 'org-1',
        config: { divisionId: 'div-1', erpProvider: 'facts' },
        credentials: { token: 'abc123' },
      },
    ]);

    const response = await request(app)
      .post('/erp/org-1/div-1/doctor-availability')
      .set('x-erp-token', 'abc123')
      .send({ doctorId: 'd-1' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/CORTEX/i);
  });

  it('creates or updates contact successfully on create-customer', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-3',
        organizationId: 'org-1',
        config: { divisionId: 'div-9', erpProvider: 'cortex' },
        credentials: { token: 'secret-token' },
      },
    ]);

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'contact-1' }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-9/create-customer')
      .set('x-erp-token', 'secret-token')
      .send({
        externalCustomerId: 'cust-100',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '971500000000',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.contactId).toBe('contact-1');
    expect(response.body.externalCustomerId).toBe('cust-100');
  });

  it('maps create-customer fields from integration.config.erpFieldMapping', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-map',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-map',
          erpProvider: 'facts',
          erpFieldMapping: {
            customer: {
              email: 'primary_email',
              fullName: 'display_name',
            },
          },
        },
        credentials: { token: 'tok' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-mapped' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-map/create-customer')
      .set('Authorization', 'Bearer tok')
      .send({
        externalCustomerId: 'c-map',
        primary_email: 'erp@example.com',
        display_name: 'Ada Lovelace',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.email).toBe('erp@example.com');
    expect(createdPayload.firstName).toBe('Ada');
    expect(createdPayload.lastName).toBe('Lovelace');
  });

  it('stores unmapped top-level fields in customData.erp.extra for create-customer', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-extra',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-x',
          erpProvider: 'focus',
        },
        credentials: { token: 'tok2' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-extra' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-x/create-customer')
      .set('Authorization', 'Bearer tok2')
      .send({
        externalCustomerId: 'c-extra',
        email: 'x@example.com',
        loyaltyTier: 'GOLD',
        vatNumber: '123',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.customData.erp.extra).toEqual({
      loyaltyTier: 'GOLD',
      vatNumber: '123',
    });
  });

  it('respects erpExtraFieldKeys whitelist for create-customer extras', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-white',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-w',
          erpProvider: 'uniqorn',
          erpExtraFieldKeys: ['loyaltyTier'],
        },
        credentials: { token: 'tok3' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-w' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-w/create-customer')
      .set('Authorization', 'Bearer tok3')
      .send({
        externalCustomerId: 'c-w',
        email: 'w@example.com',
        loyaltyTier: 'SILVER',
        vatNumber: '999',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.customData.erp.extra).toEqual({ loyaltyTier: 'SILVER' });
  });

  it('stores erpFieldMappingCustom values under customData.erp.mappedFields', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-mf',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-mf',
          erpProvider: 'facts',
          erpFieldMappingCustom: {
            customer: { vatNumber: 'tax_no', loyaltyTier: 'tier_code' },
          },
        },
        credentials: { token: 'tok-mf' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-mf' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-mf/create-customer')
      .set('Authorization', 'Bearer tok-mf')
      .send({
        externalCustomerId: 'c-mf',
        email: 'mf@example.com',
        tax_no: 'AE123',
        tier_code: 'PLATINUM',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.customData.erp.mappedFields).toEqual({
      vatNumber: 'AE123',
      loyaltyTier: 'PLATINUM',
    });
  });

  it('merges canonical mapping, custom mappedFields, and extra on create-customer', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-all',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-all',
          erpProvider: 'focus',
          erpFieldMapping: { customer: { email: 'mail_1' } },
          erpFieldMappingCustom: { customer: { vatNumber: 'tax_no' } },
        },
        credentials: { token: 'tok-all' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-all' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-all/create-customer')
      .set('Authorization', 'Bearer tok-all')
      .send({
        externalCustomerId: 'c-all',
        mail_1: 'all@example.com',
        tax_no: 'VAT-9',
        notes_field: 'hello',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.email).toBe('all@example.com');
    expect(createdPayload.customData.erp.mappedFields).toEqual({ vatNumber: 'VAT-9' });
    expect(createdPayload.customData.erp.extra).toEqual({ notes_field: 'hello' });
  });

  it('skips custom mapping when ERP key already used by canonical mapping', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-dup',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-dup',
          erpProvider: 'facts',
          erpFieldMapping: { customer: { email: 'primary_email' } },
          erpFieldMappingCustom: { customer: { backupEmail: 'primary_email' } },
        },
        credentials: { token: 'tok-dup' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-dup' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-dup/create-customer')
      .set('Authorization', 'Bearer tok-dup')
      .send({
        externalCustomerId: 'c-dup',
        primary_email: 'one@example.com',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.email).toBe('one@example.com');
    expect(createdPayload.customData.erp.mappedFields || {}).not.toHaveProperty('backupEmail');
  });

  it('ignores invalid custom mapping target keys safely', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-inv',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-inv',
          erpProvider: 'facts',
          erpFieldMappingCustom: {
            customer: { '9invalid': 'bad_key', goodKey: 'ok_field' },
          },
        },
        credentials: { token: 'tok-inv' },
      },
    ]);

    let createdPayload;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
        contact: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => {
            createdPayload = args.data;
            return Promise.resolve({ id: 'contact-inv' });
          }),
          update: jest.fn(),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-inv/create-customer')
      .set('Authorization', 'Bearer tok-inv')
      .send({
        externalCustomerId: 'c-inv',
        email: 'inv@example.com',
        ok_field: 'kept',
        bad_key: 'dropped-target',
      });

    expect(response.status).toBe(200);
    expect(createdPayload.customData.erp.mappedFields).toEqual({ goodKey: 'kept' });
    expect(createdPayload.customData.erp.extra).toMatchObject({ bad_key: 'dropped-target' });
  });

  it('returns 404 for unknown custom ERP table slug', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-custom-404',
        organizationId: 'org-1',
        config: { divisionId: 'div-1', erpProvider: 'facts', erpCustomTables: [{ slug: 'stock', externalIdKeys: ['id'] }] },
        credentials: { token: 't-custom' },
      },
    ]);

    const response = await request(app)
      .post('/erp/org-1/div-1/unknown_table')
      .set('Authorization', 'Bearer t-custom')
      .send({ id: 'x1' });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not configured/i);
  });

  it('returns 400 for reserved custom ERP table slug', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-custom-reserved',
        organizationId: 'org-1',
        config: { divisionId: 'div-1', erpProvider: 'facts' },
        credentials: { token: 't-custom' },
      },
    ]);

    const response = await request(app)
      .post('/erp/org-1/div-1/create-customer')
      .set('Authorization', 'Bearer t-custom')
      .send({});

    // Explicit route still handles it; missing externalCustomerId returns 400.
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/externalCustomerId/i);
  });

  it('accepts configured custom ERP table and stores raw payload under custom_* entityType', async () => {
    mockPrisma.integration.findMany.mockResolvedValue([
      {
        id: 'intg-custom-ok',
        organizationId: 'org-1',
        config: {
          divisionId: 'div-1',
          erpProvider: 'focus',
          erpCustomTables: [{ slug: 'stock', label: 'Stock', externalIdKeys: ['sku', 'id'] }],
        },
        credentials: { token: 't-custom-ok' },
      },
    ]);

    let upsertArgs;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        erpExternalRef: {
          upsert: jest.fn().mockImplementation((args) => {
            upsertArgs = args;
            return Promise.resolve({});
          }),
        },
        erpSyncState: { upsert: jest.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });

    const response = await request(app)
      .post('/erp/org-1/div-1/stock')
      .set('Authorization', 'Bearer t-custom-ok')
      .send({ sku: 'SKU-1', qty: 44 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.entityType).toBe('custom_stock');
    expect(upsertArgs.where.integrationId_entityType_externalId.entityType).toBe('custom_stock');
    expect(upsertArgs.create.externalPayload).toEqual({ sku: 'SKU-1', qty: 44 });
  });
});
