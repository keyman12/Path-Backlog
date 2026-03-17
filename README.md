# Path Backlog App

A priority backlog and task management web app. Organise work by categories (projects) and sub-folders, set priorities (Now / Soon / Later), due dates, and progress. Includes drag-and-drop reordering, user authentication, and admin user management.

## Features

- **Categories (projects)** — Create categories with custom colours; items show the category colour on the list.
- **Sub-folders** — Organise items inside a category with sub-tabs (e.g. "Dashboard/dave").
- **Priorities** — Now (red), Soon (light red), Later (green); sortable by priority.
- **Items** — Title, description, due date, progress %, inline edit (priority, date, progress, category, mark complete, delete).
- **Views**
  - **Home** — Consolidated list of all items across categories; drag to reorder and change priority.
  - **Category** — Per-project view with optional sub-folder tabs; drag to reorder within that list.
- **Drag-and-drop** — Reorder items on Home or in a category; reordering on Home is reflected in category view and persisted.
- **Reports** — Filter by due date and completed date.
- **Settings** (admin)
  - Categories: add, set colour.
  - Sub-folders: add, edit, delete per category.
  - Users: list, create, edit (username, display name, role), reset password.

## Tech stack

- **Frontend:** React 18, Vite, React Query, React Router, dnd-kit (drag-and-drop).
- **Backend:** Node.js, Express, SQLite (better-sqlite3), session-based auth (bcrypt passwords).
- **Auth:** Login/logout; admin and member roles; recovery user support.

## Requirements

- Node.js 18+
- npm or yarn

## Setup

### 1. Install dependencies

```bash
# Backend
cd server && npm install && cd ..

# Frontend
cd client && npm install && cd ..
```

### 2. Environment (optional)

Create `server/.env` if you need to override defaults:

- `PORT` — API port (default `3000`)
- `SESSION_SECRET` — Session signing secret (set in production)
- `NODE_ENV=production` — For production

Database file is created automatically under `server/data/` (gitignored). To initialise or reset the DB schema, from `server/` run:

```bash
npm run init-db
```

### 3. Run development

**Terminal 1 — API:**

```bash
cd server && npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd client && npm run dev
```

- API: http://localhost:3000  
- App: http://localhost:5173 (Vite) — proxy to API is configured so the app talks to the same origin.

### 4. First user (admin)

On first run, the app may create a default admin user (see server auth/schema). Otherwise create a user via Settings (admin) or your init script and set role to `admin`.

## Project structure

```
Path BacklogApp/
├── client/                 # Vite + React SPA
│   ├── public/
│   ├── src/
│   │   ├── api.js         # API client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/    # Backlog list, item inline, layout, etc.
│   │   ├── pages/         # Home, Project, Settings, Reports, Login
│   │   ├── styles/        # design-tokens, global
│   │   └── utils/
│   └── package.json
├── server/
│   ├── index.js           # Express app, CORS, session, routes
│   ├── db.js
│   ├── auth.js            # Password hash, user create/update/reset
│   ├── schema.js          # SQLite schema + migrations
│   ├── routes/            # auth, projects, subfolders, backlog, work-tickets, reports
│   ├── scripts/
│   └── package.json
├── .gitignore
└── README.md
```

## API overview

- `GET/POST /api/auth/*` — login, logout, me, users (list/create/update/reset-password).
- `GET/POST/PATCH/DELETE /api/projects` — categories.
- `GET/POST/PATCH/DELETE /api/subfolders`, `GET /api/subfolders/project/:projectId`.
- `GET /api/backlog` — list by project (optional subfolder); returns items with `project_name`, `project_color`, `subfolder_name`.
- `GET /api/backlog/consolidated` — all items with project/subfolder names.
- `GET/POST/PATCH/DELETE /api/backlog/:id`, `POST /api/backlog/reorder`.
- Work tickets and reports under `/api/work-tickets` and `/api/reports`.

## This version

- Categories with colours; sub-folders with edit/delete.
- Consolidated (Home) and category views with correct reorder persistence and cache behaviour.
- Inline item edit: priority, due date, progress, category; mark complete, re-open, delete.
- Item row: category shown as `Category/subfolder` when present; meta line: category, date, progress % on the left; “Due soon” / “Overdue” on the right.
- Settings: primary green buttons with hover (#297D2D → #3B9F40) via `PrimaryBtn` component; admin user list, create, edit, reset password.
- SQLite schema: projects, subfolders, backlog_items, users, work_tickets; session-based auth.

## Licence

Private / internal use unless otherwise stated.
