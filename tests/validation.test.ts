import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, staffAccessSchema, roleSchema } from '../lib/validation';
import { authDestination } from '../lib/auth/redirects';
import { pageNumber } from '../lib/pagination';
describe('untrusted form boundaries', () => {
  it('normalizes email but preserves the exact password', () => {
    expect(loginSchema.parse({ email: ' STAFF@EXAMPLE.COM ', password: '  unchanged  ' })).toEqual({ email: 'staff@example.com', password: '  unchanged  ' });
  });
  it('rejects malformed emails and empty passwords', () => {
    expect(loginSchema.safeParse({ email: 'invalid', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(false);
  });
  it('requires a strong length and matching password confirmation', () => {
    expect(passwordSchema.safeParse({ password: 'short', confirmation: 'short' }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: 'a-long-password', confirmation: 'another-password' }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: 'a-long-password', confirmation: 'a-long-password' }).success).toBe(true);
  });
  it('rejects malformed staff IDs and unsafe role identifiers', () => {
    expect(staffAccessSchema.safeParse({ id: 'not-a-uuid', fullName: 'Staff', role: 'sales', active: true }).success).toBe(false);
    expect(roleSchema.safeParse({ key: '../admin', name: 'Injected' }).success).toBe(false);
  });
  it.each(['https://evil.example', '//evil.example', '/dashboard/users', '/update-password?next=evil'])('blocks auth redirect input %s', value => {
    expect(authDestination(value)).toBe('/dashboard');
  });
  it('permits the explicit password destination', () => expect(authDestination('/update-password')).toBe('/update-password'));
  it.each(['-1', 'NaN', '1.5', 'Infinity', '9999999999999999999999'])('rejects invalid page %s', value => expect(pageNumber(value)).toBe(1));
});
