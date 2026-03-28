jest.mock('../../../config/database', () => ({
  prisma: {
    lead: {
      findFirst: jest.fn(),
    },
  },
}));

const { prisma } = require('../../../config/database');
const { computeAttribution } = require('../attributionEngine');

describe('attributionEngine', () => {
  beforeEach(() => jest.clearAllMocks());

  test('weighted_split from payload', async () => {
    const r = await computeAttribution({
      strategy: 'weighted_split',
      event: {
        payload: {
          split: [
            { userId: 'u1', weight: 1 },
            { userId: 'u2', weight: 1 },
          ],
        },
      },
      organizationId: 'org',
      attributionWindowDays: 90,
    });
    expect(r.attributions).toHaveLength(2);
    expect(r.attributions[0].weight).toBeCloseTo(0.5);
    expect(r.attributions[1].weight).toBeCloseTo(0.5);
  });

  test('last_valid_owner uses assignee', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: 'l1',
      assignedToId: 'agent-1',
      createdById: 'other',
      createdAt: new Date(),
    });
    const r = await computeAttribution({
      strategy: 'last_valid_owner',
      event: { leadId: 'l1', occurredAt: new Date() },
      organizationId: 'div-1',
      attributionWindowDays: 90,
    });
    expect(r.attributions).toHaveLength(1);
    expect(r.attributions[0].userId).toBe('agent-1');
  });
});
