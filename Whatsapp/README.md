# Sentinel WhatsApp Adapter

The WhatsApp adapter connects **Sentinel — Community Knowledge Intelligence Platform** to WhatsApp groups and direct messages.

It provides the transport layer between WhatsApp and the Sentinel backend:

```text
WhatsApp
    ↓
Baileys Gateway
    ↓
Message Normalization
    ↓
Message Ingestion
    ↓
Sentinel Copilot API
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
- Sending questions to the Sentinel Copilot API
- Sending grounded responses back to WhatsApp
- Importing historical WhatsApp `.txt` exports
- Supporting both mock and real backend modes

The adapter intentionally does **not** implement retrieval, embeddings, LLM reasoning, contradiction detection, or knowledge-base logic. Those responsibilities belong to the Sentinel backend.

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
- [x] Mock Copilot responses
- [x] WhatsApp group replies
- [x] Real WhatsApp message sending
- [x] Single-message ingestion interface
- [x] Batch historical-message ingestion interface
- [x] WhatsApp `.txt` export parsing
- [x] Historical chat import command
- [x] Self-message protection
- [x] TypeScript build

### Not yet implemented

- [ ] Real Sentinel backend `/copilot/ask` integration testing
- [ ] Production ingestion endpoint integration
- [ ] API timeout and retry strategy
- [ ] Duplicate-message protection
- [ ] Conversation/group retrieval scoping
- [ ] Actual quoted WhatsApp replies
- [ ] More WhatsApp export date/locale formats
- [ ] Production deployment configuration

---

## Tech Stack

- **TypeScript**
- **Node.js**
- **Baileys**
- **dotenv**
- **tsx**
- **qrcode-terminal**

Baileys provides the WebSocket-based interface used to communicate with WhatsApp Web.

---

## Project Structure

```text
Whatsapp/
├── src/
│   ├── api/
│   │   ├── copilotApi.ts
│   │   └── ingestionApi.ts
│   │
│   ├── importers/
│   │   ├── whatsappExportParser.ts
│   │   └── importWhatsAppHistory.ts
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
Copilot API
```

The current production implementation is:

```text
BaileysGateway
```

A mock gateway can be used for local development and testing.

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
  WhatsApp Service
          ↓
    Ingestion API
          ↓
   Mention Detection
          ↓
      Copilot API
          ↓
   WhatsApp Response
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

This prevents the rest of the application from depending directly on Baileys message structures.

---

## Mention Detection

Sentinel supports two mention mechanisms.

### Literal text mention

```text
@sentinel What is the Milestone 1 deadline?
```

### Actual WhatsApp mention

A user can select the Sentinel-connected WhatsApp account using WhatsApp's mention UI.

Baileys provides the actual mentioned JID through WhatsApp message context metadata.

The adapter normalizes this into:

```ts
mentionedJids: string[]
```

The detector then checks:

```text
Literal @sentinel
        OR
Actual Sentinel JID mention
```

This allows the application to distinguish ordinary conversation from questions directed at Sentinel.

---

## Mock Mode

The adapter currently supports mock mode so WhatsApp development can continue before the Sentinel backend is available.

`.env`:

```env
WHATSAPP_USE_MOCK=true
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
```

In mock mode:

- Copilot responses come from local mock data.
- Ingestion is logged locally.
- No Sentinel backend is required.

Example response:

```text
Milestone 1 is due Tuesday, September 22, 2026 at 6:00 PM EAT.

Trust: CONFIRMED

Sources:
• WhatsApp Team Discussion: Milestone 1 submission deadline is Tuesday at 6:00 PM EAT.
```

---

## Backend Mode

When the Sentinel backend is available:

```env
WHATSAPP_USE_MOCK=false
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
```

The adapter expects the backend to provide:

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

The flow is:

```text
WhatsApp .txt Export
        ↓
whatsappExportParser
        ↓
WhatsAppMessage[]
        ↓
whatsappHistoryService
        ↓
ingestionApi.ingestMessages()
```

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
```

### Variables

| Variable | Description |
|---|---|
| `WHATSAPP_USE_MOCK` | Enables mock Copilot and ingestion behavior |
| `SENTINEL_API_BASE_URL` | Base URL of the Sentinel backend |

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
Successfully imported 3 WhatsApp messages.
```

---

## Security Considerations

The adapter handles potentially sensitive WhatsApp conversations.

Important rules:

- Never commit `.env`
- Never commit `auth_info/`
- Never expose WhatsApp authentication credentials
- Avoid logging message contents in production
- Restrict knowledge retrieval by conversation/group when the backend supports it
- Validate backend responses before sending them to WhatsApp
- Implement duplicate-message protection before production deployment
- Implement retry and timeout handling for backend failures

---

## Design Principles

### 1. Transport isolation

WhatsApp-specific behavior stays inside the adapter.

```text
WhatsApp
   ↓
Adapter
   ↓
Sentinel API
```

### 2. Normalization

Baileys-specific message structures are converted into the application's own `WhatsAppMessage` type.

### 3. Backend ownership

The adapter does not perform:

- Vector search
- Keyword search
- Embedding generation
- LLM reasoning
- Contradiction detection
- Trust classification
- Knowledge ranking

Those capabilities belong to Sentinel's backend.

### 4. Grounded responses

The final Sentinel response should follow the platform's core principle:

> **No evidence → no confident answer.**

Responses should include trust status and source information whenever available.

---

## Current Development Roadmap

### Phase 1 — WhatsApp transport

- [x] Connect WhatsApp
- [x] Receive messages
- [x] Normalize messages
- [x] Detect mentions
- [x] Send replies
- [x] Import historical conversations

### Phase 2 — Backend integration

- [ ] Connect real `/copilot/ask`
- [ ] Connect real ingestion endpoint
- [ ] Handle API timeouts
- [ ] Add retry strategy
- [ ] Validate API responses

### Phase 3 — Reliability

- [ ] Duplicate-message protection
- [ ] Idempotent ingestion
- [ ] Conversation scoping
- [ ] Better reconnect handling
- [ ] Production logging

### Phase 4 — Judge/demo experience

- [ ] Concise WhatsApp responses
- [ ] Trust indicators
- [ ] Source citations
- [ ] Actual quoted replies
- [ ] Catch-up and deadline intelligence
- [ ] End-to-end live demo

---

## License

This adapter is part of the Sentinel project and is intended for the UniPod Hackathon 2026 project.

### Third-Party Notice

This project uses Baileys to communicate with WhatsApp Web. Baileys is an independent open-source project and is not affiliated with or officially endorsed by WhatsApp.

Use the integration responsibly and in accordance with applicable platform terms and policies.