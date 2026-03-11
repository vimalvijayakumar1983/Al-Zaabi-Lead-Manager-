const { calculateLeadScore, predictConversion } = require('../src/utils/leadScoring');

describe('Lead Scoring', () => {
  test('scores a lead with full data highly', () => {
    const lead = {
      email: 'test@example.com',
      phone: '+971501234567',
      company: 'Test Corp',
      budget: 500000,
      productInterest: 'Villa',
      source: 'REFERRAL',
    };
    const score = calculateLeadScore(lead, 5);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('scores a minimal lead low', () => {
    const lead = { source: 'CSV_IMPORT' };
    const score = calculateLeadScore(lead);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('predicts high conversion for qualified lead with high score', () => {
    const prob = predictConversion(80, 'QUALIFIED');
    expect(prob).toBeGreaterThan(0.5);
  });

  test('predicts zero conversion for lost lead', () => {
    const prob = predictConversion(90, 'LOST');
    expect(prob).toBe(0);
  });

  test('predicts low conversion for new lead with low score', () => {
    const prob = predictConversion(20, 'NEW');
    expect(prob).toBeLessThan(0.2);
  });
});

describe('AI Suggestions', () => {
  const { suggestNextAction } = require('../src/services/aiService');

  test('suggests calling new leads', () => {
    const suggestions = suggestNextAction({ status: 'NEW' }, null);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].type).toBe('FOLLOW_UP_CALL');
  });

  test('suggests re-engagement for inactive leads', () => {
    const oldActivity = { createdAt: new Date(Date.now() - 5 * 24 * 3600000) };
    const suggestions = suggestNextAction({ status: 'CONTACTED' }, oldActivity);
    expect(suggestions.some((s) => s.priority === 'URGENT')).toBe(true);
  });
});
