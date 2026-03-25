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
});
