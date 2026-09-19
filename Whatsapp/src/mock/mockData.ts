import type { CopilotAskResponse } from '../types/sentinel.js';

export const MOCK_ASK_RESPONSE: CopilotAskResponse = {
  answer:
    'Milestone 1 is due Tuesday, September 22, 2026 at 6:00 PM EAT.',
  status: 'CONFIRMED',
  citations: [
    {
      sourceId: 'whatsapp-milestone-001',
      sourceName: 'WhatsApp Team Discussion',
      excerpt: 'Milestone 1 submission deadline is Tuesday at 6:00 PM EAT.',
    },
  ],
};

export const MOCK_SUMMARY_RESPONSE = {
  summary:
    "The team is currently working toward Milestone 1. The submission deadline is Tuesday, September 22, 2026 at 6:00 PM EAT.",
  status: "CONFIRMED",
  sources: [
    {
      sourceName: "WhatsApp Team Discussion",
      excerpt:
        "Milestone 1 submission deadline is Tuesday at 6:00 PM EAT.",
    },
  ],
};