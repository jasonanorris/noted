import {
  formatPerformanceMetric,
  getPerformanceMetrics,
  recordPerformanceMetric,
  summarizePerformanceMetrics,
} from './performanceMonitoring';

beforeEach(() => {
  window.localStorage.clear();
});

test('records and summarizes recent performance metrics', () => {
  recordPerformanceMetric({ id: 'first-lcp', name: 'LCP', value: 1234.4, rating: 'good' });
  recordPerformanceMetric({ id: 'cls', name: 'CLS', value: 0.0421, rating: 'good' });
  recordPerformanceMetric({ id: 'second-lcp', name: 'LCP', value: 1500.9, rating: 'needs-improvement' });

  const metrics = getPerformanceMetrics();
  const summary = summarizePerformanceMetrics(metrics);

  expect(metrics).toHaveLength(3);
  expect(summary.map((metric) => metric.name)).toEqual(['LCP', 'CLS']);
  expect(summary[0].id).toBe('second-lcp');
  expect(formatPerformanceMetric(summary[0])).toBe('1501 ms');
  expect(formatPerformanceMetric(summary[1])).toBe('0.042');
});
