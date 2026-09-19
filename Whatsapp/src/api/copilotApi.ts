import 'dotenv/config';

import type {
  CopilotAskRequest,
  CopilotAskResponse,
} from '../types/sentinel.js';

import { MOCK_ASK_RESPONSE } from '../mock/mockData.js';

const USE_MOCK = process.env.WHATSAPP_USE_MOCK === 'true';

const API_BASE_URL =
  process.env.SENTINEL_API_BASE_URL ||
  'http://localhost:8000/api/v1';

export const copilotApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      return MOCK_ASK_RESPONSE;
    }

    const response = await fetch(`${API_BASE_URL}/copilot/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Copilot API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<CopilotAskResponse>;
  },
};