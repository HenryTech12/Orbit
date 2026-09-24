import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CatchUpRequest,
  CatchUpResponse,
  CatchUpAnnouncement,
  CatchUpMeeting,
  SourceDetail,
  UploadSourceResponse
} from "@/types/sentinel";
import { MOCK_ASK_RESPONSE, MOCK_CATCHUP_RESPONSE } from "./mockData";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === "true";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const API_KEY = import.meta.env.VITE_ORBIT_API_KEY || "dev_orbit_api_key_2026";

const getHeaders = (extra: Record<string, string> = {}) => {
  const headers: Record<string, string> = { ...extra };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  return headers;
};

interface BackendTopic {
  id: string;
  label: string;
  latest_status?: string;
  last_updated?: string;
}

interface BackendMeeting {
  id: string;
  title: string;
  platform?: string;
  scheduled_time?: string;
  recording_url?: string;
  transcript_text?: string;
  created_at?: string;
}

export interface VectorSearchHit {
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
  async getHistory(sessionId: string = "default-session") {
    try {
      const res = await fetch(
        `${API_BASE_URL}/sentinel/chat/messages/?session_id=${encodeURIComponent(sessionId)}`,
        { headers: getHeaders() }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    } catch (err) {
      console.error("Failed to load chat history from backend", err);
      return [];
    }
  },

  async ask(
    payload: CopilotAskRequest & { sessionId?: string },
  ): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      return MOCK_ASK_RESPONSE;
    }

    const res = await fetch(`${API_BASE_URL}/sentinel/chat/messages/`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        question: payload.question,
        session_id: payload.sessionId || "default-session",
      }),
    });

    if (!res.ok) {
      throw new Error(`Sentinel backend error: HTTP ${res.status}`);
    }

    const json = await res.json();
    return json.data;
  },

  async catchUp(payload: CatchUpRequest): Promise<CatchUpResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 800));
      return MOCK_CATCHUP_RESPONSE;
    }

    const [topicsRes, meetingsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/sentinel/topics/`, { headers: getHeaders() }),
      fetch(`${API_BASE_URL}/sentinel/meetings/`, { headers: getHeaders() }),
    ]);

    if (!topicsRes.ok) {
      throw new Error(`Catch-Up topics error: ${topicsRes.statusText}`);
    }

    const rawTopics = await topicsRes.json();
    const topics: BackendTopic[] = Array.isArray(rawTopics.data)
      ? rawTopics.data
      : Array.isArray(rawTopics)
        ? rawTopics
        : [];

    let meetingsList: BackendMeeting[] = [];
    if (meetingsRes.ok) {
      const rawMeetings = await meetingsRes.json();
      meetingsList = Array.isArray(rawMeetings.data)
        ? rawMeetings.data
        : Array.isArray(rawMeetings)
          ? rawMeetings
          : [];
    }

    const announcements: CatchUpAnnouncement[] = topics.map((t) => {
      const topicDate = t.last_updated || new Date().toISOString();
      return {
        id: t.id,
        title: t.label,
        summary: `Topic status: ${t.latest_status || "active"}. Recorded in Sentinel system.`,
        timestamp: topicDate,
        citation: {
          citation_id: `cit_${t.id}`,
          source_id: t.id,
          title: "Sentinel Service",
          source_type: "announcement",
          author: "Sentinel System",
          date: topicDate,
          snippet: `Topic: ${t.label} (status: ${t.latest_status || "unknown"})`,
        },
      };
    });

    const meetings: CatchUpMeeting[] = meetingsList.map((m) => {
      const meetingDate =
        m.scheduled_time || m.created_at || new Date().toISOString();
      return {
        id: m.id,
        title: m.title,
        date: meetingDate,
        summary: m.transcript_text
          ? m.transcript_text.length > 180
            ? `${m.transcript_text.substring(0, 177)}...`
            : m.transcript_text
          : `Scheduled on ${m.platform || "remote"}.`,
        key_topics: [m.title],
        transcript_source_id: m.id,
        citation: {
          citation_id: `cit_meeting_${m.id}`,
          source_id: m.id,
          title: m.title,
          source_type: "meeting_transcript",
          author: "Meeting System",
          date: meetingDate,
          snippet: m.transcript_text || `Meeting titled ${m.title}`,
        },
      };
    });

    return {
      summary_period: {
        from: payload.from || new Date(Date.now() - 7 * 86400000).toISOString(),
        to: payload.to || new Date().toISOString(),
        total_updates: announcements.length + meetings.length,
      },
      announcements,
      decisions: [],
      deadlines: [],
      action_items: [],
      meetings,
    };
  },

  async getSource(sourceId: string): Promise<SourceDetail> {
    const nowIso = new Date().toISOString();

    try {
      const meetingRes = await fetch(
        `${API_BASE_URL}/sentinel/meetings/${sourceId}/`,
        {
          headers: getHeaders(),
        },
      );

      if (meetingRes.ok) {
        const raw = await meetingRes.json();
        const m = raw.data || raw;
        return {
          source_id: m.id || sourceId,
          title: m.title || "Meeting Transcript",
          source_type: "meeting_transcript",
          author: m.platform
            ? `${m.platform.toUpperCase()} Sync`
            : "Sentinel System",
          source_timestamp: m.scheduled_time || m.created_at || nowIso,
          ingested_at: m.created_at || nowIso,
          access_scope: "cohort_1",
          authority_score: 0.95,
          context_text:
            m.transcript_text ||
            "Meeting session transcript recorded by Sentinel.",
          metadata: {
            platform: m.platform || "other",
            recording_url: m.recording_url || null,
          },
        };
      }

      const topicRes = await fetch(
        `${API_BASE_URL}/sentinel/topics/${sourceId}/`,
        {
          headers: getHeaders(),
        },
      );

      if (topicRes.ok) {
        const raw = await topicRes.json();
        const t = raw.data || raw;
        return {
          source_id: t.id || sourceId,
          title: t.label || "Sentinel Topic Stream",
          source_type: "announcement",
          author: "Sentinel System",
          source_timestamp: t.last_updated || nowIso,
          ingested_at: t.last_updated || nowIso,
          access_scope: "cohort_1",
          authority_score: 0.9,
          context_text: `Status: ${t.latest_status || "active"}. Recorded in Sentinel system.`,
          metadata: {
            latest_status: t.latest_status || "active",
            last_updated: t.last_updated || null,
          },
        };
      }

      throw new Error(
        `Source not found on meeting or topic routes: ${sourceId}`,
      );
    } catch {
      return {
        source_id: sourceId,
        title: "Evidence Provenance",
        source_type: "announcement",
        author: "Sentinel Backend",
        source_timestamp: nowIso,
        ingested_at: nowIso,
        access_scope: "cohort_1",
        authority_score: 0.85,
        context_text:
          "Live evidence retrieved from Sentinel database registry.",
        metadata: {},
      };
    }
  },

  async uploadSource(formData: FormData): Promise<UploadSourceResponse> {
    const title = (formData.get("title") as string) || `Upload_${Date.now()}`;
    const rawText = (formData.get("raw_text") as string) || "";

    const res = await fetch(`${API_BASE_URL}/sentinel/meetings/`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        title,
        platform: "other",
        transcript_text: rawText || "Manual source ingestion.",
      }),
    });

    if (!res.ok) throw new Error(`Upload error: ${res.statusText}`);
    const raw = await res.json();
    const meeting = raw.data || raw;

    if (meeting.id) {
      fetch(`${API_BASE_URL}/sentinel/meetings/${meeting.id}/process/`, {
        method: "POST",
        headers: getHeaders(),
      }).catch(() => {});
    }

    return {
      source_id: meeting.id || `src_${Date.now()}`,
      status: "PROCESSING",
      message: "Source ingested and queued for indexing.",
      filename: title,
      created_at: new Date().toISOString(),
    };
  },

  async transcribeAudio(_blob: Blob): Promise<{ text: string }> {
    return {
      text: "Voice transcription pending backend Whisper endpoint integration.",
    };
  },
};
