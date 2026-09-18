import type{
  CopilotAskRequest,
  CopilotAskResponse,
  CatchUpRequest,
  CatchUpResponse,
  SourceDetail,
  UploadSourceResponse
} from '@/types/sentinel';
import { MOCK_ASK_RESPONSE, MOCK_CATCHUP_RESPONSE, MOCK_SOURCE_DETAIL } from './mockData';

// Set this to false once the backend service is deployed
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
  
export const sentinelApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600)); // Simulate realistic network latency
      return MOCK_ASK_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/copilot/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Copilot API error: ${res.statusText}`);
    return res.json();
  },

  async catchUp(payload: CatchUpRequest): Promise<CatchUpResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 800));
      return MOCK_CATCHUP_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/copilot/catch-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Catch-Up API error: ${res.statusText}`);
    return res.json();
  },

  async getSource(sourceId: string): Promise<SourceDetail> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 300));
      return { ...MOCK_SOURCE_DETAIL, source_id: sourceId };
    }

    const res = await fetch(`${API_BASE_URL}/sources/${sourceId}`);
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

    const res = await fetch(`${API_BASE_URL}/sources/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error: ${res.statusText}`);
    return res.json();
  }
};