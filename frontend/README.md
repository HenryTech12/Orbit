# Sentinel Frontend

Knowledge Copilot and Operational Memory for UniPods cohorts.

---

## Tech Stack
* **Framework:** React 19 + TypeScript
* **Tooling:** Vite
* **Styling:** Tailwind CSS v4
* **State & Server Cache:** TanStack Query (React Query)
* **Routing:** React Router v7
* **Icons:** Lucide React
* **Audio & Voice:** Browser `MediaRecorder` API + Web Speech API (`SpeechSynthesis`)

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy the environment template:
```bash
cp .env.example .env
```

Default variables in `.env`:
* `VITE_USE_MOCK_API=true` — Simulates backend responses locally without a running server.
* `VITE_API_BASE_URL=http://localhost:8000/api/v1` — Target endpoint when connected to the backend.

### 3. Run Locally
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Available Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server |
| `npm run build` | Runs TypeScript compilation (`tsc -b`) and Vite production bundle |
| `npm run preview` | Serves the production build locally for verification |

---

## Key Features & Architecture

* **Grounded Copilot Chat (`/`):** Strict "no evidence → no answer" interface rendering trust statuses (`CONFIRMED`, `DISPUTED`, `STALE`, `UNKNOWN`) and direct citations.
* **Turn-Based Voice Pipeline (Section 6.7):** Press-and-hold microphone interaction using browser `MediaRecorder` and offline `window.speechSynthesis`. Audio queries route through the grounded Responder pipeline before playback, preserving citation integrity.
* **Catch-Up Dashboard (`/catch-up`):** Synthesizes announcements, decisions, deadlines, and action items over customizable temporal windows (e.g., 3-day, 7-day ranges).
* **Evidence Drawer:** Inspectable slide-over showing source chunk provenance, author, timestamps, and authority scores.
* **Admin Ingestion (`/upload`):** Ingestion interface for meeting transcripts, documents, and chat exports gated by role-based access.

---

## Application Structure

```text
src/
├── components/
│   ├── catchup/       # Catch-up temporal dashboard
│   ├── chat/          # Copilot chat window & citation logic
│   ├── common/        # Navbar, Drawer, ProtectedRoute, NotFound
│   └── upload/        # Admin data ingestion pipeline
├── context/           # AuthContext & role state management
├── hooks/             # useVoiceInteraction & audio management
├── services/          # API layer with mock/live environment toggle
├── types/             # Shared TypeScript domain contracts
└── App.tsx            # Main router & provider wrapper
```

---

## Roles & Route Protection

* **Student Mode:** Access to `/` (Chat) and `/catch-up`.
* **Admin Mode:** Full access, including `/upload` (Data Ingestion).
* Toggle roles directly via the navigation bar switch for testing. Non-admin navigation to `/upload` is automatically redirected to `/`.