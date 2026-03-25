/**
 * Address detection utilities — shared across actions.
 * Used by inspectContract.ts and analyzeWallet.ts.
 */

export function isSolanaAddress(s: string): boolean {
  // base58, 32–44 chars, no 0x prefix
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

export function extractEthAddress(text: string): string | null {
  const m = text.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

export function extractSolanaAddress(text: string): string | null {
  // Match standalone base58 token of 32-44 chars
  const m = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (m && isSolanaAddress(m[1])) return m[1];
  return null;
}
