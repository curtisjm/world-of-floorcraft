# Figure Graph

A social platform for the ballroom dance community built around the ISTD syllabus. Browse figures, explore transitions as interactive graphs, build competition routines, share technique articles, and connect with dancers and teams.

## Background

### What is the ISTD Ballroom Syllabus?

The **Imperial Society of Teachers of Dancing (ISTD)** publishes "The Ballroom Technique," the definitive reference for standard ballroom dancing. It defines **figures** (named sequences of steps) for five dances and specifies which figures can precede or follow each other, forming a directed graph of transitions.

### The Five Standard Dances

| Dance | Time Signature | Character |
|-------|---------------|-----------|
| **Waltz** | 3/4 | Rise-and-fall movement in triple time |
| **Foxtrot** | 4/4 | Smooth, progressive movement across the floor |
| **Quickstep** | 4/4 | Light, fast-moving dance with hops and runs |
| **Tango** | 2/4 | Sharp, staccato movements with dramatic character |
| **Viennese Waltz** | 3/4 | Fast, continuous turning |

### Examination Levels

Figures are introduced at progressively higher examination levels. Higher levels unlock additional figures and transitions:

- **Student Teacher / Associate** (Bronze) — Foundation figures
- **Licentiate** (Silver) — Intermediate figures and additional transitions
- **Fellow** (Gold) — Advanced figures and the full transition set

## Platform Features

### Syllabus & Graph Tool
- Browse figures for each dance with search and level filtering
- Interactive directed graph visualization (React Flow + Dagre layout)
- Full dance graphs and local figure neighborhood graphs
- Figure detail pages with leader/follower step charts, footwork, CBM, sway, timing

### Routine Builder
- Build competition routines by selecting figures with transition validation
- Level ceiling filtering (Bronze/Silver/Gold/Fellow)
- Publish routines to your profile or share as feed posts

### Social Network (in development)
- Share routines with captions and write technique articles (WYSIWYG markdown editor)
- Follow other dancers, like/comment/save posts
- Organize saved posts into folders
- User profiles with competition level badges
- Following + Explore feed tabs

### Organizations (in development)
- Create or join teams (university ballroom teams, clubs, etc.)
- Configurable membership: open, invite-only, or request-to-join
- Org profile pages with posts, members, and settings
- Org-scoped content visibility

### Real-Time Messaging (in development)
- Direct messages, group chats, and org channels
- Real-time delivery via Ably
- Typing indicators and presence

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) | Server components, file-based routing |
| Language | [TypeScript](https://www.typescriptlang.org/) | End-to-end type safety |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) | Accessible components on Radix UI primitives |
| Database | [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech/) | Serverless PostgreSQL |
| ORM | [Drizzle](https://orm.drizzle.team/) | TypeScript-first SQL ORM |
| API | [tRPC v11](https://trpc.io/) | End-to-end typesafe API layer |
| Auth | [Clerk](https://clerk.com/) | Authentication with OAuth providers |
| Real-time | [Ably](https://ably.com/) | WebSocket messaging (planned) |
| Editor | [Tiptap](https://tiptap.dev/) | WYSIWYG markdown editor (planned) |
| Hosting | [Vercel](https://vercel.com/) | Deployment platform |
| Package Manager | [pnpm](https://pnpm.io/) | Fast, disk-efficient package manager |
| Dev Environment | [Nix](https://nixos.org/) flake | Reproducible development environment |

## Architecture

The codebase follows a **modular monolith** pattern organized by domain:

```
src/
  domains/
    syllabus/         # Figure graph, dance browsing, visualization
    routines/         # Routine builder and management
    social/           # Feed, posts, comments, likes, follows, saves
    messaging/        # DMs, group chats, org channels
    orgs/             # Organizations, membership, org profiles
  shared/
    auth/             # Clerk helpers, protected procedures
    db/               # Database connection, shared enums
    ui/               # shadcn/ui components
    components/       # App shell (nav, layout)
    lib/              # tRPC client, utilities
    schema.ts         # Users table (shared across domains)
```

Each domain owns its schema, routers, components, and routes. Cross-domain access uses explicit query/type exports. See [docs/](docs/) for detailed architecture documentation.

## Database Schema

### Core (Syllabus)
```
dances              1 ──── * figures           Figures belong to a dance
figures             1 ──── * figure_edges      Edges connect two figures (directed)
```

### User Content
```
users               1 ──── * routines          Users own routines
routines            1 ──── * routine_entries   Routines contain ordered figures
users               1 ──── * posts             Users author posts
posts               1 ──── * comments          Posts have threaded comments
users               1 ──── * saved_posts       Users bookmark posts into folders
```

### Social
```
users               * ──── * follows           Follow relationships (with pending state)
users               * ──── * organizations     Org membership (via memberships table)
organizations       1 ──── * conversations     Org channels
users               * ──── * conversations     DMs and group chats (via conversation_members)
```

## Design

### Color System

Dark theme with accent colors mapped to examination levels:

- **Bronze** `#CD7F32` — Student Teacher / Associate
- **Silver** `#C0C0C0` — Licentiate
- **Gold** `#FFD700` — Fellow

Available as Tailwind utilities: `text-bronze`, `border-silver`, `bg-gold`, etc.

## Getting Started

### Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled, or Node.js 22+ with pnpm
- A [Neon](https://neon.tech/) PostgreSQL database

### Setup

```bash
# Enter dev environment (if using Nix)
direnv allow
# or: nix develop

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Add DATABASE_URL from Neon dashboard
# Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from Clerk

# Push schema to database
pnpm db:push

# Seed syllabus data
pnpm db:seed

# Start dev server
pnpm dev
```

### Data Pipeline

Figures are extracted from scanned pages of "The Ballroom Technique" using Claude's vision API:

```bash
# 1. Extract figures from PDF page images
python scripts/extract_figures.py

# 2. Seed the database from extracted YAML
pnpm db:seed
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema directly to database |
| `pnpm db:studio` | Open Drizzle Studio (database GUI) |
| `pnpm db:seed` | Seed database from extracted YAML |

## Status

### Implemented
- [x] Syllabus browsing with search and level filters
- [x] React Flow graph visualization (Dagre layout, edge-on-demand)
- [x] Figure detail pages with leader/follower step data
- [x] Routine builder with figure picker and transition validation
- [x] Clerk authentication with route protection
- [x] Dark theme with ISTD level accent colors
- [x] PDF extraction and database seed pipeline

### In Development
- [ ] Social feed (shared routines + blog articles)
- [ ] WYSIWYG markdown editor (Tiptap)
- [ ] User profiles with competition levels
- [ ] Follow system with public/private accounts
- [ ] Organizations (teams, clubs)
- [ ] Real-time messaging (Ably)
- [ ] Notifications
- [ ] Save/bookmark system with folders

### Future
- [ ] Competition management (judging, scheduling, registration)
- [ ] Photo/video media support
- [ ] Email/push notifications
- [ ] AI choreography assistant
- [ ] Viennese Waltz syllabus data

## Documentation

- [`docs/superpowers/specs/`](docs/superpowers/specs/) — Design specifications
- [`plans/`](plans/) — Implementation plans organized by phase

## License

LGPL-3.0 — see [LICENSE](LICENSE).
