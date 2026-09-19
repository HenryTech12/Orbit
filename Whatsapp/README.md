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

## Overview

The adapter is responsible for:

- Connecting a WhatsApp account to Sentinel
- Receiving incoming WhatsApp messages
- Normalizing WhatsApp messages into a stable internal format
- Ingesting incoming messages into the Sentinel knowledge pipeline
- Detecting Sentinel mentions
- Supporting historical WhatsApp `.txt` exports
- Retrieving relevant local WhatsApp evidence
- Generating grounded answers using Gemini in local mode
- Sending grounded responses back to WhatsApp
- Supporting both local knowledge mode and real backend mode
- Protecting against duplicate message events
- Retrying transient processing and sending failures
- Supporting actual quoted WhatsApp replies

The adapter keeps WhatsApp-specific transport concerns separate from Sentinel's knowledge and reasoning components.

---

## Current Status

### Implemented and verified

- [x] Baileys WhatsApp connection
- [x] Persistent WhatsApp authentication
- [x] QR-code pairing
- [x] Automatic reconnection
- [x] Incoming group messages
- [x] Incoming direct messages
- [x] Message normalization
- [x] Sender identification
- [x] Group/private chat detection
- [x] Message IDs
- [x] Timestamps
- [x] WhatsApp LID support
- [x] Actual WhatsApp mention metadata
- [x] `@sentinel` text detection
- [x] Sentinel JID detection
- [x] Local WhatsApp history loading
- [x] WhatsApp `.txt` export parsing
- [x] Historical chat import command
- [x] Local keyword/date-aware retrieval
- [x] Local Gemini Copilot
- [x] Grounded answers from exported WhatsApp history
- [x] Source citations in WhatsApp responses
- [x] Trust status output
- [x] `/summary` command
- [x] "What did I miss?" catch-up normalization
- [x] WhatsApp group replies
- [x] Direct-message replies
- [x] Real WhatsApp message sending
- [x] Actual quoted WhatsApp replies
- [x] Single-message ingestion interface
- [x] Batch historical-message ingestion interface
- [x] Self-message protection
- [x] Duplicate-message event protection
- [x] Bounded in-memory duplicate tracking
- [x] Retry handling with exponential backoff
- [x] Graceful shutdown
- [x] Unsupported-media guard
- [x] TypeScript build

### Current local knowledge flow

The current development mode does not depend on the Sentinel backend.

```text
WhatsApp .txt Export
        ↓
WhatsApp Export Parser
        ↓
Local WhatsApp Knowledge Store
        ↓
Keyword + Date-aware Retrieval
        ↓
Gemini
        ↓
Grounded Answer + Sources
        ↓
WhatsApp
```

The current exported team conversation contains **188 WhatsApp messages** and is used as the temporary local knowledge source while the backend is being finalized.

### Not yet implemented

- [ ] Real Sentinel backend `/copilot/ask` end-to-end integration testing
- [ ] Production ingestion endpoint integration testing
- [ ] Conversation/group retrieval scoping
- [ ] Persistent duplicate-message storage
- [ ] Persistent local knowledge database
- [ ] Semantic/vector retrieval in the local mode
- [ ] Robust conflict detection
- [ ] Dynamic trust classification
- [ ] Production deployment configuration

---

## Tech Stack

- **TypeScript**
- **Node.js**
- **Baileys**
- **Google Gemini API / `@google/genai`**
- **dotenv**
- **tsx**
- **qrcode-terminal**

Baileys provides the WebSocket-based interface used to communicate with WhatsApp Web.

Gemini is used by the temporary local Copilot mode to generate grounded answers from retrieved WhatsApp evidence.

---

## Project Structure

```text
Whatsapp/
├── data/
│   └── chat-orbit-team.txt
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
│   │   ├── localCopilot.ts
│   │   ├── localRetriever.ts
│   │   ├── testLocalCopilot.ts
│   │   ├── testLocalRetriever.ts
│   │   └── whatsappKnowledgeStore.ts
│   │
│   ├── mock/
│   │   └── mockData.ts
│   │
│   ├── services/
│   │   ├── baileysGateway.ts
│   │   ├── messageHandler.ts
│   │   ├── messageNormalizer.ts
│   │   ├── mentionDetector.ts
│   │   ├── whatsappGateway.ts
│   │   └── whatsappHistoryService.ts
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

The current production WhatsApp transport implementation is:

```text
BaileysGateway
```

A gateway abstraction also allows local development and testing without tightly coupling the application to the underlying WhatsApp transport.

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
    Message Ingestion
          ↓
    Mention Detection
          ↓
 Local Copilot / Backend Copilot
          ↓
     Grounded Response
          ↓
      WhatsApp Reply
```

Messages are ingested before Sentinel decides whether to respond.

This allows normal group conversations to become part of the knowledge pipeline while keeping Sentinel's response behavior restricted to explicitly addressed messages.

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
}
```

The normalized structure prevents the rest of the application from depending directly on Baileys message structures.

---

## Mention Detection

Sentinel supports two mention mechanisms.

### Literal text mention

```text
@sentinel What is the Milestone 1 deadline?
```

### Actual WhatsApp mention

A user can select the Sentinel-connected WhatsApp account using WhatsApp's mention UI.

The actual mentioned JID is available through WhatsApp message context metadata and is normalized into:

```ts
mentionedJids: string[]
```

The detector checks:

```text
Literal @sentinel
        OR
Actual Sentinel JID mention
```

This allows the application to distinguish ordinary conversation from questions directed at Sentinel.

---

## Local Knowledge Mode

The current development configuration uses the exported WhatsApp conversation as a local knowledge source while the Sentinel backend is being finalized.

`.env`:

```env
WHATSAPP_USE_MOCK=true
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
GEMINI_API_KEY=your_gemini_api_key
```

Despite the historical `WHATSAPP_USE_MOCK` variable name, `true` currently enables the **local development path**:

```text
WhatsApp
   ↓
Local WhatsApp History
   ↓
Local Retrieval
   ↓
Gemini
   ↓
Answer + Sources
```

The local mode does not require the Sentinel backend to answer questions.

### Local knowledge source

The current local knowledge source is:

```text
data/chat-orbit-team.txt
```

The export is parsed into normalized `WhatsAppMessage` objects and cached by the local knowledge store.

### Local retrieval

The local retriever currently performs lightweight retrieval using:

- normalized keyword matching
- intent-aware terms
- date-aware matching
- phrase matching
- relevance scoring
- timestamp-based tie breaking

For example:

```text
Question:
What did we plan for September 22?

Retrieved evidence:
Sept 22 — WhatsApp / integration

If API access is available:
WhatsApp → API → RAG → WhatsApp

If not:
Build the adapter interface and focus on the core product.
```

### Local Gemini Copilot

The retrieved WhatsApp evidence is passed to Gemini with grounding instructions.

The model is instructed to:

- Use only the supplied WhatsApp evidence
- Avoid outside knowledge
- Avoid inventing facts
- Prefer direct evidence
- State when evidence is insufficient
- Produce concise WhatsApp-friendly answers

This implements the core Sentinel principle:

> **No evidence → no confident answer.**

---

## Backend Mode

When the Sentinel backend is available:

```env
WHATSAPP_USE_MOCK=false
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
```

The adapter then routes Copilot requests to the Sentinel backend.

Expected endpoints:

```text
POST /copilot/ask
POST /ingestion/whatsapp
POST /ingestion/whatsapp/batch
```

The exact production API contract may be updated when the backend implementation is finalized.

---

## Historical WhatsApp Import

WhatsApp conversations can be exported as `.txt` files and imported into Sentinel.

This is useful for conversations that happened **before Sentinel joined the group**.

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

The import flow is:

```text
WhatsApp .txt Export
        ↓
whatsappExportParser
        ↓
WhatsAppMessage[]
        ↓
ingestionApi.ingestMessages()
```

The current team export successfully imports:

```text
188 WhatsApp messages
```

The parser supports multiline messages and WhatsApp exports containing 12-hour AM/PM timestamps.

---

## Copilot Responses

Sentinel formats Copilot responses for WhatsApp using:

```text
Answer

Trust: CONFIRMED

Sources:
• WhatsApp — Sender: relevant source excerpt
```

The current response pipeline provides source excerpts alongside generated answers so users can inspect the evidence behind a response.

Trust classification is currently being developed further and should not be treated as a final production-grade confidence system.

---

## `/summary`

The adapter supports a `/summary` command for team-level summary responses.

Example:

```text
/summary
```

The response includes:

```text
Summary

Trust: ...

Sources:
• ...
```

The command is part of the current development/demo functionality.

---

## Catch-Up Questions

The adapter recognizes catch-up questions such as:

```text
@sentinel What did I miss?
```

and normalizes them into a more explicit knowledge query covering:

- recent updates
- decisions
- deadlines
- action items
- meetings

This allows the Copilot layer to retrieve evidence relevant to team catch-up questions.

---

## Unsupported Media

The current Sentinel WhatsApp adapter is text-first.

For unsupported media messages that are explicitly addressed to Sentinel, the adapter returns:

```text
Sentinel currently supports text questions only.
Document and media understanding is not enabled yet.
```

Media without a usable text/caption does not trigger a Sentinel response.

Future versions may add document, image, audio, and video understanding.

---

## Duplicate Message Protection

The adapter protects against duplicate WhatsApp event processing using an in-memory set of processed message keys.

The key includes:

```text
remoteJid
participant
fromMe
message id
```

The set is bounded to prevent unbounded memory growth.

This protects against duplicate event delivery during the current process lifetime.

Persistent idempotency is still required for production deployment.

---

## Retry Handling

Transient processing and sending failures are handled through a retry helper using exponential backoff.

The current strategy retries up to three attempts.

Conceptually:

```text
Attempt 1
   ↓
failure
   ↓
wait
   ↓
Attempt 2
   ↓
failure
   ↓
wait longer
   ↓
Attempt 3
```

The backend and WhatsApp operations can therefore recover from some transient failures without immediately failing the entire message flow.

---

## Actual Quoted Replies

When responding to an incoming WhatsApp message, the adapter can send the response as an actual WhatsApp quoted reply.

Conceptually:

```text
User message
     ↓
Sentinel processing
     ↓
Quoted Sentinel response
```

This makes it clear which message Sentinel is answering, especially in active group conversations.

Baileys supports quoted messages through the `quoted` send option.

---

## Authentication

Baileys authentication state is stored locally in:

```text
auth_info/
```

This directory is intentionally excluded from Git.

Never commit WhatsApp authentication credentials.

The `.gitignore` contains:

```gitignore
node_modules/
dist/
.env
auth_info/
```

---

## Environment Variables

Create a local `.env` file:

```env
WHATSAPP_USE_MOCK=true
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
GEMINI_API_KEY=your_gemini_api_key
```

### Variables

| Variable | Description |
|---|---|
| `WHATSAPP_USE_MOCK` | Selects the current local development path when `true`; selects backend integration when `false` |
| `SENTINEL_API_BASE_URL` | Base URL of the Sentinel backend |
| `GEMINI_API_KEY` | API key used by the local Gemini Copilot |

Never commit the actual `.env` file or API keys.

---

## Installation

Install dependencies:

```powershell
npm install
```

---

## Development

Start the WhatsApp adapter:

```powershell
npm run dev
```

On first connection, a QR code will be displayed in the terminal.

Scan it from WhatsApp's **Linked Devices** settings.

After successful authentication:

```text
WhatsApp connected.
```

Authentication is persisted in `auth_info/`, so subsequent launches can reuse the session.

---

## Build

Compile TypeScript:

```powershell
npm run build
```

---

## Start Compiled Version

```powershell
npm start
```

---

## Historical Import

Import an exported WhatsApp conversation:

```powershell
npm run import:whatsapp -- .\chat.txt
```

Example successful output:

```text
Successfully imported 188 WhatsApp messages.
```

---

## Local Copilot Testing

Test the local retriever:

```powershell
npx tsx src/local/testLocalRetriever.ts
```

Test the local Gemini Copilot:

```powershell
npx tsx src/local/testLocalCopilot.ts
```

Example question:

```text
What did we plan for September 22?
```

Expected grounded answer:

```text
For September 22, the plan was WhatsApp / integration.

If API access is available:
WhatsApp → API → RAG → WhatsApp.

If API access is not available:
Build the adapter interface and focus on the core product.
```

---

## Security Considerations

The adapter handles potentially sensitive WhatsApp conversations.

Important rules:

- Never commit `.env`
- Never commit `auth_info/`
- Never expose WhatsApp authentication credentials
- Never expose `GEMINI_API_KEY`
- Avoid logging message contents in production
- Restrict knowledge retrieval by conversation/group when the backend supports it
- Validate backend responses before sending them to WhatsApp
- Use persistent idempotency before production deployment
- Protect exported WhatsApp history because it may contain private conversations
- Do not deploy exported team data to an uncontrolled environment

---

## Design Principles

### 1. Transport isolation

WhatsApp-specific behavior stays inside the adapter.

```text
WhatsApp
   ↓
Adapter
   ↓
Sentinel Knowledge System
```

### 2. Normalization

Baileys-specific message structures are converted into the application's own `WhatsAppMessage` type.

### 3. Grounded answers

The Copilot should answer from retrieved evidence rather than relying on unsupported assumptions.

```text
Question
   ↓
Retrieve evidence
   ↓
Grounded generation
   ↓
Answer + Sources
```

### 4. Evidence-first reasoning

The core Sentinel principle is:

> **No evidence → no confident answer.**

Responses should include source information whenever evidence is available.

### 5. Backend separation

In the final architecture, retrieval, embeddings, ranking, reasoning, contradiction detection, and trust classification belong to the Sentinel knowledge system.

The current local development mode temporarily performs lightweight retrieval locally because the backend is not yet available.

### 6. Adapter simplicity

The WhatsApp adapter should remain focused on:

- WhatsApp connectivity
- Message normalization
- Message ingestion
- Mention detection
- Copilot request routing
- Response formatting
- WhatsApp delivery

Complex knowledge functionality should not permanently accumulate inside the WhatsApp adapter.

---

## Current Development Roadmap

### Phase 1 — WhatsApp transport

- [x] Connect WhatsApp
- [x] Receive messages
- [x] Normalize messages
- [x] Detect mentions
- [x] Send replies
- [x] Support quoted replies
- [x] Import historical conversations
- [x] Protect against duplicate events
- [x] Retry transient failures
- [x] Graceful shutdown

### Phase 2 — Local knowledge development

- [x] Parse WhatsApp export
- [x] Load local WhatsApp history
- [x] Lightweight local retrieval
- [x] Date-aware retrieval
- [x] Gemini grounded generation
- [x] Source citations
- [x] Local Copilot testing
- [x] End-to-end WhatsApp local knowledge flow

### Phase 3 — Backend integration

- [ ] Connect real `/copilot/ask`
- [ ] Connect real ingestion endpoint
- [ ] Validate API responses
- [ ] Verify API timeout handling
- [ ] Verify retry behavior against real backend failures
- [ ] Verify conversation/group scoping

### Phase 4 — Reliability and trust

- [ ] Dynamic trust classification
- [ ] Conflict detection
- [ ] Stale-information detection
- [ ] Persistent idempotency
- [ ] Semantic/vector retrieval
- [ ] Evaluation dataset
- [ ] Hallucination testing
- [ ] Wrong-source testing
- [ ] Missing-information testing

### Phase 5 — Judge/demo experience

- [ ] Concise WhatsApp responses
- [ ] Trust indicators
- [ ] Source citations
- [ ] Catch-up intelligence
- [ ] Deadline intelligence
- [ ] Meeting intelligence
- [ ] End-to-end live demo
- [ ] Production deployment

---

## License

This adapter is part of the Sentinel project and is intended for the UniPod Hackathon 2026 project.

### Third-Party Notice

This project uses Baileys to communicate with WhatsApp Web. Baileys is an independent open-source project and is not affiliated with or officially endorsed by WhatsApp.

Use the integration responsibly and in accordance with applicable platform terms and policies.