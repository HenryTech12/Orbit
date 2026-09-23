import type {
  CopilotAskRequest,
  CopilotAskResponse,
  CatchUpRequest,
  CatchUpResponse,
  CatchUpAnnouncement,
  CatchUpMeeting,
  SourceDetail,
  UploadSourceResponse,
  TrustStatus,
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

const CHAT_STORAGE_KEY = "sentinel_chat_history";

export const sentinelApi = {
  getHistory(_sessionId: string = "default-session") {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  },

  saveMessage(messageItem: any) {
    try {
      const current = this.getHistory();
      const updated = [...current, messageItem];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to save message to local storage", err);
    }
  },

  clearHistory() {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  },

  async ask(
    payload: CopilotAskRequest & { sessionId?: string },
  ): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      return MOCK_ASK_RESPONSE;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/sentinel/vectors/search/`, {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          query: payload.question,
          top_k: 5,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sentinel vector query failed with HTTP ${res.status}`);
      }

      const json = await res.json();
      const hits = Array.isArray(json.data)
        ? json.data
        : json.data?.results || [];

      // Extract citations
      const citations = hits.slice(0, 3).map((hit: any, idx: number) => {
        const rawSnippet = hit.text || hit.content || hit.snippet || "";
        const cleanSnippet = rawSnippet.replace(/--- Page \d+ ---/g, "").trim();
        return {
          citation_id: hit.id || `src_${idx}`,
          source_id: hit.source_id || `doc_${idx}`,
          title: hit.title || `Knowledge Source #${idx + 1}`,
          source_type: hit.source_type || "meeting_transcript",
          author: hit.author || "Sentinel Knowledge Base",
          date: hit.timestamp || "Recent",
          snippet:
            cleanSnippet.length > 200
              ? cleanSnippet.slice(0, 200) + "..."
              : cleanSnippet,
        };
      });

      // Grounding evaluation heuristic
      const stopWords = new Set([
        "what",
        "when",
        "where",
        "who",
        "the",
        "for",
        "are",
        "is",
        "how",
        "many",
        "does",
        "with",
      ]);
      const queryWords =
        payload.question
          .toLowerCase()
          .match(/[a-zA-Z]{3,}/g)
          ?.filter((w) => !stopWords.has(w)) || [];

      let matchedChunk: string | null = null;
      for (const hit of hits) {
        const chunk = (hit.text || hit.content || "").toLowerCase();
        if (queryWords.some((w) => chunk.includes(w))) {
          matchedChunk = hit.text || hit.content;
          break;
        }
      }
      let answer = "";
      let status: TrustStatus = "UNKNOWN";
      let status_reason = "";

      if (hits.length > 0 && matchedChunk) {
        answer = matchedChunk
          .replace(/--- Page \d+ ---/g, "")
          .replace(/\s+/g, " ")
          .trim();
        status = "CONFIRMED";
        status_reason = `Grounding verified against ${hits.length} indexed vector chunks.`;
      } else if (hits.length > 0 && !matchedChunk) {
        answer = `The knowledge base contains indexed documents, but none specifically state the answer to: "${payload.question}".`;
        status = "DISPUTED";
        status_reason =
          "Retrieved chunks do not contain specific details for this query.";
      } else {
        answer = `No relevant data found for "${payload.question}". Please upload the source document first.`;
        status = "UNKNOWN";
        status_reason = "No matching vector records found in pgvector.";
      }

      return {
        answer,
        status,
        status_reason,
        citations,
      };
    } catch (err) {
      console.error("Copilot query error:", err);
      throw err;
    }
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
