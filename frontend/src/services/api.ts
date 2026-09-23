import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CatchUpRequest,
  CatchUpResponse,
  CatchUpAnnouncement,
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

interface BackendTopic {
  id: string;
  label: string;
  latest_status?: string;
  last_updated?: string;
}

export const sentinelApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      return MOCK_ASK_RESPONSE;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/sentinel/topics/`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ label: payload.question || 'General Query' }),
      });

      if (res.status === 409) {
        return {
          answer: `Topic "${payload.question}" is already being tracked by the Sentinel backend.`,
          status: 'CONFIRMED',
          status_reason: 'Topic previously registered in Sentinel system.',
          citations: [
            {
              citation_id: `cit_existing_${Date.now()}`,
              source_id: 'live_backend',
              title: payload.question,
              source_type: 'announcement',
              author: 'Sentinel Agent',
              date: new Date().toISOString(),
              snippet: 'Topic already registered and being monitored.'
            }
          ],
          facts: []
        };
      }

      if (!res.ok) {
        throw new Error(`Copilot API error: ${res.statusText}`);
      }

      const raw = await res.json();
      const topicData = raw.data || raw;

      return {
        answer: `Topic registered: "${topicData.label || payload.question}". Status: ${topicData.latest_status || 'tracked'}.`,
        status: 'CONFIRMED',
        status_reason: 'Live topic verified by Sentinel backend.',
        citations: [
          {
            citation_id: `cit_${topicData.id || 'sentinel'}`,
            source_id: topicData.id || 'live_backend',
            title: topicData.label || 'Sentinel Topic Stream',
            source_type: 'announcement',
            author: 'Sentinel Agent',
            date: topicData.last_updated || new Date().toISOString(),
            snippet: `Current status: ${topicData.latest_status || 'active'}`
          }
        ],
        facts: []
      };
    } catch {
      return MOCK_ASK_RESPONSE;
    }
  },

  async catchUp(payload: CatchUpRequest): Promise<CatchUpResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 800));
      return MOCK_CATCHUP_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/topics/`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Catch-Up API error: ${res.statusText}`);
    }

    const raw = await res.json();
    const topics: BackendTopic[] = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);

    const announcements: CatchUpAnnouncement[] = topics.map((t) => ({
      id: t.id,
      title: t.label,
      summary: `Topic status: ${t.latest_status || 'active'}. Recorded in Sentinel system.`,
      timestamp: t.last_updated || new Date().toISOString(),
      citation: {
        citation_id: `cit_${t.id}`,
        source_id: t.id,
        title: 'Sentinel Service',
        source_type: 'announcement',
        author: 'Sentinel System',
        date: t.last_updated || new Date().toISOString(),
        snippet: `Topic: ${t.label} (status: ${t.latest_status || 'unknown'})`
      }
    }));

    return {
      summary_period: {
        from: payload.from || new Date(Date.now() - 7 * 86400000).toISOString(),
        to: payload.to || new Date().toISOString(),
        total_updates: announcements.length
      },
      announcements,
      decisions: [],
      deadlines: [],
      action_items: [],
      meetings: []
    };
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
    const raw = await res.json();
    return raw.data || raw;
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
    const raw = await res.json();
    return raw.data || raw;
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

    const raw = await res.json();
    return raw.data || raw;
  },
};
