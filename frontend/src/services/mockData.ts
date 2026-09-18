import type { CopilotAskResponse, CatchUpResponse, SourceDetail } from '@/types/sentinel';

export const MOCK_ASK_RESPONSE: CopilotAskResponse = {
  answer: "The submission deadline for the AI assignment has been moved to Tuesday, September 22, 2026, at 6:00 PM EAT. An earlier WhatsApp message indicated Monday, but Dr. Abebe confirmed the extension during the Cohort Sync.",
  status: "SUPERSEDED",
  status_reason: "Cohort Sync Session (Sept 15) supersedes the earlier WhatsApp chat (Sept 12).",
  citations: [
    {
      citation_id: "cit_1",
      source_id: "src_otter_sync_01",
      title: "Cohort 1 Sync Session",
      source_type: "otter",
      author: "Dr. Abebe (Lead Instructor)",
      date: "2026-09-15T10:30:00Z",
      snippet: "We have extended the assignment deadline to Tuesday, September 22, 2026 at 6:00 PM EAT for everyone."
    },
    {
      citation_id: "cit_2",
      source_id: "src_wa_general_01",
      title: "Cohort 1 General Group",
      source_type: "whatsapp",
      author: "Student Rep",
      date: "2026-09-12T16:10:00Z",
      snippet: "Initial submission was supposed to be Monday."
    }
  ],
  facts: [
    {
      fact_type: "deadline",
      title: "AI Assignment Submission",
      due_date: "2026-09-22T18:00:00+03:00",
      citation_id: "cit_1"
    }
  ]
};

export const MOCK_CATCHUP_RESPONSE: CatchUpResponse = {
  summary_period: {
    from: "2026-09-08T00:00:00Z",
    to: "2026-09-18T23:59:59Z",
    total_updates: 4
  },
  announcements: [
    {
      id: "ann_1",
      title: "Hackathon Submission Guidelines Released",
      summary: "Repositories must include a 3-minute Loom video link and a standardized README.",
      timestamp: "2026-09-16T09:00:00Z",
      citation: {
        citation_id: "cit_ann_1",
        source_id: "src_pdf_guidelines",
        title: "Official Announcement PDF",
        source_type: "pdf",
        author: "Program Coordinator",
        date: "2026-09-16T09:00:00Z",
        snippet: "All submissions require a 3-minute video pitch alongside the GitHub link."
      }
    }
  ],
  decisions: [
    {
      id: "dec_1",
      title: "Frontend Architecture Finalized",
      summary: "Team confirmed Next.js + Tailwind CSS will be used for all dashboard and catch-up views.",
      timestamp: "2026-09-14T15:00:00Z",
      citation: {
        citation_id: "cit_dec_1",
        source_id: "src_otter_sync_01",
        title: "Tech Lead Sync",
        source_type: "otter",
        author: "Tech Lead",
        date: "2026-09-14T15:00:00Z",
        snippet: "We will proceed with Next.js App Router for all frontend deliveries."
      }
    }
  ],
  deadlines: [
    {
      id: "dl_1",
      title: "Hackathon Final Code Freeze",
      due_date: "2026-09-20T18:00:00+03:00",
      status: "UPCOMING",
      citation: {
        citation_id: "cit_dl_1",
        source_id: "src_pdf_guidelines",
        title: "Official Schedule",
        source_type: "pdf",
        author: "Organizing Committee",
        date: "2026-09-10T12:00:00Z",
        snippet: "All repositories will be locked at 18:00 EAT on September 20."
      }
    }
  ],
  action_items: [
    {
      id: "act_1",
      task: "Verify WhatsApp webhook endpoint with test sandbox",
      assignee: "Backend Team",
      status: "PENDING",
      citation: {
        citation_id: "cit_act_1",
        source_id: "src_wa_general_01",
        title: "Standup Notes",
        source_type: "whatsapp",
        author: "Mamadou",
        date: "2026-09-17T08:30:00Z",
        snippet: "Mamadou to complete webhook validation by Friday."
      }
    }
  ],
  meetings: [
    {
      id: "meet_1",
      title: "Cohort 1 Sync - Architecture Finalization",
      date: "2026-09-15T10:00:00Z",
      key_topics: ["API Contracts", "Deadline extensions", "Demo priorities"],
      transcript_source_id: "src_otter_sync_01"
    }
  ]
};

export const MOCK_SOURCE_DETAIL: SourceDetail = {
  source_id: "src_otter_sync_01",
  title: "Cohort 1 Sync Session",
  source_type: "otter",
  author: "Dr. Abebe (Lead Instructor)",
  source_timestamp: "2026-09-15T10:30:00Z",
  ingested_at: "2026-09-15T11:05:12Z",
  access_scope: "cohort_1",
  authority_score: 3,
  context_text: "Dr. Abebe: Welcome everyone. Let us address the scheduling friction regarding the assignment.\n\nDr. Abebe: We have extended the assignment deadline to Tuesday, September 22, 2026 at 6:00 PM EAT for everyone.\n\nStudent: Does this include the bonus task?\nDr. Abebe: Yes, everything is due at that time.",
  metadata: {
    duration_minutes: 58,
    platform: "Zoom + Otter.ai"
  }
};