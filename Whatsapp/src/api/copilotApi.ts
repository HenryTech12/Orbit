import 'dotenv/config';

import type {
  CopilotAskRequest,
  CopilotAskResponse,
} from '../types/sentinel.js';

import { searchLocalKnowledge } from '../local/localRetriever.js';
import { askLocalCopilot } from '../local/localCopilot.js';

const USE_MOCK = process.env.WHATSAPP_USE_MOCK === 'true';

const API_BASE_URL =
  process.env.SENTINEL_API_BASE_URL || 'http://localhost:8000/api/v1';

export const copilotApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      return askLocalCopilot(payload.question, {
        chatWindow: payload.chatWindow,
        quotedBlock: payload.quotedBlock,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${API_BASE_URL}/copilot/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Copilot API error: ${response.status} ${response.statusText}`,
        );
      }

      return response.json() as Promise<CopilotAskResponse>;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Copilot API request timed out after 15 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _buildLocalAnswer(
  results: Awaited<ReturnType<typeof searchLocalKnowledge>>,
): string {
  const topResults = results.slice(0, 3);

  if (topResults.length === 1) {
    return `Based on the WhatsApp history: ${topResults[0].message.text}`;
  }

  return [
    'Based on the available WhatsApp history, the relevant discussion includes:',
    '',
    ...topResults.map(
      (result) =>
        `• ${result.message.senderName ?? 'Unknown'}: ${result.message.text}`,
    ),
  ].join('\n');
}
