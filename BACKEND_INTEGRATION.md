# BACKEND_INTEGRATION.md — Henry's Service (Meetings / Topics / Meeting-Links / Vectors)

This documents the FastAPI service covering meeting ingestion, trust/contradiction
tracking, Zoom+Teams meeting-link detection, and vector search — for whoever is
integrating it (Django `orbit_app`, the WhatsApp bot, or the frontend).

**Base URL:** `https://<your-deployed-url>` (currently deployed with `ZOOM_BACKEND=real`
against a live Zoom account; Teams and embeddings remain on stub backends — see the
service's own README for why).

**Auth:** none yet. If this stays a separate service other components call over the
network (rather than being ported into `orbit_app`), add an API key check before
relying on it beyond internal testing.

**Interactive docs:** `GET /docs` (Swagger UI, auto-generated, always in sync with the
actual code).

---

## Health

```
GET /health
```
**200:**
```json
{"status": "ok"}
```

---

## Meetings — recording/transcript pipeline

### Create a meeting
```
POST /meetings/
```
**Body** (provide `recording_url` OR `transcript_text`, not necessarily both):
```json
{
  "title": "Wadhwani Session",
  "platform": "zoom",           // "zoom" | "teams" | "google_meet" | "other"
  "scheduled_time": "2026-09-22T19:00:00",
  "recording_url": "https://zoom.us/rec/...",
  "transcript_text": null
}
```
**201:** returns the created `Meeting` object (see shape below), `status: "pending"`.
**422:** neither `recording_url` nor `transcript_text` provided, or unknown `platform`.

### List / get meetings
```
GET /meetings/            -> 200, array of Meeting
GET /meetings/{id}        -> 200, single Meeting | 404 not found
```

### Process a meeting (transcribe → chunk → embed → store)
```
POST /meetings/{id}/process
```
**200:** `Meeting` with `status: "completed"`, `transcript_text` filled in, and
populated `chunks[]`.
**404:** meeting not found. **422:** meeting has neither transcript nor recording URL.

**Meeting object shape:**
```json
{
  "id": "uuid",
  "title": "string",
  "platform": "zoom | teams | google_meet | other",
  "scheduled_time": "iso8601 | null",
  "recording_url": "string | null",
  "transcript_text": "string | null",
  "status": "pending | processing | completed | failed",
  "created_at": "iso8601",
  "chunks": [
    {"id": "uuid", "text": "string", "start_time": "string | null", "end_time": "string | null", "speaker": "string | null"}
  ]
}
```

---

## Topics — trust status & contradiction detection

### Create a topic
```
POST /topics/
```
**Body:** `{"label": "Submission Format"}`
**201:** `Topic` object, `latest_status: "unknown"` (no history yet).
**409:** a topic with that label already exists.

### Add a history entry (this is what drives trust status)
```
POST /topics/{id}/history
```
**Body:**
```json
{
  "source_type": "whatsapp",        // whatsapp | meeting_transcript | pdf
  "source_id": "optional-string",
  "value_snapshot": "Deadline moved to Friday.",
  "authority_level": "official",    // "official" | "general"
  "timestamp": "2026-09-19T10:00:00"   // optional, defaults to now
}
```
**200:** returns the `Topic` with `latest_status` recomputed:
- `unknown` — no history at all
- `disputed` — conflicting values recorded (checked before staleness)
- `stale` — single/consistent value, but older than `STALE_AFTER_DAYS` (default 5)
- `confirmed` — single/consistent value, recent

**404:** topic not found.

### Get the "what changed" narrative
```
GET /topics/{id}/changes
```
**200:**
```json
{
  "topic": { "id": "...", "label": "...", "latest_status": "disputed", "last_updated": "..." },
  "history": [ /* array of history entries, chronological */ ],
  "narrative": "First (Thu 17 Sep): \"...\" (general source) | Most recent (Fri 18 Sep): \"...\" (official source) | Current: \"...\""
}
```
Use `narrative` directly for the "what changed between X and Y" demo scenario —
it's already human-readable, no further formatting needed.

### List topics
```
GET /topics/    -> 200, array of Topic
```

---

## Meeting-links — Zoom + Teams detect → remind → auto-process

### Detect a meeting link + time in a raw chat message
```
POST /meeting-links/detect
```
**Body:**
```json
{
  "message": "Wadhwani session tomorrow at 3pm https://teams.microsoft.com/l/meetup-join/...",
  "reference_time": "2026-09-20T08:00:00"   // optional; "now" if omitted
}
```
**201:** returns a `MeetingDetection`:
```json
{
  "id": "uuid",
  "raw_message": "string",
  "platform": "zoom | teams | unknown",
  "meeting_url": "string | null",
  "platform_meeting_id": "string | null",
  "detected_datetime": "iso8601 | null",
  "title_guess": "string",
  "reminder_sent": false,
  "meeting_id": "uuid | null"    // filled in once the webhook links a real Meeting
}
```
If `detected_datetime` is present, a reminder is scheduled automatically
(`remind_at = detected_datetime - REMINDER_LEAD_MINUTES`, default 30 min).
**422:** no Zoom or Teams link found in the message at all.

### List detections
```
GET /meeting-links/detections   -> 200, array of MeetingDetection
```

### Reminders due now (poll this to actually send the reminder into the group)
```
GET /meeting-links/reminders/due
```
**200:** array of `{"id", "detection_id", "remind_at", "sent": false}` for reminders
whose time has arrived and haven't been marked sent yet.

### Mark a reminder as sent
```
POST /meeting-links/reminders/{reminder_id}/sent   -> 200 | 404
```

### Recording-ready webhook (Zoom `recording.completed` or Teams equivalent)
```
POST /meeting-links/webhook
```
**Body:**
```json
{
  "platform": "zoom",                    // "zoom" | "teams" — required
  "platform_meeting_id": "123456789",    // Zoom: numeric meeting ID. Teams: call record ID
  "detection_id": "uuid | null",         // optional — links back to a prior /detect call
  "topic": "Optional override title",
  "download_url": null,                  // optional override; otherwise fetched from the platform API
  "start_time": "2026-09-22T19:00:00"
}
```
**201:** creates a `Meeting`, fetches the recording via the real Zoom API (or the
Teams stub — see note below), and runs it through the full transcribe → chunk →
embed → store pipeline **synchronously**, in one call. Returns the completed
`Meeting` object (same shape as above), with real chunks if the pipeline succeeded.
**404:** `detection_id` provided but not found.
**422:** `platform` is anything other than `"zoom"` or `"teams"`.

> **Current state (2026-09-20): Zoom is live and real** — `ZOOM_BACKEND=real` is
> configured with a working Server-to-Server OAuth app (`cloud_recording:read:*`
> scopes confirmed). Calling this endpoint with `platform: "zoom"` and a real
> meeting ID from that account fetches and processes an actual recording.
> **Teams remains stubbed** — real access needs an Azure AD app with admin
> consent on the tenant hosting the actual meetings, which nobody on the team
> currently has. Calling with `platform: "teams"` still works end-to-end, just
> against placeholder recording data.

---

## Vectors — search infrastructure

```
POST /vectors/search
```
**Body:** `{"query": "what did we decide about deployment", "top_k": 5}`
**200:**
```json
{
  "results": [
    {"chunk_id": "uuid", "meeting_id": "uuid", "text": "...", "score": 0.83}
  ]
}
```
This is nearest-neighbor search over stored chunks only — no LLM generation, no
citations formatting. It's the retrieval building block for whoever owns the
Responder (currently Kamate's `feat/hybrid-retrieval-responder`); if that
Responder ends up calling this service instead of duplicating vector storage,
this is the endpoint to hit.

---

## Known overlap to resolve with the rest of the team

- **`topics` / `topic_history` exists both here and in the Django `orbit_app`
  restructure.** These need to be reconciled to one source of truth before final
  submission — either this service owns trust-status/contradiction logic and
  Django calls it, or the logic gets ported into `orbit_app` and this service's
  topics endpoints are retired.
- **No `meetings` / meeting-link tables exist in `orbit_app` yet** — this service
  is currently the only place the Zoom/Teams detection + auto-processing feature
  lives. Needs an explicit integration decision (call this service from Django,
  or port the logic in) rather than staying undecided.
