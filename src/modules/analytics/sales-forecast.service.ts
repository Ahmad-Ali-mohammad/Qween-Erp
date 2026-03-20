export interface SalesForecastInvoiceInput {
  date: Date | string;
  total: unknown;
}

interface MonthlySalesPoint {
  period: string;
  date: Date;
  index: number;
  amount: number;
}

type TrendDirection = 'up' | 'down' | 'stable';

interface ForecastMetrics {
  mae: number;
  mape: number;
  rmse: number;
}

interface LinearModel {
  coefficients: number[];
  center: number;
  scale: number;
}

export interface SalesForecastResult {
  history: Array<{
    period: string;
    amount: number;
    fittedAmount: number;
    deviation: number;
    deviationPct: number;
  }>;
  forecastNextMonth: number;
  nextPeriod: string | null;
  model: 'moving-average' | 'seasonal-trend-regression';
  modelLabel: string;
  benchmarkModel: 'moving-average';
  benchmarkLabel: string;
  confidenceScore: number;
  forecastRange: {
    low: number;
    high: number;
  };
  metrics: ForecastMetrics;
  diagnostics: {
    historyMonths: number;
    trainingMonths: number;
    validationMonths: number;
    averageMonthlySales: number;
    trendDirection: TrendDirection;
  };
  insightAr: string;
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function aggregateMonthlySales(invoices: SalesForecastInvoiceInput[]): MonthlySalesPoint[] {
  const byMonth = new Map<string, number>();
  let minMonth: Date | null = null;
  let maxMonth: Date | null = null;

  for (const invoice of invoices) {
    const date = new Date(invoice.date);
    if (Number.isNaN(date.getTime())) continue;

    const monthDate = startOfUtcMonth(date);
    const key = monthKey(monthDate);
    byMonth.set(key, roundAmount((byMonth.get(key) ?? 0) + toNumber(invoice.total)));

    if (!minMonth || monthDate < minMonth) minMonth = monthDate;
    if (!maxMonth || monthDate > maxMonth) maxMonth = monthDate;
  }

  if (!minMonth || !maxMonth) return [];

  const rows: MonthlySalesPoint[] = [];
  for (let cursor = minMonth, index = 0; cursor <= maxMonth; cursor = addUtcMonths(cursor, 1), index += 1) {
    const key = monthKey(cursor);
    rows.push({
      period: key,
      date: cursor,
      index,
      amount: roundAmount(byMonth.get(key) ?? 0)
    });
  }

  return rows;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingAverage(points: MonthlySalesPoint[]): number {
  if (!points.length) return 0;
  const window = Math.min(3, points.length);
  return average(points.slice(-window).map((point) => point.amount));
}

function computeMetrics(actuals: number[], predicted: number[]): ForecastMetrics {
  if (!actuals.length || actuals.length !== predicted.length) {
    return { mae: 0, mape: 0, rmse: 0 };
  }

  let mae = 0;
  let rmse = 0;
  let mapeAccumulator = 0;
  let mapeCount = 0;

  actuals.forEach((actual, index) => {
    const error = Math.abs(actual - predicted[index]);
    mae += error;
    rmse += error ** 2;

    if (Math.abs(actual) > 0.0001) {
      mapeAccumulator += (error / Math.abs(actual)) * 100;
      mapeCount += 1;
    }
  });

  return {
    mae: roundAmount(mae / actuals.length),
    mape: roundAmount(mapeCount ? mapeAccumulator / mapeCount : 0),
    rmse: roundAmount(Math.sqrt(rmse / actuals.length))
  };
}

function buildFeatureVector(point: Pick<MonthlySalesPoint, 'date' | 'index'>, center: number, scale: number): number[] {
  const normalizedIndex = (point.index - center) / scale;
  const angle = ((point.date.getUTCMonth() + 1) / 12) * Math.PI * 2;

  return [
    1,
    normalizedIndex,
    normalizedIndex * normalizedIndex,
    Math.sin(angle),
    Math.cos(angle)
  ];
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let pivotRow = pivotIndex;
    for (let row = pivotIndex + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivotIndex]) > Math.abs(augmented[pivotRow][pivotIndex])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][pivotIndex]) < 1e-9) return null;
    if (pivotRow !== pivotIndex) {
      [augmented[pivotIndex], augmented[pivotRow]] = [augmented[pivotRow], augmented[pivotIndex]];
    }

    const pivot = augmented[pivotIndex][pivotIndex];
    for (let column = pivotIndex; column <= size; column += 1) {
      augmented[pivotIndex][column] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivotIndex) continue;
      const factor = augmented[row][pivotIndex];
      if (Math.abs(factor) < 1e-9) continue;
      for (let column = pivotIndex; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivotIndex][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function fitSeasonalTrendModel(points: MonthlySalesPoint[]): LinearModel | null {
  if (points.length < 4) return null;

  const center = average(points.map((point) => point.index));
  const scale = Math.max(points.length - 1, 1);
  const featureSize = 5;
  const xtx = Array.from({ length: featureSize }, () => Array.from({ length: featureSize }, () => 0));
  const xty = Array.from({ length: featureSize }, () => 0);

  points.forEach((point) => {
    const features = buildFeatureVector(point, center, scale);
    for (let row = 0; row < featureSize; row += 1) {
      xty[row] += features[row] * point.amount;
      for (let column = 0; column < featureSize; column += 1) {
        xtx[row][column] += features[row] * features[column];
      }
    }
  });

  const ridgeLambda = 0.15;
  for (let i = 1; i < featureSize; i += 1) {
    xtx[i][i] += ridgeLambda;
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;

  return { coefficients, center, scale };
}

function predictSeasonalTrend(model: LinearModel, point: Pick<MonthlySalesPoint, 'date' | 'index'>): number {
  const prediction = dot(buildFeatureVector(point, model.center, model.scale), model.coefficients);
  return roundAmount(Math.max(0, prediction));
}

function computeMovingAveragePredictions(points: MonthlySalesPoint[]): number[] {
  return points.map((point, index) => {
    if (index === 0) return roundAmount(point.amount);
    return roundAmount(movingAverage(points.slice(0, index)));
  });
}

function detectTrendDirection(points: MonthlySalesPoint[]): TrendDirection {
  if (points.length < 2) return 'stable';

  const window = Math.min(3, points.length);
  const recentAverage = average(points.slice(-window).map((point) => point.amount));
  const previousSlice = points.slice(-window * 2, -window);
  const previousAverage = previousSlice.length
    ? average(previousSlice.map((point) => point.amount))
    : points[0].amount;

  const deltaRatio = previousAverage === 0
    ? recentAverage === 0 ? 0 : 1
    : (recentAverage - previousAverage) / Math.abs(previousAverage);

  if (deltaRatio > 0.05) return 'up';
  if (deltaRatio < -0.05) return 'down';
  return 'stable';
}

function buildInsightAr(model: SalesForecastResult['model'], trendDirection: TrendDirection, confidenceScore: number): string {
  const trendText =
    trendDirection === 'up'
      ? 'الاتجاه العام للمبيعات صاعد'
      : trendDirection === 'down'
        ? 'الاتجاه العام للمبيعات هابط'
        : 'الاتجاه العام للمبيعات مستقر';

  const modelText =
    model === 'seasonal-trend-regression'
      ? 'والتوقع مبني على انحدار موسمي يلتقط الاتجاه الشهري'
      : 'والتوقع مبني على متوسط متحرك تكيفي بسبب محدودية البيانات';

  const confidenceText =
    confidenceScore >= 75
      ? 'بدرجة ثقة جيدة.'
      : confidenceScore >= 55
        ? 'بدرجة ثقة متوسطة.'
        : 'بدرجة ثقة حذرة وتحتاج إلى بيانات أكثر.';

  return `${trendText}، ${modelText} ${confidenceText}`;
}

function chooseValidationSize(historyMonths: number): number {
  if (historyMonths >= 12) return 3;
  if (historyMonths >= 8) return 2;
  if (historyMonths >= 5) return 1;
  return 0;
}

export function buildSalesForecastFromInvoices(invoices: SalesForecastInvoiceInput[]): SalesForecastResult {
  const monthlyHistory = aggregateMonthlySales(invoices);
  const averageMonthlySales = roundAmount(average(monthlyHistory.map((point) => point.amount)));
  const nextDate = monthlyHistory.length ? addUtcMonths(monthlyHistory[monthlyHistory.length - 1].date, 1) : null;
  const nextPeriod = nextDate ? monthKey(nextDate) : null;
  const trendDirection = detectTrendDirection(monthlyHistory);

  if (!monthlyHistory.length) {
    return {
      history: [],
      forecastNextMonth: 0,
      nextPeriod,
      model: 'moving-average',
      modelLabel: 'متوسط متحرك',
      benchmarkModel: 'moving-average',
      benchmarkLabel: 'متوسط متحرك',
      confidenceScore: 0,
      forecastRange: { low: 0, high: 0 },
      metrics: { mae: 0, mape: 0, rmse: 0 },
      diagnostics: {
        historyMonths: 0,
        trainingMonths: 0,
        validationMonths: 0,
        averageMonthlySales: 0,
        trendDirection
      },
      insightAr: 'لا توجد بيانات مبيعات كافية لتدريب نموذج التنبؤ بعد.'
    };
  }

  const validationMonths = chooseValidationSize(monthlyHistory.length);
  const trainingMonths = monthlyHistory.length - validationMonths;
  const movingAverageHistory = computeMovingAveragePredictions(monthlyHistory);

  let model: SalesForecastResult['model'] = 'moving-average';
  let metrics = computeMetrics(
    monthlyHistory.slice(-Math.max(validationMonths, 1)).map((point) => point.amount),
    movingAverageHistory.slice(-Math.max(validationMonths, 1))
  );

  const movingAverageForecast = roundAmount(movingAverage(monthlyHistory));
  let history = monthlyHistory.map((point, index) => {
    const fittedAmount = movingAverageHistory[index];
    const deviation = roundAmount(point.amount - fittedAmount);
    return {
      period: point.period,
      amount: point.amount,
      fittedAmount,
      deviation,
      deviationPct: roundAmount(fittedAmount === 0 ? 0 : (deviation / fittedAmount) * 100)
    };
  });
  let forecastNextMonth = movingAverageForecast;

  const regressionTrainingSet = validationMonths ? monthlyHistory.slice(0, trainingMonths) : monthlyHistory;
  const regressionModel = fitSeasonalTrendModel(regressionTrainingSet);

  if (regressionModel) {
    const validationPoints = validationMonths ? monthlyHistory.slice(trainingMonths) : [];
    const regressionPredictions = validationPoints.map((point) => predictSeasonalTrend(regressionModel, point));

    const movingAverageValidationPredictions: number[] = [];
    if (validationMonths) {
      const rollingHistory = monthlyHistory.slice(0, trainingMonths);
      validationPoints.forEach((point) => {
        movingAverageValidationPredictions.push(roundAmount(movingAverage(rollingHistory)));
        rollingHistory.push(point);
      });
    }

    const regressionMetrics = validationMonths
      ? computeMetrics(validationPoints.map((point) => point.amount), regressionPredictions)
      : computeMetrics(monthlyHistory.map((point) => point.amount), monthlyHistory.map((point) => predictSeasonalTrend(regressionModel, point)));
    const movingAverageMetrics = validationMonths
      ? computeMetrics(validationPoints.map((point) => point.amount), movingAverageValidationPredictions)
      : metrics;

    const regressionWins = !validationMonths
      || (movingAverageMetrics.mae === 0
        ? regressionMetrics.mae === 0
        : regressionMetrics.mae <= movingAverageMetrics.mae * 1.02);

    if (regressionWins) {
      model = 'seasonal-trend-regression';
      metrics = regressionMetrics;

      const fullRegressionModel = fitSeasonalTrendModel(monthlyHistory);
      if (fullRegressionModel) {
        history = monthlyHistory.map((point) => {
          const fittedAmount = predictSeasonalTrend(fullRegressionModel, point);
          const deviation = roundAmount(point.amount - fittedAmount);
          return {
            period: point.period,
            amount: point.amount,
            fittedAmount,
            deviation,
            deviationPct: roundAmount(fittedAmount === 0 ? 0 : (deviation / fittedAmount) * 100)
          };
        });
        forecastNextMonth = nextDate
          ? predictSeasonalTrend(fullRegressionModel, { date: nextDate, index: monthlyHistory.length })
          : forecastNextMonth;
      }
    } else {
      metrics = movingAverageMetrics;
    }
  }

  const errorBase = Math.max(averageMonthlySales, 1);
  const relativeError = metrics.mae / errorBase;
  const confidenceCeiling = validationMonths ? 95 : 80;
  const confidenceScore = clamp(Math.round((1 - Math.min(relativeError, 0.75)) * 100), 35, confidenceCeiling);
  const uncertaintyBand = roundAmount(Math.max(metrics.rmse, metrics.mae, errorBase * 0.08));

  return {
    history,
    forecastNextMonth: roundAmount(forecastNextMonth),
    nextPeriod,
    model,
    modelLabel: model === 'seasonal-trend-regression' ? 'انحدار موسمي باتجاه زمني' : 'متوسط متحرك',
    benchmarkModel: 'moving-average',
    benchmarkLabel: 'متوسط متحرك',
    confidenceScore,
    forecastRange: {
      low: roundAmount(Math.max(0, forecastNextMonth - uncertaintyBand)),
      high: roundAmount(forecastNextMonth + uncertaintyBand)
    },
    metrics,
    diagnostics: {
      historyMonths: monthlyHistory.length,
      trainingMonths: trainingMonths || monthlyHistory.length,
      validationMonths,
      averageMonthlySales,
      trendDirection
    },
    insightAr: buildInsightAr(model, trendDirection, confidenceScore)
  };
}
