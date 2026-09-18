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

## Application Structure

```text
src/
├── components/
│   ├── catchup/       # Catch-up temporal dashboard
│   ├── chat/          # Copilot chat window & citation logic
│   ├── common/        # Navbar, Drawer, ProtectedRoute, NotFound
│   └── upload/        # Admin data ingestion pipeline
├── context/           # AuthContext & role state management
├── services/          # API layer with mock/live environment toggle
├── types/             # Shared TypeScript domain contracts
└── App.tsx            # Main router & provider wrapper
```

---

## Roles & Route Protection

* **Student Mode:** Access to `/` (Chat) and `/catch-up`.
* **Admin Mode:** Full access, including `/upload` (Data Ingestion).
* Toggle roles directly via the navigation bar switch for testing. Non-admin navigation to `/upload` is automatically redirected to `/`.