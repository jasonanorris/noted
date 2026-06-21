const PERFORMANCE_METRICS_KEY = 'noted:performance-metrics';
const MAX_STORED_METRICS = 25;
const METRIC_ORDER = ['LCP', 'FID', 'CLS', 'FCP', 'TTFB', 'INP'];

function canUseLocalStorage() {
  try {
    const key = 'noted:storage-check';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

export function getPerformanceMetrics() {
  if (typeof window === 'undefined' || !canUseLocalStorage()) return [];

  try {
    const storedMetrics = JSON.parse(window.localStorage.getItem(PERFORMANCE_METRICS_KEY) || '[]');
    return Array.isArray(storedMetrics) ? storedMetrics : [];
  } catch (error) {
    return [];
  }
}

export function recordPerformanceMetric(metric) {
  if (!metric?.name || typeof window === 'undefined' || !canUseLocalStorage()) return null;

  const entry = {
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating || 'unknown',
    delta: metric.delta,
    navigationType: metric.navigationType,
    path: window.location.pathname,
    createdAt: Date.now(),
  };

  const metrics = [entry, ...getPerformanceMetrics()].slice(0, MAX_STORED_METRICS);
  window.localStorage.setItem(PERFORMANCE_METRICS_KEY, JSON.stringify(metrics));
  window.dispatchEvent(new CustomEvent('performance:metric', { detail: entry }));

  if (process.env.NODE_ENV === 'development') {
    console.info('[Noted performance]', entry);
  }

  return entry;
}

export function summarizePerformanceMetrics(metrics = getPerformanceMetrics()) {
  const latestByName = metrics.reduce((summary, metric) => {
    if (!summary[metric.name]) {
      summary[metric.name] = metric;
    }

    return summary;
  }, {});

  return METRIC_ORDER
    .filter((name) => latestByName[name])
    .map((name) => latestByName[name]);
}

export function formatPerformanceMetric(metric) {
  if (!metric) return '';

  if (metric.name === 'CLS') {
    return Number(metric.value || 0).toFixed(3);
  }

  return `${Math.round(metric.value || 0)} ms`;
}
