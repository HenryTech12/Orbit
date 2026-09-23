import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CatchUpRequest,
  CatchUpResponse,
  SourceDetail,
  UploadSourceResponse
} from '@/types/sentinel';
import { MOCK_ASK_RESPONSE, MOCK_CATCHUP_RESPONSE, MOCK_SOURCE_DETAIL } from './mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const API_KEY = import.meta.env.VITE_ORBIT_API_KEY || 'dev_orbit_api_key_2026';

const getHeaders = (extra: Record<string, string> = {}) => {
  const headers: Record<string, string> = { ...extra };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  return headers;
};

export const sentinelApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      return MOCK_ASK_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/topics/`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Copilot API error: ${res.statusText}`);
    return res.json();
  },

  async catchUp(_payload: CatchUpRequest): Promise<CatchUpResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 800));
      return MOCK_CATCHUP_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/topics/`, {
      method: 'GET',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Catch-Up API error: ${res.statusText}`);
    return res.json();
  },

  async getSource(sourceId: string): Promise<SourceDetail> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 300));
      return { ...MOCK_SOURCE_DETAIL, source_id: sourceId };
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/meetings/${sourceId}/`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Source retrieval error: ${res.statusText}`);
    return res.json();
  },

  async uploadSource(formData: FormData): Promise<UploadSourceResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 1000));
      return {
        source_id: `src_${Date.now()}`,
        status: 'PROCESSING',
        message: 'Mock file uploaded and processing',
        filename: 'uploaded_document.pdf',
        created_at: new Date().toISOString()
      };
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/meetings/`, {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error: ${res.statusText}`);
    return res.json();
  },

  async transcribeAudio(blob: Blob): Promise<{ text: string }> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 1200));
      return {
        text: 'What are the core deadlines for Milestone 1 submission?',
      };
    }

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');

    const res = await fetch(`${API_BASE_URL}/sentinel/meetings/process/`, {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Transcription error: ${res.statusText}`);
    }

    return res.json();
  },
};
