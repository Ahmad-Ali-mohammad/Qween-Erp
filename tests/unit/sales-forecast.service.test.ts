import { buildSalesForecastFromInvoices } from '../../src/modules/analytics/sales-forecast.service';

describe('buildSalesForecastFromInvoices', () => {
  it('fills missing months and falls back to moving average when history is short', () => {
    const result = buildSalesForecastFromInvoices([
      { date: new Date(Date.UTC(2025, 0, 15)), total: 1000 },
      { date: new Date(Date.UTC(2025, 2, 12)), total: 1600 }
    ]);

    expect(result.model).toBe('moving-average');
    expect(result.nextPeriod).toBe('2025-04');
    expect(result.history.map((row) => row.period)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(result.history[1].amount).toBe(0);
    expect(result.forecastNextMonth).toBeGreaterThanOrEqual(500);
  });

  it('selects the seasonal trend regression for structured monthly sales history', () => {
    const invoices = Array.from({ length: 18 }, (_, index) => {
      const month = index % 12;
      const seasonalBoost = month >= 5 && month <= 7 ? 260 : month === 11 ? 180 : -40;
      return {
        date: new Date(Date.UTC(2024, index, 15)),
        total: 1000 + index * 90 + seasonalBoost
      };
    });

    const result = buildSalesForecastFromInvoices(invoices);

    expect(result.history).toHaveLength(18);
    expect(result.model).toBe('seasonal-trend-regression');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(35);
    expect(result.forecastNextMonth).toBeGreaterThan(2000);
    expect(result.forecastRange.high).toBeGreaterThanOrEqual(result.forecastNextMonth);
    expect(result.history[0].fittedAmount).toBeGreaterThanOrEqual(0);
  });
});
