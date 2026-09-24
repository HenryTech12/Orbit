# Sentinel WhatsApp Adapter

The WhatsApp adapter connects **Sentinel — Community Knowledge Intelligence Platform** to WhatsApp groups and direct messages.

It provides the transport and WhatsApp integration layer between WhatsApp and Sentinel's grounded knowledge system.

```text
WhatsApp
    ↓
Baileys Gateway
    ↓
Message Normalization
    ↓
Message Ingestion
    ↓
Local Knowledge / Sentinel Copilot API
    ↓
Grounded Answer + Trust + Sources
    ↓
WhatsApp Reply
```

---

## Quick start

If you want to run this locally in 5 minutes:

```powershell
# 1. Install dependencies
npm install

# 2. Pull the local embedding model (one-time, ~275 MB)
ollama pull nomic-embed-text

# 3. Copy .env.example and fill in your keys
copy .env.example .env
#    Then edit .env and set GROQ_API_KEY (required) and GEMINI_API_KEY (optional)

# 4. Add your WhatsApp .txt export
copy path\to\your\export.txt data\chat.txt

# 5. Start
npm run dev
#    Scan the QR with WhatsApp → Settings → Linked Devices → Link a Device
```

First startup embeds your entire knowledge base (roughly 3–5 minutes per 1,000 messages on CPU). After that, restarts are instant — embeddings are cached to `.cache/embeddings.json`.

If you get stuck, the sections below cover each piece in detail.

---

## Overview

The adapter is responsible for:

- Connecting a WhatsApp account to Sentinel
- Receiving incoming WhatsApp messages (text, voice notes, documents)
- Normalizing WhatsApp messages into a stable internal format
- Ingesting incoming messages into the Sentinel knowledge pipeline
- Detecting Sentinel mentions (literal and native WhatsApp mentions)
- Supporting historical WhatsApp `.txt` exports
- Retrieving relevant local WhatsApp evidence with time-aware and reference-aware search
- Generating grounded answers using Groq (primary) with Gemini as fallback
- Delivering answers as group replies, DM replies, or on-demand DMs
- Transcribing voice notes via Groq Whisper
- Sending stored documents (PDF, DOCX) back on request
- Providing admin-aware analytics and admin message lookup
- Supporting both local knowledge mode and real backend mode
- Protecting against duplicate message events
- Retrying transient processing and sending failures
- Supporting actual quoted WhatsApp replies

The adapter keeps WhatsApp-specific transport concerns separate from Sentinel's knowledge and reasoning components.

---

## Prerequisites

Before you start, you need:

| Requirement                 | Why                                     | Where to get it                                                  |
| --------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| **Node.js v20+**            | Runtime                                 | [nodejs.org](https://nodejs.org)                                 |
| **Ollama**                  | Local embedding model (semantic search) | [ollama.com](https://ollama.com)                                 |
| **Groq API key**            | Primary LLM (free tier available)       | [console.groq.com/keys](https://console.groq.com/keys)           |
| **Gemini API key**          | Fallback LLM (optional but recommended) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **A spare WhatsApp number** | The bot links to this account           | —                                                                |

Ollama is required for **semantic retrieval**. Without it, Sentinel falls back to keyword-only search, which is functional but noticeably worse at paraphrase and reference questions.

---

## Current Status

### Implemented and verified

**Transport & WhatsApp integration**

- [x] Baileys WhatsApp connection
- [x] Persistent WhatsApp authentication
- [x] QR-code pairing
- [x] Automatic reconnection
- [x] Incoming group messages
- [x] Incoming direct messages
- [x] Incoming voice notes (transcribed via Groq Whisper)
- [x] Incoming document messages (PDF, DOCX)
- [x] Message normalization
- [x] Sender identification (LID-aware, prefers real phone number)
- [x] Group/private chat detection
- [x] Message IDs
- [x] Timestamps
- [x] WhatsApp LID support
- [x] Native WhatsApp mention metadata
- [x] Quoted-message capture
- [x] `@sentinel` text detection (anywhere in the message)
- [x] Sentinel JID detection
- [x] Real WhatsApp message sending
- [x] Native WhatsApp mentions in replies (clickable `@name`)
- [x] Actual quoted WhatsApp replies
- [x] Document sending (PDF, DOCX)
- [x] Group replies
- [x] Direct-message replies
- [x] On-demand DM delivery (LLM-driven)
- [x] Group notification when a DM is sent

**Knowledge & retrieval**

- [x] Local WhatsApp history loading (multi-file `data/*.txt`)
- [x] WhatsApp `.txt` export parsing (US + EU date formats, system messages, stable IDs)
- [x] Historical chat import command
- [x] Official / meeting folder ingestion (`official/`, `meetings/`)
- [x] Live message ingestion (`live/live-messages.jsonl`)
- [x] PDF/DOCX text extraction and indexing
- [x] Document registry (`documents/registry.jsonl`)
- [x] **Hybrid retrieval: semantic (Ollama `nomic-embed-text`) + keyword (IDF-weighted)**
- [x] Chunked embeddings (long messages split for accuracy)
- [x] Persistent embedding cache (`.cache/embeddings.json`)
- [x] Live embedding of incoming messages
- [x] Time-aware retrieval (today / this week / last N days / upcoming / first / latest)
- [x] Explicit date windows ("summary of September 4")
- [x] Rolling chat window (last 20 messages / 15 min) for reference resolution
- [x] IDF-weighted keyword retrieval with synonyms and fuzzy matching
- [x] Bot filtering (other bots are never used as evidence or replied to)
- [x] Admin-aware retrieval boost

**Reasoning & answering**

- [x] Groq LLM (primary) with Gemini fallback
- [x] Grounded answers from retrieved evidence
- [x] Reasoning modes: grounded / inferred / general / none
- [x] Tiered trust: OFFICIAL / MEETING / ADMIN / MEMBER
- [x] Trust status output: CONFIRMED / DISPUTED / STALE / UNKNOWN
- [x] Honest self-doubt ("are you sure?" re-examines prior sources)
- [x] Small-talk and identity fast path
- [x] Acknowledgment handling ("okay", "got it", "👍")
- [x] Empty-message handling ("??", emoji-only)
- [x] Answer cache (10 minutes)
- [x] `/summary` command
- [x] "What did I miss?" catch-up normalization
- [x] Bare-mention friendly intro
- [x] Passive listening in groups (question + domain term triggers reply without mention)

**Analytics & admin tools**

- [x] Activity analytics (`/stats`, "top 10 posters", "who's most active this week")
- [x] Split leaderboards by admins and members
- [x] Members-only / admins-only filters
- [x] Native mentions in analytics (clickable)
- [x] Admin message lookup (`what did Diane last say?`, `first 3 messages from Gift`)
- [x] Admin list (`who are the admins?`)

**Reliability**

- [x] Single-message ingestion interface
- [x] Batch historical-message ingestion interface
- [x] Self-message protection
- [x] Duplicate-message event protection
- [x] Bounded in-memory duplicate tracking
- [x] Retry handling with exponential backoff
- [x] Graceful shutdown
- [x] Unsupported-media guard with friendly replies
- [x] TypeScript build

### Current local knowledge flow

The current development mode does not depend on the Sentinel backend.

```text
WhatsApp (live) + Exports + Official + Meetings + Documents
        ↓
WhatsApp Export Parser / Document Extractor / Voice Transcriber
        ↓
Local WhatsApp Knowledge Store (in-memory, persisted per source)
        ↓
Hybrid Retrieval (semantic vectors + keyword IDF)
        ↓
Groq (primary) / Gemini (fallback)
        ↓
Grounded Answer + Trust + Sources
        ↓
WhatsApp Reply (group, DM, or document)
```

### Not yet implemented

- [ ] Real Sentinel backend `/copilot/ask` end-to-end integration testing
- [ ] Production ingestion endpoint integration testing
- [ ] Conversation/group retrieval scoping on the backend side
- [ ] Persistent duplicate-message storage (still in-memory)
- [ ] Meeting transcription pipeline (Groq Whisper on audio files)
- [ ] Production deployment configuration
- [ ] Multi-tenant / multi-group knowledge scoping
- [ ] Reminders / scheduled notifications

---

## Tech Stack

- **TypeScript**
- **Node.js** (v20+)
- **Baileys** — WhatsApp Web transport
- **Groq SDK** — primary LLM provider + Whisper transcription (fast, free tier available)
- **`@google/genai`** — Gemini fallback
- **Ollama** with **`nomic-embed-text`** — local semantic embeddings (free, private, no API cost)
- **`pdf-parse`** (aliased to the maintained fork) — PDF text extraction
- **`mammoth`** — DOCX text extraction
- **dotenv**
- **tsx**
- **qrcode-terminal**

Baileys provides the WebSocket-based interface used to communicate with WhatsApp Web.

Groq is used as the primary LLM for grounded answer generation. Gemini serves as a fallback when Groq models are unavailable or rate-limited.

Ollama runs a local embedding model — no external API, no per-query cost, no chat data leaving your machine.

---

## Project Structure

```text
Whatsapp/
├── data/                        # WhatsApp .txt exports (gitignored)
├── official/                    # Approved official documents (.txt, .vtt)
├── meetings/                    # Meeting transcripts (.txt, .vtt)
├── live/                        # Live-ingested messages (gitignored)
│   └── live-messages.jsonl
├── documents/                   # Captured document files + registry (gitignored)
│   ├── registry.jsonl
│   └── {messageId}.pdf
├── .cache/                      # Embedding cache (gitignored)
│   └── embeddings.json
│
├── src/
│   ├── api/
│   │   ├── copilotApi.ts
│   │   └── ingestionApi.ts
│   │
│   ├── importers/
│   │   ├── whatsappExportParser.ts
│   │   └── importWhatsAppHistory.ts
│   │
│   ├── local/
│   │   ├── adminLookup.ts           # Admin message lookup + admin list
│   │   ├── analytics.ts             # Activity stats and leaderboards
│   │   ├── botFilter.ts             # Bot detection
│   │   ├── documentRegistry.ts      # Stored document lookup
│   │   ├── documentRequest.ts       # "send me the PDF" detection
│   │   ├── embedder.ts              # Ollama embedding wrapper
│   │   ├── embeddingCache.ts        # Persistent vector cache
│   │   ├── localCopilot.ts          # Main LLM pipeline
│   │   ├── localRetriever.ts        # Hybrid semantic + keyword retrieval
│   │   ├── testLocalCopilot.ts
│   │   ├── testLocalRetriever.ts
│   │   ├── timeQuery.ts             # Time-window + explicit-date detection
│   │   ├── trustedAdmins.ts         # Admin registry
│   │   └── whatsappKnowledgeStore.ts
│   │
│   ├── services/
│   │   ├── audioService.ts          # Voice note download + Groq Whisper
│   │   ├── baileysGateway.ts        # WhatsApp transport
│   │   ├── chatContext.ts           # Rolling chat window
│   │   ├── mediaService.ts          # Document download + text extraction
│   │   ├── messageHandler.ts        # Reply routing
│   │   ├── messageNormalizer.ts     # Baileys → WhatsAppMessage
│   │   ├── mentionDetector.ts
│   │   ├── whatsappGateway.ts       # Gateway interface
│   │   └── whatsappService.ts       # Ingest + document/voice capture
│   │
│   ├── types/
│   │   ├── sentinel.ts
│   │   └── whatsapp.ts
│   │
│   ├── utils/
│   │   └── retry.ts
│   │
│   └── index.ts
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Architecture

### Gateway abstraction

The adapter uses a gateway interface so the rest of the application does not depend directly on Baileys.

```text
WhatsApp Gateway
       ↓
normalized WhatsAppMessage
       ↓
processIncomingMessage()
       ↓
handleMessage()
       ↓
Local Copilot / Sentinel API
```

The current production WhatsApp transport implementation is `BaileysGateway`.

---

## Message Flow

Every incoming message follows this general flow:

```text
Incoming WhatsApp Message
          ↓
     BaileysGateway
          ↓
    Message Normalizer
          ↓
     WhatsAppMessage
          ↓
   Ingestion (live store)
          ↓
   Document/Voice Capture (if applicable)
          ↓
   Chat Context Recorder
          ↓
   Reply Router (handleMessage)
       ├─ Document request?
       ├─ Admin lookup?
       ├─ Analytics?
       ├─ /summary?
       ├─ Bare mention / empty?
       └─ Hybrid retrieval + LLM
          ↓
     Grounded Response
          ↓
      WhatsApp Reply
```

Messages are ingested **before** Sentinel decides whether to respond.

---

## Normalized Message

All incoming messages are converted into a common structure:

```ts
export interface WhatsAppMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
  mentionedJids?: string[];
  messageType?: string;
  rawMessage?: WAMessage;
  quotedText?: string;
  quotedSenderName?: string;
  quotedMessageId?: string;
  documentFileName?: string;
  documentMimetype?: string;
  documentSize?: number;
  audioDurationSec?: number;
}
```

The normalized structure prevents the rest of the application from depending directly on Baileys message structures.

---

## Mention Detection

Sentinel is triggered when **any** of these are true:

1. The message contains `@sentinel` **anywhere** in the text (case-insensitive)
2. WhatsApp's native mention UI tagged the bot's JID
3. The message is a quote-reply to one of Sentinel's own messages
4. The message contains the word "sentinel" plus a request signal (a `?` or an address like "hey", "please")

In DMs, mention detection is not required — every DM is for the bot.

---

## Passive Listening

In groups, Sentinel does not require a mention for every reply. It silently ingests all messages, and replies without a mention when a message looks like a genuine question in the programme's domain.

The first time this happens in a chat, Sentinel appends a hint:

```text
💡 Tip: you don't have to @ me — I listen for questions. But @sentinel works too.
```

After that, no more hints in that chat.

---

## Local Knowledge Mode

The current development configuration uses local knowledge sources while the Sentinel backend is being finalized.

`.env`:

```env
WHATSAPP_USE_MOCK=true
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Despite the historical `WHATSAPP_USE_MOCK` variable name, `true` currently enables the **local development path**.

### Local knowledge sources

| Folder       | Purpose                                       | Format                     |
| ------------ | --------------------------------------------- | -------------------------- |
| `data/`      | WhatsApp `.txt` exports                       | `.txt`                     |
| `official/`  | Approved announcements and official documents | `.txt`, `.vtt`             |
| `meetings/`  | Meeting notes and transcripts                 | `.txt`, `.vtt`             |
| `live/`      | Live-ingested group messages (auto)           | `.jsonl`                   |
| `documents/` | PDF/DOCX files captured in chat               | `.pdf`, `.docx` + registry |

Files in `official/` and `meetings/` can be dated for accurate time-aware retrieval:

```text
meetings/2026-09-22_wadhwani-session.txt
```

### Hybrid Retrieval

Sentinel uses two retrieval methods together:

1. **Semantic (vector) search** — every message is embedded with Ollama's `nomic-embed-text` model. Questions are matched by _meaning_, not literal words.
2. **Keyword (IDF-weighted) search** — traditional term matching with synonym expansion and fuzzy matching for typos.

The two scores are normalized and blended (60% vector, 40% keyword). Vector handles paraphrase and reference; keyword handles exact matches like names, dates, phone numbers, and specific jargon.

### Embedding pipeline

On first startup, Sentinel embeds your entire knowledge base:

```
data/ + official/ + meetings/ + documents/ + live/
        ↓
Chunk long messages (sentence-aware, ~500 chars)
        ↓
Embed each chunk via Ollama (nomic-embed-text, 768 dims)
        ↓
Cache to .cache/embeddings.json
        ↓
On subsequent startups: load from cache (fast)
```

- **First run:** ~3–5 minutes per 1,000 messages on CPU
- **Subsequent runs:** instant (cache hit)
- **New messages:** embedded live, ~80ms each
- **New documents:** embedded live when captured
- **Cache invalidation:** content-addressed, so restarts never re-embed unchanged messages

**If Ollama is unavailable**, Sentinel falls back to keyword-only retrieval and logs a warning. The bot still works — just with weaker paraphrase handling.

### Grounded generation

The retrieved evidence is passed to the LLM with a system prompt that enforces:

- Use only the provided evidence
- Reason, don't just quote
- Resolve pronouns and references from the recent chat window first
- Choose a mode: grounded / inferred / general / none
- Never invent facts
- Keep replies short and phone-friendly
- Include a `Trust:` line and `Sources:` when evidence was used
- Reply in the language of the question

This implements the core Sentinel principle:

> **No evidence → no confident answer.**

### LLM provider fallback

Sentinel tries models in order:

1. `openai/gpt-oss-120b` (Groq)
2. `openai/gpt-oss-20b` (Groq)
3. `llama-3.3-70b-versatile` (Groq)
4. `gemini-3.8-flash`
5. `gemini-3.7-flash`
6. `gemini-3.6-flash`

Transient failures (503, 429) trigger retries; permanent key errors disable that provider until restart.

---

## Voice Notes

WhatsApp voice messages are automatically:

1. Downloaded via Baileys
2. Transcribed with **Groq Whisper** (`whisper-large-v3-turbo`)
3. Treated as text and processed through the normal handler

The transcript flows through the same paths as typed messages — mentions, passive listening, DMs, everything.

Terminal shows:

```text
🎤 Transcribed voice note (5s): "what is the hackathon deadline"
```

---

## Document Handling

Sentinel captures PDF and DOCX files shared in chat:

1. Detects the document message
2. Downloads the file via Baileys
3. Saves it to `documents/{messageId}.pdf` (or `.docx`)
4. Extracts the text (`pdf-parse`, `mammoth`)
5. Stores metadata in `documents/registry.jsonl`
6. Embeds the extracted text and adds it to the knowledge store

**File size limit:** 25 MB.

**Supported formats:** PDF, DOCX.

### Sending a document back

Users can request a stored document by name:

```text
@sentinel send me the info pack
@sentinel give me the hackathon guidelines
@sentinel share the PDF again
```

Sentinel fuzzy-matches the request against the registry and sends the file back with a caption noting who originally shared it.

If no descriptive name is given, the most recent document is sent.

---

## Analytics

Sentinel supports activity analytics:

```text
DM: /stats
DM: top 10 posters
DM: who's the most active this week?
DM: exclude admins, only members
```

Responses split into two leaderboards — admins and members — with clickable WhatsApp mentions.

Analytics are **DM-only** by default to protect member privacy.

---

## Admin Message Lookup

```text
@sentinel what did Diane last say?
@sentinel first 3 messages from Gift
@sentinel last 5 messages from Munira
@sentinel any admin latest message
@sentinel who are the admins?
```

Responds with the actual stored messages. Cap is **5 messages per request**.

---

## DM Delivery

When a user asks Sentinel to send something privately ("DM me the deadline"), Sentinel:

1. Sends a short notification in the group: `📩 Sent to @<requester> in DM.`
2. Sends the full answer (with sources) in a private DM

**Guardrails:** DMs only trigger on explicit request with a mention, and always go to the requesting user.

---

## Backend Mode

When the Sentinel backend is available:

```env
WHATSAPP_USE_MOCK=false
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
```

Expected endpoints:

```text
POST /copilot/ask
POST /ingestion/whatsapp
POST /ingestion/whatsapp/batch
```

---

## Historical WhatsApp Import

WhatsApp conversations can be exported as `.txt` files and imported.

### Example export

```text
[18/09/2026, 10:15] Alice: The project deadline is Friday.
[18/09/2026, 10:20] Bob: John will prepare the report.
[18/09/2026, 10:25] Alice: Please send it before 5 PM.
```

### Import command

```powershell
npm run import:whatsapp -- .\chat.txt
```

The parser supports:

- US (`M/D/YY`) and European (`D/M/YYYY`) date formats — auto-detected
- 12-hour AM/PM and 24-hour time formats
- System messages (`X joined via invite link`)
- Multi-line messages
- Stable message IDs (so the embedding cache survives restarts)

---

## Copilot Responses

```text
Answer

Trust: CONFIRMED

Sources:
• WhatsApp — Sender: relevant source excerpt
```

`Trust:` and `Sources:` are only shown when the answer used evidence.

| Level       | Meaning                                      |
| ----------- | -------------------------------------------- |
| `CONFIRMED` | Backed by OFFICIAL / MEETING / ADMIN sources |
| `DISPUTED`  | Sources conflict on a date or fact           |
| `STALE`     | Evidence exists but is old                   |
| `UNKNOWN`   | No confident answer, or chat reply only      |

---

## Catch-Up Questions

```text
@sentinel What did I miss?
```

Normalized into a more explicit query covering recent updates, decisions, deadlines, action items, and meetings.

---

## Unsupported Media

Text, voice notes, and documents (PDF, DOCX) are supported.

For other media (images, video) that are explicitly addressed to Sentinel, the adapter replies:

```text
Sentinel currently supports text, voice notes and documents only.
```

---

## Duplicate Message Protection

In-memory set of processed message keys, bounded to prevent unbounded memory growth. Persistent idempotency is still required for production deployment.

---

## Retry Handling

Transient failures retry up to three attempts with exponential backoff.

---

## Actual Quoted Replies

Sentinel can send its response as an actual WhatsApp quoted reply, making it clear which message it's answering.

---

## Authentication

Baileys authentication state is stored locally in `auth_info/`. **Never commit this directory.**

---

## Environment Variables

Create `.env`:

```env
# Required
WHATSAPP_USE_MOCK=true
GROQ_API_KEY=your_groq_api_key

# Recommended
GEMINI_API_KEY=your_gemini_api_key
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1

# Optional
IGNORED_SENDERS=+251970555577,UniConnect-BOT,Jymns BOT,Nexus Bot
LOG_SKIPS=false
LLM_MODELS=openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash
OLLAMA_URL=http://localhost:11434
EMBED_MODEL=nomic-embed-text
CHAT_TIMEZONE=Africa/Nairobi
```

### Variables

| Variable                | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `WHATSAPP_USE_MOCK`     | `true` = local knowledge mode; `false` = route to the Sentinel backend  |
| `SENTINEL_API_BASE_URL` | Base URL of the Sentinel backend                                        |
| `GROQ_API_KEY`          | Groq API key — primary LLM provider and Whisper transcription           |
| `GEMINI_API_KEY`        | Gemini API key — fallback LLM provider (optional but recommended)       |
| `IGNORED_SENDERS`       | Comma-separated bot phone numbers or names to ignore                    |
| `LOG_SKIPS`             | When `true`, logs group messages Sentinel chose not to reply to         |
| `LLM_MODELS`            | Optional — override the model fallback chain                            |
| `OLLAMA_URL`            | Ollama server URL (default `http://localhost:11434`)                    |
| `EMBED_MODEL`           | Embedding model name (default `nomic-embed-text`)                       |
| `CHAT_TIMEZONE`         | IANA timezone used for all date computations (default `Africa/Nairobi`) |

Never commit `.env` or API keys.

---

## Installation

```powershell
npm install
```

Set up the prerequisites:

```powershell
# Install and start Ollama (one-time)
# Windows: download from https://ollama.com/download
# Linux: curl -fsSL https://ollama.com/install.sh | sh

# Pull the embedding model
ollama pull nomic-embed-text

# Verify
ollama list
```

Create `.env` from the example:

```powershell
copy .env.example .env
# Edit .env and fill in GROQ_API_KEY and GEMINI_API_KEY
```

---

## Development

```powershell
npm run dev
```

First startup:

1. Loads knowledge (data/, official/, meetings/, live/, documents/)
2. Embeds every message not in the cache — **this takes 3–5 minutes per 1,000 messages**
3. Prints the QR code
4. Scan with WhatsApp → Settings → Linked Devices → Link a Device

After the first embed, restarts are instant. You'll see:

```text
[vectors] Content keys matched: 3000/3000 (cache had 3000 entries)
[vectors] All 3000 from cache.
WhatsApp connected.
```

---

## Build

```powershell
npm run build
npm start
```

---

## Local Copilot Testing

Test the retriever:

```powershell
npx tsx src/local/testLocalRetriever.ts
```

Test the Copilot:

```powershell
npx tsx src/local/testLocalCopilot.ts
```

Test the embedder alone:

```powershell
npx tsx src/local/testEmbedder.ts
```

---

## Troubleshooting

**`Cannot find module 'pdf-parse'`**
Run `npm install` again. The repo uses an npm alias to the maintained fork:

```powershell
npm install pdf-parse@npm:@cedrugs/pdf-parse
```

**Re-embedding every restart**
The cache file is at `.cache/embeddings.json`. Check it exists and is 30–80 MB. If it's missing or tiny, embeddings aren't being saved. Delete `.cache/` and restart once — the full rebuild should then produce a proper cache.

**`Ollama not ready` in terminal**
Run `ollama serve` in another terminal, or restart the Ollama service. Verify with:

```powershell
curl.exe -s http://localhost:11434/api/tags
```

**QR code garbled**
Make the terminal as large as possible _before_ the QR appears. If it garbles, `Ctrl+C` and restart.

**Rate limit from Groq**
Free tier allows ~200k tokens/day. If you hit it, the bot falls back to Gemini, then to a polite message. Wait or switch to a paid tier.

---

## Security Considerations

- Never commit `.env`
- Never commit `auth_info/`
- Never commit `data/`, `live/`, `documents/`, `meetings/`, `official/`, `.cache/`
- Never expose WhatsApp authentication credentials
- Never expose `GROQ_API_KEY` or `GEMINI_API_KEY`
- Avoid logging message contents in production
- Restrict knowledge retrieval by conversation/group when the backend supports it
- Validate backend responses before sending them to WhatsApp
- Use persistent idempotency before production deployment
- Protect exported WhatsApp history because it may contain private conversations
- Do not deploy exported team data to an uncontrolled environment

The `.gitignore` should contain at minimum:

```gitignore
node_modules/
dist/
.env
auth_info/
data/
live/
documents/
meetings/
official/
.cache/
```

---

## Design Principles

### 1. Transport isolation

WhatsApp-specific behaviour stays inside the adapter.

### 2. Normalization

Baileys-specific message structures are converted into the application's own `WhatsAppMessage` type.

### 3. Grounded answers

The Copilot answers from retrieved evidence rather than relying on unsupported assumptions.

### 4. Evidence-first reasoning

> **No evidence → no confident answer.**

Trust levels and sources are shown when evidence is used, and hidden when it isn't.

### 5. Hybrid retrieval

Semantic search for meaning, keyword search for precision. Neither alone is sufficient.

### 6. Backend separation

In the final architecture, retrieval, embeddings, ranking, reasoning, contradiction detection, and trust classification belong to the Sentinel knowledge system. The current local mode performs lightweight retrieval locally because the backend is not yet available.

### 7. Adapter simplicity

The WhatsApp adapter should remain focused on WhatsApp connectivity, message normalization, ingestion, mention detection, request routing, response formatting, and WhatsApp delivery. Complex knowledge functionality should not permanently accumulate inside the WhatsApp adapter.

---

## Current Development Roadmap

### Phase 1 — WhatsApp transport ✅

- [x] Connect WhatsApp
- [x] Receive messages (text, voice, documents)
- [x] Normalize messages
- [x] Detect mentions
- [x] Send replies
- [x] Support quoted replies
- [x] Import historical conversations
- [x] Protect against duplicate events
- [x] Retry transient failures
- [x] Graceful shutdown

### Phase 2 — Local knowledge development ✅

- [x] Parse WhatsApp export (US + EU dates, system messages, stable IDs)
- [x] Load local WhatsApp history
- [x] Hybrid semantic + keyword retrieval
- [x] Time-aware retrieval with explicit date windows
- [x] Reference resolution via rolling chat window
- [x] Groq grounded generation (with Gemini fallback)
- [x] Source citations and tiered trust
- [x] Live message ingestion
- [x] End-to-end WhatsApp local knowledge flow
- [x] Admin message lookup
- [x] Activity analytics
- [x] DM delivery
- [x] Document capture and send-on-request
- [x] Voice note transcription (Groq Whisper)

### Phase 3 — Backend integration

- [ ] Connect real `/copilot/ask`
- [ ] Connect real ingestion endpoint
- [ ] Validate API responses
- [ ] Verify API timeout handling
- [ ] Verify retry behaviour against real backend failures
- [ ] Verify conversation/group scoping

### Phase 4 — Reliability and trust

- [ ] Meeting transcription pipeline (audio files)
- [ ] Persistent idempotency
- [ ] Evaluation dataset
- [ ] Hallucination testing
- [ ] Wrong-source testing
- [ ] Missing-information testing
- [ ] Reminders and scheduled notifications

### Phase 5 — Production deployment

- [ ] Production configuration
- [ ] Persistent storage for live messages and documents
- [ ] Multi-group knowledge scoping
- [ ] Monitoring and structured logging

---

## License

This adapter is part of the Sentinel project and is intended for the UniPod Hackathon 2026 project.

### Third-Party Notice

This project uses Baileys to communicate with WhatsApp Web. Baileys is an independent open-source project and is not affiliated with or officially endorsed by WhatsApp.

Use the integration responsibly and in accordance with applicable platform terms and policies.
