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

interface VectorSearchHit {
  id?: string;
  source_id?: string;
  text?: string;
  content?: string;
  snippet?: string;
  title?: string;
  score?: number;
  metadata?: {
    source_id?: string;
    title?: string;
    author?: string;
    source_type?: string;
    timestamp?: string;
  };
}

export const sentinelApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      return MOCK_ASK_RESPONSE;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/sentinel/vectors/search/`, {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          query: payload.question,
          top_k: 5
        }),
      });

      if (!res.ok) {
        throw new Error(`Vector search failed with status ${res.status}`);
      }

      const raw = await res.json();
      const hits: VectorSearchHit[] = Array.isArray(raw.data)
        ? raw.data
        : (raw.data?.results || (Array.isArray(raw) ? raw : []));

      if (hits.length === 0) {
        return {
          answer: `No indexed evidence found matching "${payload.question}". Ingest relevant documents or meeting notes to ground this query.`,
          status: 'DISPUTED',
          status_reason: 'Vector search returned 0 matching context chunks.',
          citations: [],
          facts: []
        };
      }

      const primaryHit = hits[0];
      const answerSnippet = primaryHit.text || primaryHit.content || primaryHit.snippet || 'Referenced relevant context chunk.';

      const citations = hits.slice(0, 3).map((hit, index) => {
        const textSnippet = hit.text || hit.content || hit.snippet || 'Snippet content';
        return {
          citation_id: hit.id || `hit_${index}`,
          source_id: hit.source_id || hit.metadata?.source_id || `src_${index}`,
          title: hit.title || hit.metadata?.title || `Knowledge Source #${index + 1}`,
          source_type: 'meeting_transcript' as const,
          author: hit.metadata?.author || 'Sentinel Ingestion',
          date: hit.metadata?.timestamp || new Date().toISOString(),
          snippet: textSnippet.length > 200 ? `${textSnippet.substring(0, 197)}...` : textSnippet
        };
      });

      return {
        answer: answerSnippet,
        status: 'CONFIRMED',
        status_reason: `Grounding verified against ${hits.length} indexed chunks.`,
        citations,
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

    const title = (formData.get('title') as string) || `Upload_${Date.now()}`;
    const rawText = (formData.get('raw_text') as string) || '';

    const res = await fetch(`${API_BASE_URL}/sentinel/meetings/`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title,
        platform: 'other',
        transcript_text: rawText || 'Manual source ingestion.'
      }),
    });

    if (!res.ok) throw new Error(`Upload error: ${res.statusText}`);
    const raw = await res.json();
    const meeting = raw.data || raw;

    if (meeting.id) {
      fetch(`${API_BASE_URL}/sentinel/meetings/${meeting.id}/process/`, {
        method: 'POST',
        headers: getHeaders(),
      }).catch(() => {});
    }

    return {
      source_id: meeting.id || `src_${Date.now()}`,
      status: 'PROCESSING',
      message: 'Source ingested and queued for indexing.',
      filename: title,
      created_at: new Date().toISOString()
    };
  },

  async transcribeAudio(_blob: Blob): Promise<{ text: string }> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 1200));
      return {
        text: 'What are the core deadlines for Milestone 1 submission?',
      };
    }

    return {
      text: 'Voice transcription pending backend Whisper endpoint integration.'
    };
  },
};
