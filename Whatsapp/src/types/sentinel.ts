export interface CopilotAskRequest {
  question: string;
  conversationId?: string;
  userId?: string;
  chatWindow?: string;
  quotedBlock?: string;
}

export interface Citation {
  sourceId: string;
  sourceName: string;
  excerpt: string;
}

export interface CopilotAskResponse {
  answer: string;
  status: 'CONFIRMED' | 'DISPUTED' | 'STALE' | 'UNKNOWN';
  citations: Citation[];
  sendViaDM?: boolean;
}
