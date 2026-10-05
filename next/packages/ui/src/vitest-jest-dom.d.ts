// Vitest 5 changed Assertion to Assertion<R, T> (R = matcher return type). jest-dom 6.10 still
// augments the old Assertion<T>, which silently fails to merge — so declare it with the new shape.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
