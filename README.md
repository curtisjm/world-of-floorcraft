# World of Floorcraft

A social platform for the ballroom dance community built around the ISTD syllabus. Browse figures, explore transitions as interactive graphs, build competition routines, organize and score competitions with the skating system, share technique articles, and connect with dancers and teams.

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

### Social Network
- Share routines with captions and write technique articles (WYSIWYG markdown editor)
- Follow other dancers, like/comment/save posts
- Organize saved posts into folders
- User profiles with competition level badges
- Following + Explore feed tabs

### Organizations
- Create or join teams (university ballroom teams, clubs, etc.)
- Configurable membership: open, invite-only, or request-to-join
- Org profile pages with posts, members, and settings
- Org-scoped content visibility

### Real-Time Messaging
- Direct messages, group chats, and org channels
- Real-time delivery via Convex reactive queries
- Typing indicators and presence

### Competition Organizer
Full competition lifecycle management with real-time scoring using the [skating system](https://en.wikipedia.org/wiki/Skating_system).

- **Setup** — Create competitions with multi-step wizard, schedule builder with drag-and-drop, event management with default groupings, staff/judge assignments
- **Registration** — Couple registration, per-event or flat-fee pricing, Stripe Connect payments, competitor number assignment, TBA partner finder, team match submissions
- **Pre-comp** — Add/drop request management, automatic round generation with heat assignments, schedule estimation, statistics dashboard, award calculator
- **Scoring** — Full skating system engine (Rules 5–11), callback tally, single and multi-dance placement, tabulation tables, results workflow (compute → review → publish)
- **Judge UI** — Standalone tablet interface with separate JWT auth (no platform account required), tap-to-toggle callback marking, tap-to-rank finals, real-time submission via Convex reactive queries
- **Comp Day** — Scrutineer dashboard, registration table, deck captain check-in grid, emcee schedule with announcements, projector display, competitor live view
- **Post-comp** — Public results with Summary + Marks tabs, competitor search and history, competition calendar with filters, organizer feedback forms with analytics, financial analytics, record removal requests
- **Org Views** — Per-organization schedule, entries, and results for team coaches and admins

See [`docs/comp-organizer/`](docs/comp-organizer/) for full documentation.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) | Server components, file-based routing |
| Language | [TypeScript](https://www.typescriptlang.org/) | End-to-end type safety |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) | Accessible components on Radix UI primitives |
| Backend & DB | [Convex](https://www.convex.dev/) | Reactive database, queries/mutations/actions, real-time subscriptions |
| Auth | [Clerk](https://clerk.com/) | Authentication with OAuth providers; Convex JWT integration |
| Editor | [Tiptap](https://tiptap.dev/) | WYSIWYG markdown editor for posts |
| Payments | [Stripe](https://stripe.com/) | Competition registration payments via Connect; webhook fulfilled into Convex |
| Judge Auth | [jose](https://github.com/panva/jose) | Edge-compatible JWT for judge tablet sessions |
| Drag & Drop | [@dnd-kit/react](https://dndkit.com/) | Schedule builder reordering |
| Hosting | [Vercel](https://vercel.com/) | Deployment platform |
| Package Manager | [pnpm](https://pnpm.io/) | Fast, disk-efficient package manager |
| Dev Environment | [Nix](https://nixos.org/) flake | Reproducible development environment |

## Architecture

The codebase follows a **modular monolith** pattern organized by domain:

```
src/
  domains/
    syllabus/         # Figure graph, dance browsing UI
    routines/         # Routine builder UI
    social/           # Feed, posts, comments, likes, follows, saves UI
    messaging/        # DMs, group chats, org channels UI
    orgs/             # Organizations UI
    competitions/     # Competition organizer, scoring, judge UI, comp-day ops UI
  shared/
    ui/               # shadcn/ui components
    components/       # App shell (nav, layout, Convex/Clerk providers)
    lib/              # Utility helpers
convex/
  schema.ts           # All Convex tables and indexes
  lib/                # Auth, permission, money, time helpers
  syllabus/           # Convex syllabus functions
  routines.ts         # Convex routine functions
  social/             # Convex social functions
  orgs.ts             # Convex org functions
  messaging.ts        # Convex messaging functions
  competitions/       # Convex competition functions and Stripe actions
```

Each domain owns its UI components and route pages. Convex functions live alongside the schema in `convex/` and serve as the backend boundary. See [docs/](docs/) for detailed architecture documentation.

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

### Competitions
```
organizations       1 ──── * competitions      Competitions owned by orgs
competitions        1 ──── * competition_days  Multi-day schedule structure
competition_days    1 ──── * schedule_blocks   Sessions within a day
competitions        1 ──── * competition_events Events (e.g. "Novice Waltz")
competitions        * ──── * judges            Judge assignments (global directory)
competitions        1 ──── * registrations     Per-person registration
entries             * ──── 1 event             Couple entries (leader + follower)
entries             1 ──── * callback_marks    Preliminary round marks
entries             1 ──── * final_marks       Final round placements
rounds              1 ──── * heats             Heat assignments per round
competitions        1 ──── * feedback_forms    Post-comp feedback collection
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

- [Nix](https://nixos.org/download/) with flakes enabled, or Node.js 22 with pnpm
  - Convex Node actions support Node 18/20/22/24; use Node 22 for this project and avoid Node 26.
- A [Convex](https://www.convex.dev/) account
- A [Clerk](https://clerk.com/) application with a Convex JWT template
- Stripe test keys if you are exercising competition payments

### Setup

```bash
# Enter dev environment (if using Nix)
direnv allow
# or: nix develop

# Install dependencies
pnpm install

# Set up local environment variables
cp .env.example .env.local
# Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from Clerk.
# NEXT_PUBLIC_CONVEX_URL is written by `npx convex dev`.
# Add STRIPE_WEBHOOK_SECRET locally only if testing the local webhook route.

# Provision/link Convex with a supported Node version.
# In the Nix shell you can run `npx convex ...` directly; otherwise use mise to force Node 22.
# On the first run, Convex may create the deployment and then stop because
# CLERK_JWT_ISSUER_DOMAIN is not set yet; continue with the env set commands.
mise exec node@22 -- npx convex dev --once

# Configure backend environment variables on the Convex deployment.
# CLERK_JWT_ISSUER_DOMAIN is Clerk's Frontend API URL / JWT issuer for the Convex template.
mise exec node@22 -- npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
mise exec node@22 -- npx convex env set STRIPE_SECRET_KEY sk_test_...
mise exec node@22 -- npx convex env set STRIPE_WEBHOOK_SECRET whsec_...

# Validate schema/functions again after Convex env is configured.
mise exec node@22 -- npx convex dev --once

# Seed syllabus data
pnpm seed

# Start dev server
pnpm dev
```

### Data Pipeline

Figures are extracted from scanned pages of "The Ballroom Technique" using Claude's vision API:

```bash
# 1. Extract figures from PDF page images
python scripts/extract_figures.py

# 2. Seed Convex from extracted YAML
pnpm seed
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm convex:dev` | Run Convex dev server (regenerates `_generated/`) |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm seed` | Seed Convex syllabus data from extracted YAML |
| `pnpm test` | Run Convex function tests |
| `pnpm test:e2e` | Run Playwright end-to-end tests |

## Status

### Implemented
- [x] Syllabus browsing with search and level filters
- [x] React Flow graph visualization (Dagre layout, edge-on-demand)
- [x] Figure detail pages with leader/follower step data
- [x] Routine builder with figure picker and transition validation
- [x] Social feed with shared routines and technique articles (Tiptap editor)
- [x] Follow system, likes, comments, notifications
- [x] Save/bookmark system with folders
- [x] User profiles with competition level badges
- [x] Organizations with configurable membership (open, invite-only, request-to-join)
- [x] Real-time messaging via Convex (DMs, group chats, org channels)
- [x] Competition organizer — full lifecycle from creation to post-comp analytics
- [x] Skating system scoring engine (Rules 5–11) with tabulation
- [x] Judge tablet UI with standalone JWT auth
- [x] Comp-day dashboards (scrutineer, registration table, deck captain, emcee)
- [x] Real-time competition views (projector display, competitor live view)
- [x] Results browsing, competitor history, competition calendar
- [x] Feedback forms with analytics, payment analytics
- [x] Clerk authentication with route protection
- [x] Dark theme with ISTD level accent colors
- [x] PDF extraction and database seed pipeline

Convex function tests cover the migrated backend behavior.

### Future
- [ ] Photo/video media support
- [ ] Email/push notifications
- [ ] AI choreography assistant
- [ ] Viennese Waltz syllabus data

## Documentation

- [`docs/comp-organizer/`](docs/comp-organizer/) — Competition organizer technical docs, schema, routers, and user guides
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — Design specifications
- [`docs/testing.md`](docs/testing.md) — Test infrastructure documentation

## License

LGPL-3.0 — see [LICENSE](LICENSE).
