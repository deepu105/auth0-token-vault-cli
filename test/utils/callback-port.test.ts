import { describe, it, expect } from 'vitest';
import { parseCallbackPort } from '../../src/utils/callback-port.js';

describe('parseCallbackPort', () => {
  it('returns undefined when input is undefined', () => {
    expect(parseCallbackPort(undefined)).toBe(undefined);
  });

  it('returns parsed port for valid port string "18484"', () => {
    expect(parseCallbackPort('18484')).toBe(18484);
  });

  it('returns 1 for minimum valid port "1"', () => {
    expect(parseCallbackPort('1')).toBe(1);
  });

  it('returns 65535 for maximum valid port "65535"', () => {
    expect(parseCallbackPort('65535')).toBe(65535);
  });

  it('throws for port "0" (below minimum)', () => {
    expect(() => parseCallbackPort('0')).toThrow();
  });

  it('throws for port "65536" (above maximum)', () => {
    expect(() => parseCallbackPort('65536')).toThrow();
  });

  it('throws for non-numeric string "abc"', () => {
    expect(() => parseCallbackPort('abc')).toThrow();
  });

  it('throws for empty string ""', () => {
    expect(() => parseCallbackPort('')).toThrow();
  });

  it('throws for negative value "-1"', () => {
    expect(() => parseCallbackPort('-1')).toThrow();
  });

  it('throws for decimal value "3.14"', () => {
    expect(() => parseCallbackPort('3.14')).toThrow();
  });
});
