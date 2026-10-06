/**
 * Web Vitals add-on (v.js), loaded by p.js after the page is idle so it never competes with the
 * host page. Performance entries are buffered, so loading late loses nothing.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';

const w = window as Window & { dxm?: { _vital?: (name: string, value: number) => void } };
const report = (m: MetricType) => w.dxm?._vital?.(m.name, m.value);
onLCP(report);
onINP(report);
onCLS(report);
onFCP(report);
onTTFB(report);
