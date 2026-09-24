/**
 * Trusted admin registry for Sentinel.
 *
 * Admins get:
 *  - a retrieval score boost (their messages rank higher)
 *  - trust escalation (their messages can confirm answers alone)
 *  - conflict override (they win when sources disagree)
 *
 * Numbers are stored as digit-only strings (no +, no spaces).
 * Matching is done against the digit-normalized senderId, plus a name fallback.
 */

export interface Admin {
  name: string;
  digits: string;
}

export const TRUSTED_ADMINS: Admin[] = [
  { name: 'Diane', digits: '250783188655' }, // Rwanda
  { name: 'Gift', digits: '263774094822' }, // Zimbabwe
  { name: 'Jeovaire', digits: '250789355992' }, // Rwanda
  { name: 'Munira', digits: '250786387244' }, // Rwanda
];

const ADMIN_DIGITS = new Set(TRUSTED_ADMINS.map((a) => a.digits));
const ADMIN_NAMES = new Set(TRUSTED_ADMINS.map((a) => a.name.toLowerCase()));

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isTrustedAdmin(senderId: string, senderName?: string): boolean {
  const digits = normalizeDigits(senderId);
  if (ADMIN_DIGITS.has(digits)) {
    return true;
  }

  if (senderName) {
    const clean = senderName.toLowerCase().trim();
    if (ADMIN_NAMES.has(clean)) {
      return true;
    }
  }

  return false;
}

/**
 * Return the matching admin (if any) so callers can label them by name.
 */
export function findAdmin(
  senderId: string,
  senderName?: string,
): Admin | undefined {
  const digits = normalizeDigits(senderId);
  const byDigit = TRUSTED_ADMINS.find((a) => a.digits === digits);
  if (byDigit) return byDigit;

  if (senderName) {
    const clean = senderName.toLowerCase().trim();
    const byName = TRUSTED_ADMINS.find((a) => a.name.toLowerCase() === clean);
    if (byName) return byName;
  }

  return undefined;
}
