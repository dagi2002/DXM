/**
 * Site insights (slice 5): pure metric functions over daily rollups. No I/O, no clock.
 * The database side (rollup job, loading insights for a site) is in `@pulse/insights/db`.
 */
export * from './compute';
export * from './funnels';
export * from './glob';
export * from './health';
export * from './rollup';
export * from './vitals';
