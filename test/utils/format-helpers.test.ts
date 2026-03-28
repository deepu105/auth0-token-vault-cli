import { describe, it, expect } from 'vitest';
import { truncate } from '../../src/utils/format-helpers.js';

describe('truncate', () => {
  it('returns string unchanged when shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when exactly at max length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates string with ellipsis when over max', () => {
    expect(truncate('hello world', 5)).toBe('hell…');
  });

  it('returns empty string unchanged', () => {
    expect(truncate('', 10)).toBe('');
  });
});
