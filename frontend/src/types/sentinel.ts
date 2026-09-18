export type TrustStatus = 'CONFIRMED' | 'DISPUTED' | 'SUPERSEDED' | 'UNKNOWN';

export type SourceType = 'whatsapp' | 'otter' | 'pdf' | 'meeting_transcript' | 'announcement';

export interface Citation {
  citation_id: string;
  source_id: string;
  title: string;
  source_type: SourceType;
  author?: string;
  date: string; // ISO-8601
  snippet: string;
}

export interface StructuredFact {
  fact_type: 'deadline' | 'decision' | 'announcement' | 'action_item';
  title: string;
  due_date?: string; // ISO-8601
  citation_id: string;
}

export interface CopilotAskRequest {
  question: string;
  session_id?: string;
  scope?: string;
  filters?: {
    source_types?: SourceType[];
    date_from?: string;
    date_to?: string;
  };
}

export interface CopilotAskResponse {
  answer: string;
  status: TrustStatus;
  status_reason?: string;
  citations: Citation[];
  facts?: StructuredFact[];
}

export interface CatchUpRequest {
  from: string; // ISO-8601
  to: string;   // ISO-8601
  scope?: string;
}

export interface CatchUpAnnouncement {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  citation: Citation;
}

export interface CatchUpDecision {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  citation: Citation;
}

export interface CatchUpDeadline {
  id: string;
  title: string;
  due_date: string;
  status: 'UPCOMING' | 'PASSED';
  citation: Citation;
}

export interface CatchUpActionItem {
  id: string;
  task: string;
  assignee?: string;
  status: 'PENDING' | 'DONE';
  citation: Citation;
}

export interface CatchUpMeeting {
  id: string;
  title: string;
  date: string;
  key_topics: string[];
  transcript_source_id: string;
}

export interface CatchUpResponse {
  summary_period: {
    from: string;
    to: string;
    total_updates: number;
  };
  announcements: CatchUpAnnouncement[];
  decisions: CatchUpDecision[];
  deadlines: CatchUpDeadline[];
  action_items: CatchUpActionItem[];
  meetings: CatchUpMeeting[];
}

export interface SourceDetail {
  source_id: string;
  title: string;
  source_type: SourceType;
  author?: string;
  source_timestamp: string;
  ingested_at: string;
  access_scope: string;
  authority_score: number;
  context_text: string;
  metadata?: Record<string, any>;
}

export interface UploadSourceResponse {
  source_id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  message: string;
  filename: string;
  created_at: string;
}