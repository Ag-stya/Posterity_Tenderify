# TenderWatch Live

**Zero-Cost Internal Tender Aggregator + Semantic Search**

A self-hosted web app where BD users search tenders aggregated from multiple Indian government procurement portals. Features hybrid semantic search (keyword + AI embeddings), background crawling, duplicate detection, and a clean internal UI.

## Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Next.js  │────▶│  NestJS  │────▶│ Postgres │
│   Web UI  │     │   API    │     │ +pgvector│
│  :3000    │     │  :4000   │     │  :5432   │
└──────────┘     └──────────┘     └──────────┘
                       │                │
                       │          ┌─────┘
                       │          │
                 ┌──────────┐  ┌──────┐
                 │  NestJS  │──│Redis │
                 │  Worker  │  │:6379 │
                 │ (BullMQ) │  └──────┘
                 └──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| DB | PostgreSQL 16 + pgvector |
| Queue | Redis + BullMQ |
| API | NestJS (REST) |
| Worker | NestJS + BullMQ processors |
| Web | Next.js 14 (App Router) + Tailwind |
| ORM | Prisma |
| Embeddings | Transformers.js (all-MiniLM-L6-v2, CPU) |
| Search | Hybrid: pgvector similarity + Postgres FTS |
| Infra | Docker Compose (single VM) |

**Zero external cost.** No paid APIs, no commercial SaaS.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ and pnpm (for local dev)

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env if needed (defaults work for Docker Compose)
```

### 2. Run with Docker Compose

```bash
docker compose up --build
```

This starts all 5 services: Postgres, Redis, API, Worker, Web.

### 3. Run database seed

```bash
# In a separate terminal, after services are up:
docker compose exec api sh -c "cd /app/packages/db && npx tsx src/seed.ts"
```

This creates:
- Admin user: `admin@local` / `admin123`
- BD user: `bd@local` / `bd123`
- 2 enabled source sites (Jharkhand NIC, UP NIC)
- 37 disabled source sites (from state portals PDF)
- 10 dummy tenders for testing search

### 4. Access the app

- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000

Login with `admin@local` / `admin123`, then search for tenders.

## Local Development (without Docker)

```bash
# Install dependencies
pnpm install

# Start Postgres and Redis locally (or via Docker)
docker compose up postgres redis -d

# Generate Prisma client
pnpm db:generate

# Run migrations
DATABASE_URL="postgresql://tenderwatch:tenderwatch@localhost:5432/tenderwatch" pnpm db:migrate

# Seed
DATABASE_URL="postgresql://tenderwatch:tenderwatch@localhost:5432/tenderwatch" pnpm db:seed

# Start services (3 terminals)
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Login → tokens + user |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | JWT | Invalidate refresh token |
| POST | `/auth/admin/create-user` | ADMIN | Create new user |

### Search
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tenders/search` | JWT | Hybrid search with filters |

Query params: `q`, `sourceSiteIds`, `publishedFrom`, `publishedTo`, `closingSoonDays`, `location`, `page`, `pageSize`

### Status
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | JWT | Crawl status + last updated |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/source-sites` | ADMIN | List all source sites |
| POST | `/admin/source-sites` | ADMIN | Create source site |
| PATCH | `/admin/source-sites/:id` | ADMIN | Update source site |
| POST | `/admin/source-sites/:id/enable` | ADMIN | Enable crawling |
| POST | `/admin/source-sites/:id/disable` | ADMIN | Disable crawling |

## Web Pages

| Path | Description |
|------|-------------|
| `/login` | Email/password login |
| `/search` | Main search UI with filters, results table, status badge |
| `/admin/sources` | Admin: enable/disable source sites |

## Search Behavior

When a query is provided:
1. Generate embedding with all-MiniLM-L6-v2
2. Pull top 200 vector similarity candidates from pgvector
3. Pull top 200 FTS candidates from Postgres full-text search
4. Merge unique IDs
5. Score: `0.65 × semantic + 0.25 × FTS + 0.10 × recency`
6. Apply filters, sort, paginate

This means searching "defence" will find tenders from MoD, DRDO, Army, Navy etc. even without the word "defence" in the text.

## Crawl Pipeline

1. **Scheduler** checks enabled sites every 60 seconds
2. Enqueues `crawl:site` job if interval elapsed
3. **Crawl processor** runs connector: fetch listing → fetch details → parse → upsert
4. New/changed tenders get `embed:tender` job
5. After crawl, `dedupe:batch` job groups duplicates

Connector failures are isolated — one site failure doesn't affect others.

## Seeded Source Sites

### Enabled (2)
- Jharkhand NIC eProc
- Uttar Pradesh NIC eProc

### Disabled (37) — from uploaded PDFs
All Indian state/UT eProcurement portals + CPPP + IREPS + nProcure

Enable them via Admin UI as needed. Only NIC_GEP connector is implemented; others are stubs.

## Security Notes

- Passwords hashed with bcrypt (12 rounds)
- JWT access tokens (15min) + refresh tokens (7 days)
- Refresh tokens stored hashed in DB
- ADMIN guard on admin routes
- **TODO for production**: Switch from localStorage to httpOnly cookies

## TODOs / Known Limitations

- **NicGEP connector**: Best-effort scraping, may need selector tuning per portal
- **CPPP/IREPS/nProcure connectors**: Stub only — need implementation
- **CUSTOM_HTML sites**: No generic connector — each needs custom implementation
- **Token storage**: Uses localStorage (see security note above)
- **HTTPS/SSL**: Not included — configure via reverse proxy (nginx/caddy)
- **Embedding model**: First run downloads ~25MB model; cached in Docker volume
- **CAPTCHA handling**: Not implemented; sites with CAPTCHAs will fail gracefully

## License

Internal tool — proprietary.
