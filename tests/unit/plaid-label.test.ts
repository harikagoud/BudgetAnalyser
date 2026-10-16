import { describe, expect, it } from 'vitest';
import { linkedAccountName } from '@/lib/plaid/label';

describe('linkedAccountName', () => {
  it('adds the last four digits of each account', () => {
    expect(linkedAccountName({ institution: { name: 'Bank of America' }, accounts: [{ mask: '5585' }, { mask: '1234' }] })).toBe(
      'Bank of America ••5585, ••1234',
    );
  });
  it('falls back to the bank name, then a generic name', () => {
    expect(linkedAccountName({ institution: { name: 'Chase' }, accounts: [{ mask: null }] })).toBe('Chase');
    expect(linkedAccountName({})).toBe('Linked Account');
    expect(linkedAccountName({ institution: { name: '  ' } })).toBe('Linked Account');
  });
  it('caps the list at four accounts', () => {
    const accounts = ['1', '2', '3', '4', '5', '6'].map((mask) => ({ mask }));
    expect(linkedAccountName({ institution: { name: 'X' }, accounts }).split(',').length).toBe(4);
  });
});
