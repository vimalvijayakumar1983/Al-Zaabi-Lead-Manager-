const { computeEarningAmount, roundHalfUp } = require('../earningsEngine');

describe('earningsEngine', () => {
  test('roundHalfUp', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(10.123, 2)).toBe(10.12);
  });

  test('fixed amount', () => {
    const { amount, trace } = computeEarningAmount({
      earningsConfig: { eventTypes: { outreach_made: { type: 'fixed', amount: 42 } } },
      eventType: 'outreach_made',
      event: {},
    });
    expect(amount).toBe(42);
    expect(trace.formula).toBe('fixed');
  });

  test('percent of event amount', () => {
    const { amount } = computeEarningAmount({
      earningsConfig: { eventTypes: { conversion_won: { type: 'percent', percent: 2, baseField: 'amount' } } },
      eventType: 'conversion_won',
      event: { amount: 10000 },
    });
    expect(amount).toBe(200);
  });

  test('tiered percent', () => {
    const { amount } = computeEarningAmount({
      earningsConfig: {
        eventTypes: {
          invoice_posted: {
            type: 'tiered_percent',
            baseField: 'amount',
            tiers: [
              { upTo: 5000, percent: 1 },
              { upTo: null, percent: 2 },
            ],
          },
        },
      },
      eventType: 'invoice_posted',
      event: { amount: 8000 },
    });
    expect(amount).toBe(5000 * 0.01 + 3000 * 0.02);
  });

  test('minPayout zeroes small amounts', () => {
    const { amount } = computeEarningAmount({
      earningsConfig: {
        minPayout: 100,
        eventTypes: { outreach_made: { type: 'fixed', amount: 5 } },
      },
      eventType: 'outreach_made',
      event: {},
    });
    expect(amount).toBe(0);
  });
});
