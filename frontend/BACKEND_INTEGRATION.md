# Sentinel Backend Integration Guide

## 1. Environment Configuration
Set in `.env`:
```bash
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 2. Required Endpoints & Contracts

### POST `/chat`
Submits a query against the knowledge base.

**Request Body:**
```json
{
  "message": "When is the milestone 1 submission deadline?",
  "scope": "cohort_1",
  "session_id": "optional-uuid"
}
```

**Expected Response (200 OK):**
```json
{
  "answer": "Milestone 1 is due next Friday at 11:59 PM.",
  "trust_status": "confirmed",
  "citations": [
    {
      "source_id": "src-101",
      "chunk_id": "chk-202",
      "quote": "Milestone 1 deadline: Friday Oct 24, 23:59 EAT"
    }
  ],
  "session_id": "uuid"
}
```

---

### GET `/catch-up`
Retrieves temporal operational synthesis.

**Query Parameters:**
* `days`: integer (e.g. `?days=3` or `?from=ISO&to=ISO`)
* `scope`: string (e.g. `&scope=cohort_1`)

**Expected Response (200 OK):**
```json
{
  "time_range": "Last 3 days",
  "announcements": [
    { "id": "a-1", "title": "...", "content": "...", "date": "...", "source_id": "..." }
  ],
  "decisions": [
    { "id": "d-1", "title": "...", "content": "...", "date": "...", "source_id": "..." }
  ],
  "deadlines": [
    { "id": "dl-1", "title": "...", "due_date": "...", "source_id": "..." }
  ],
  "action_items": [
    { "id": "ai-1", "task": "...", "assignee": "...", "status": "pending" }
  ]
}
```

---

### GET `/sources/{source_id}`
Returns evidence provenance for the Evidence Drawer.

**Expected Response (200 OK):**
```json
{
  "id": "src-101",
  "title": "Cohort 1 Onboarding Guidelines",
  "source_type": "document",
  "author": "Program Lead",
  "created_at": "2026-09-15T08:30:00Z",
  "raw_snippet": "Full source context or verbatim paragraph.",
  "authority_score": 0.95
}
```

---

### POST `/upload` (Admin Only)
Ingests unstructured source data into the vector database.

**Expected Payload (`multipart/form-data` or JSON):**
* `title`: `string`
* `source_type`: `"chat"` | `"document"` | `"transcript"` | `"announcement"`
* `raw_text`: `string`
* `access_scope`: `string` (e.g. `cohort_1`, `leads`)
* `author` (optional): `string`

**Expected Response (201 Created):**
```json
{
  "source_id": "src-102",
  "chunks_count": 14,
  "status": "indexed"
}
```
### POST `/audio/transcribe` (Section 6.7 Voice Pipeline on the PRD)
Converts browser-recorded audio chunks into plain text via Whisper before passing the transcribed query directly into the grounded `/chat` pipeline.

**Content-Type:** `multipart/form-data`

**Expected Payload (Form Data):**
* `file`: `File` (Binary audio stream, typically `audio/webm` or `audio/wav`)

**Expected Response (200 OK):**
```json
{
  "text": "When is the milestone 1 submission deadline?"
}
```

**Error Responses:**
* `400 Bad Request`:
  ```json
  { "detail": "No audio file provided or invalid codec." }
  ```
* `500 Internal Server Error`:
  ```json
  { "detail": "Whisper transcription failed." }
  ```
---

## 3. Auth & Role Expectations
* The frontend currently toggles role access via `AuthContext`.
* Production requires a JWT/Session cookie providing a verified claim (`role: "admin"` vs `role: "student"`).
* Non-admin attempts to access `POST /upload` must return `403 Forbidden`.
* Local and staging origins must allow CORS from `http://localhost:5173`.