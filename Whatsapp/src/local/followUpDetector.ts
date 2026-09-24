const CONFIRM_PATTERNS = [
  /^(are\s+you\s+sure|you\s+sure|really\??|is\s+that\s+(right|correct|true)|are\s+you\s+certain)[\s?!.]*$/i,
  /^(no|nope|wrong|that'?s\s+(wrong|not\s+right|incorrect))[\s,.]*/i,
  /^\?{1,3}$/,
  /^(huh|what\??)$/i,
];

/** True for a short message that references the LAST bot answer rather than asking something new. */
export function isFollowUp(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 60) return false;
  return CONFIRM_PATTERNS.some((p) => p.test(t));
}
