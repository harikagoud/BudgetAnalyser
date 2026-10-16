/** "Bank of America ••5585, ••1234" so several cards at one bank can be told apart. */
export function linkedAccountName(metadata: {
  institution?: { name?: string | null } | null;
  accounts?: Array<{ mask?: string | null }> | null;
}): string {
  const bank = metadata.institution?.name?.trim() || 'Linked Account';
  const masks = (metadata.accounts ?? [])
    .map((a) => (a.mask ? `••${a.mask}` : ''))
    .filter(Boolean)
    .slice(0, 4);
  return masks.length > 0 ? `${bank} ${masks.join(', ')}` : bank;
}
