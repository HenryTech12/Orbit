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
- Running as a persistent Dockerized service
- Persisting WhatsApp authentication across container recreation
- Mounting local WhatsApp knowledge into the container as read-only data

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
- [x] Docker image build
- [x] Docker Compose deployment
- [x] Persistent Docker authentication volume
- [x] Read-only local WhatsApp history bind mount
- [x] Detached long-running Docker operation
- [x] Docker restart policy

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

### Current Docker flow

The local knowledge file is intentionally kept outside the Docker image and mounted at runtime.

```text
Host
│
├── .env
│
├── data/
│   └── chat-orbit-team.txt
│
└── Docker Compose
        │
        ▼
sentinel-whatsapp
        │
        ├── /app/auth
        │      └── Docker named volume
        │
        └── /app/data
               └── read-only bind mount
```

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
- [ ] Production monitoring
- [ ] Production secret management
- [ ] Multimodal document understanding

---

## Tech Stack

- **TypeScript**
- **Node.js 24**
- **Baileys**
- **Google Gemini API / `@google/genai`**
- **dotenv**
- **tsx**
- **qrcode-terminal**
- **Docker**
- **Docker Compose**

Baileys provides the WebSocket-based interface used to communicate with WhatsApp Web.

Gemini is used by the temporary local Copilot mode to generate grounded answers from retrieved WhatsApp evidence.

Docker Compose is used to run the adapter as a persistent service with named-volume and bind-mount storage.

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
├── data/
│   └── chat-orbit-team.txt
│
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
├── compose.yaml
├── Dockerfile
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

> `data/` contains private WhatsApp history and must remain excluded from Git. It is mounted into Docker at runtime rather than copied into the image.

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

Baileys authentication state is stored locally during non-Docker development in:

```text
auth_info/
```

This directory is intentionally excluded from Git.

In Docker, authentication is stored in the persistent named volume:

```text
whatsapp_auth
```

mounted at:

```text
/app/auth
```

Never commit WhatsApp authentication credentials.

The `.gitignore` contains:

```gitignore
node_modules/
dist/
.env
auth_info/
data/
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

Authentication is persisted in `auth_info/` during local development.

When running through Docker, authentication is instead persisted in the `whatsapp_auth` named volume.

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

# Docker Deployment

The adapter is Dockerized so it can run as a long-running service without keeping a terminal session attached.

The Docker deployment separates:

1. Application code inside the image
2. WhatsApp authentication in a persistent named volume
3. Local WhatsApp history in a host bind mount
4. Environment configuration in `.env`

The resulting architecture is:

```text
Host
│
├── .env
│
├── data/
│   └── chat-orbit-team.txt
│
└── Docker Compose
        │
        ▼
┌──────────────────────────────┐
│ sentinel-whatsapp            │
│                              │
│ Node.js 24                   │
│ Baileys                      │
│ Local Copilot                │
│ Compiled TypeScript          │
│                              │
│ /app/auth  ← named volume   │
│ /app/data  ← read-only bind │
└──────────────────────────────┘
```

Docker Compose supports named volumes and bind mounts as service volume types, and the Compose `read_only` mount option can make a mounted path read-only.

---

## Docker Prerequisites

Install:

- Docker Desktop
- Docker Compose

Verify:

```powershell
docker --version
```

and:

```powershell
docker compose version
```

---

## Dockerfile

The adapter uses a multi-stage Docker build.

### Build stage

```text
Node.js 24 Alpine
        ↓
npm ci
        ↓
TypeScript source
        ↓
npm run build
```

### Runtime stage

```text
Node.js 24 Alpine
        ↓
Production dependencies
        ↓
Compiled dist/
        ↓
node dist/index.js
```

Current `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies first for better Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled application
COPY --from=builder /app/dist ./dist

# The adapter is a long-running process
CMD ["node", "dist/index.js"]
```

---

## `.dockerignore`

The current `.dockerignore` is:

```text
node_modules
dist
.git
.gitignore

.env
.env.*
!.env.example

data/
*.log

.vscode/
.idea/

README.Docker.md
```

The WhatsApp history is intentionally excluded from the image because it is mounted at runtime.

This prevents private local WhatsApp data from being baked into the Docker image.

---

## Docker Compose

The current `compose.yaml` is:

```yaml
services:
  whatsapp:
    build:
      context: .
      dockerfile: Dockerfile

    container_name: sentinel-whatsapp

    env_file:
      - .env

    volumes:
      - whatsapp_auth:/app/auth
      - type: bind
        source: ./data
        target: /app/data
        read_only: true

    restart: unless-stopped

volumes:
  whatsapp_auth:
```

### Named authentication volume

The following:

```yaml
- whatsapp_auth:/app/auth
```

stores WhatsApp authentication outside the container's writable layer.

Named volumes are persistent data stores managed by the container engine.

### Read-only knowledge bind mount

The following:

```yaml
- type: bind
  source: ./data
  target: /app/data
  read_only: true
```

maps the host's `./data` directory into `/app/data` inside the container.

The application can read the WhatsApp history but cannot modify the mounted host data through this mount.

Docker supports read-only bind mounts for exactly this type of access pattern.

### Restart policy

The service uses:

```yaml
restart: unless-stopped
```

This allows Docker to restart the container after termination while respecting an intentional manual stop.

---

## Docker Environment

Docker loads environment variables from:

```yaml
env_file:
  - .env
```

The `.env` file should contain:

```env
WHATSAPP_USE_MOCK=true
SENTINEL_API_BASE_URL=http://localhost:8000/api/v1
GEMINI_API_KEY=your_gemini_api_key
```

Never commit `.env`.

Do not expose API keys through:

```powershell
docker compose config
```

or screenshots/logs.

Use safer configuration checks when necessary and never publish secret values.

---

## Docker Build

Build the image:

```powershell
docker build --no-cache --progress=plain -t sentinel-whatsapp:test .
```

Or build through Compose:

```powershell
docker compose build
```

---

## Start Docker Service

Start the adapter in detached mode:

```powershell
docker compose up -d
```

Check the service:

```powershell
docker compose ps
```

Expected status:

```text
NAME                IMAGE               COMMAND              SERVICE    STATUS
sentinel-whatsapp   ...                 ...                  whatsapp   Up
```

---

## View Docker Logs

Follow logs:

```powershell
docker compose logs -f whatsapp
```

View the latest logs:

```powershell
docker compose logs --tail=50 whatsapp
```

---

## Docker QR Authentication

On the first Docker startup, the adapter may display a WhatsApp QR code.

Scan it using:

```text
WhatsApp
→ Settings
→ Linked Devices
→ Link a Device
```

After successful pairing, the authentication state is stored in:

```text
whatsapp_auth
```

and mounted inside the container at:

```text
/app/auth
```

The authentication state is therefore not dependent on the lifecycle of the application container.

---

## Verify Local Data Inside Docker

Run:

```powershell
docker compose exec whatsapp ls -l /app/data
```

Expected file:

```text
chat-orbit-team.txt
```

This confirms that:

```text
Host ./data
      ↓
Container /app/data
```

is correctly mounted.

---

## Docker End-to-End Test

After starting the container and pairing WhatsApp, send:

```text
@sentinel What did we plan for September 22?
```

Expected processing:

```text
WhatsApp
    ↓
Baileys
    ↓
Message Normalization
    ↓
Message Ingestion
    ↓
Mention Detection
    ↓
Local Retrieval
    ↓
Gemini
    ↓
Grounded Answer
    ↓
Sources
    ↓
Quoted WhatsApp Reply
```

The local knowledge store should load:

```text
188 WhatsApp messages
```

and Gemini should generate an answer based on retrieved evidence.

---

## Docker Restart Test

Restart the service:

```powershell
docker compose restart whatsapp
```

Then check:

```powershell
docker compose logs --tail=30 whatsapp
```

The `whatsapp_auth` named volume should preserve the WhatsApp authentication state across a normal container restart.

Docker's `restart` command restarts the service container, while changes to the Compose configuration are not applied merely by running `docker compose restart`; use `docker compose up -d` when configuration changes need to be recreated.

---

## Docker Container Recreation Test

To recreate the container while preserving the named authentication volume:

```powershell
docker compose down
```

Then:

```powershell
docker compose up -d
```

The `whatsapp_auth` named volume is not removed by a normal `docker compose down`.

Docker's documentation specifies that named volumes are removed by `docker compose down` only when the `-v` / `--volumes` option is used.

---

## Important Docker Volume Warning

Do **not** use:

```powershell
docker compose down -v
```

unless you intentionally want to delete the persistent authentication volume.

The `-v` option removes named volumes declared by the Compose project.

For this adapter, removing the volume can remove the WhatsApp authentication state and require QR pairing again.

---

## Docker Data Architecture

The adapter uses two different storage mechanisms for two different purposes.

### WhatsApp authentication

```text
Docker named volume
        ↓
whatsapp_auth
        ↓
/app/auth
```

Purpose:

- Persistent authentication
- Container recreation persistence
- No authentication credentials in the image

### WhatsApp knowledge export

```text
Host directory
      ↓
./data
      ↓
read-only bind mount
      ↓
/app/data
```

Purpose:

- Keep private WhatsApp export outside the image
- Update local knowledge without rebuilding the image
- Prevent the container from modifying the source export

This separation follows Docker's distinction between persistent named volumes and host bind mounts.

---

## Docker Files

The Docker deployment consists of:

```text
Dockerfile
.dockerignore
compose.yaml
.env
data/
```

### `Dockerfile`

Builds the production Node.js runtime image.

### `.dockerignore`

Prevents unnecessary and sensitive files from entering the Docker build context.

### `compose.yaml`

Defines the long-running WhatsApp service, environment configuration, persistent authentication volume, read-only data mount, and restart policy.

### `.env`

Stores local runtime configuration and secrets.

### `data/`

Contains the local WhatsApp export and remains outside the Docker image.

---

## Security Considerations

The adapter handles potentially sensitive WhatsApp conversations.

Important rules:

- Never commit `.env`
- Never commit `auth_info/`
- Never commit `data/`
- Never expose WhatsApp authentication credentials
- Never expose `GEMINI_API_KEY`
- Avoid logging message contents in production
- Restrict knowledge retrieval by conversation/group when the backend supports it
- Validate backend responses before sending them to WhatsApp
- Use persistent idempotency before production deployment
- Protect exported WhatsApp history because it may contain private conversations
- Do not deploy exported team data to an uncontrolled environment
- Do not include secrets in Docker images
- Do not publish secret-bearing Docker configuration output

Docker Compose documentation also notes that file-reference fields such as `env_file` can read host files and their contents can potentially appear during configuration loading, so configuration inspection should be performed carefully when secrets are present.

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

### 7. Container separation

Docker should package the application runtime without embedding private conversation exports or runtime secrets into the image.

Authentication and local knowledge should remain external to the application image.

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

### Phase 3 — Docker deployment

- [x] Create production Dockerfile
- [x] Multi-stage Docker build
- [x] Create `.dockerignore`
- [x] Create Docker Compose configuration
- [x] Persistent WhatsApp authentication volume
- [x] Read-only local knowledge bind mount
- [x] Detached service operation
- [x] Automatic restart policy
- [x] Docker end-to-end local knowledge test

### Phase 4 — Backend integration

- [ ] Connect real `/copilot/ask`
- [ ] Connect real ingestion endpoint
- [ ] Validate API responses
- [ ] Verify API timeout handling
- [ ] Verify retry behavior against real backend failures
- [ ] Verify conversation/group scoping

### Phase 5 — Reliability and trust

- [ ] Dynamic trust classification
- [ ] Conflict detection
- [ ] Stale-information detection
- [ ] Persistent idempotency
- [ ] Semantic/vector retrieval
- [ ] Evaluation dataset
- [ ] Hallucination testing
- [ ] Wrong-source testing
- [ ] Missing-information testing

### Phase 6 — Judge/demo experience

- [ ] Concise WhatsApp responses
- [ ] Trust indicators
- [ ] Source citations
- [ ] Catch-up intelligence
- [ ] Deadline intelligence
- [ ] Meeting intelligence
- [ ] End-to-end live demo
- [ ] Production deployment

---

## Docker Commands Reference

### Build

```powershell
docker compose build
```

### Build without cache

```powershell
docker build --no-cache --progress=plain -t sentinel-whatsapp:test .
```

### Start

```powershell
docker compose up -d
```

### Start and rebuild

```powershell
docker compose up -d --build
```

### Check status

```powershell
docker compose ps
```

### Follow logs

```powershell
docker compose logs -f whatsapp
```

### View recent logs

```powershell
docker compose logs --tail=50 whatsapp
```

### Restart

```powershell
docker compose restart whatsapp
```

### Stop and remove containers

```powershell
docker compose down
```

### Stop and remove containers plus named volumes

```powershell
docker compose down -v
```

> Use `-v` only when intentionally deleting persistent Docker volumes.

### Inspect mounted data

```powershell
docker compose exec whatsapp ls -l /app/data
```

### Open a shell inside the container

```powershell
docker compose exec whatsapp sh
```

---

## Current Deployment Model

```text
Developer / Server
       │
       ▼
Docker Compose
       │
       ▼
sentinel-whatsapp
       │
       ├── /app/auth
       │       └── whatsapp_auth
       │           named Docker volume
       │
       └── /app/data
               └── ./data
                   read-only bind mount
```

This provides a practical deployment model where:

- The application runs inside Docker.
- WhatsApp authentication persists outside the container filesystem.
- Local WhatsApp knowledge remains on the host.
- The knowledge directory is read-only inside the container.
- Docker can automatically restart the adapter.
- The adapter can run detached from an interactive terminal.
- The backend can be connected later without changing the WhatsApp-facing architecture.

---

## Current End-to-End Architecture

```text
                         WhatsApp
                            │
                            ▼
                    Baileys Gateway
                            │
                            ▼
                 Message Normalization
                            │
                            ▼
                  Message Ingestion
                            │
                            ▼
                   Mention Detection
                            │
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
             Local Copilot     Sentinel Backend
                    │                │
                    ▼                ▼
             Local Retrieval       RAG/API
                    │                │
                    └───────┬────────┘
                            ▼
                    Grounded Response
                            │
                            ▼
                    Trust + Sources
                            │
                            ▼
                    WhatsApp Reply
```

---

## Current Project Status

The Sentinel WhatsApp adapter is currently capable of:

```text
Receive WhatsApp message
        ↓
Detect @sentinel
        ↓
Normalize message
        ↓
Ingest message
        ↓
Retrieve local evidence
        ↓
Ask Gemini using retrieved evidence
        ↓
Generate grounded response
        ↓
Attach sources
        ↓
Send actual quoted WhatsApp reply
```

The adapter is also Dockerized with:

```text
Persistent authentication
+
Read-only local knowledge
+
Automatic restart
+
Detached operation
```

The local development path is functional while the Sentinel backend is being finalized.

The next major integration point is connecting the adapter to the Sentinel backend once the backend API is ready.

---

## License

This adapter is part of the Sentinel project and is intended for the UniPod Hackathon 2026 project.

### Third-Party Notice

This project uses Baileys to communicate with WhatsApp Web. Baileys is an independent open-source project and is not affiliated with or officially endorsed by WhatsApp.

Use the integration responsibly and in accordance with applicable platform terms and policies.
