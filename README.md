# Figure Graph

Interactive visualization of the ISTD ballroom dance syllabus as a directed graph. Browse figures, explore precede/follow transitions, and build competition routines.

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

### What is a Figure?

A figure is a named, repeatable sequence of steps with defined:
- **Alignment** — direction the dancer faces relative to the room
- **Footwork** — which part of the foot contacts the floor (heel, toe, ball)
- **Rise and fall** — body elevation changes through the step
- **CBM** (Contrary Body Movement) — rotation of the body opposite to the moving foot
- **Sway** — lateral body inclination
- **Timing** — which beats of the music each step occupies

Each figure has separate step charts for the man and lady, since they mirror or complement each other.

### What are Precedes and Follows?

The syllabus defines which figures can legally connect to each other. For example, in waltz, a Natural Turn can be followed by a Closed Change (RF) at Associate level, or by an Outside Spin at Licentiate level. These rules form a **directed graph** where figures are nodes and allowed transitions are edges, with each edge annotated with the minimum level required.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) | React framework with file-based routing and server-side rendering |
| Language | [TypeScript](https://www.typescriptlang.org/) | Static typing for JavaScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS framework |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) | Accessible components built on Radix UI primitives |
| Database | [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech/) | Serverless PostgreSQL |
| ORM | [Drizzle](https://orm.drizzle.team/) | TypeScript-first SQL ORM |
| API | [tRPC v11](https://trpc.io/) | End-to-end typesafe API layer |
| Auth | [Clerk](https://clerk.com/) | Authentication (placeholder, not yet wired) |
| Package Manager | [pnpm](https://pnpm.io/) | Fast, disk-efficient package manager |
| Dev Environment | [Nix](https://nixos.org/) flake | Reproducible development environment |

## Project Structure

```
figure-graph/
  src/
    app/                        # Next.js App Router pages
      api/trpc/[trpc]/route.ts  # tRPC HTTP endpoint
      dances/                   # Dance browsing pages
        [dance]/                # Per-dance figure list + graph
          figures/[id]/         # Individual figure detail + local graph
      routines/                 # Routine management pages
      layout.tsx                # Root layout (nav, dark theme, providers)
      page.tsx                  # Landing page
      globals.css               # Tailwind config, CSS variables, theme
    components/
      ui/                       # shadcn/ui components (button, card, etc.)
      providers.tsx             # tRPC + React Query client providers
    db/
      schema.ts                 # Drizzle ORM table definitions
      index.ts                  # Database connection (lazy, via Neon)
    server/
      trpc.ts                   # tRPC initialization
      routers/                  # API routers (dance, figure, routine)
    lib/
      trpc.ts                   # Client-side tRPC hooks
      utils.ts                  # Tailwind class merge utility
  scripts/
    extract_figures.py          # PDF extraction via Claude vision API
    seed.ts                     # Database seeder from extracted YAML
  data/
    extracted/                  # YAML output from extraction (gitignored)
    raw/                        # Scanned PDF pages (gitignored)
  drizzle.config.ts             # Drizzle migration config
  components.json               # shadcn/ui CLI config
```

## Database Schema

```
dances              1 ──── * figures           Figures belong to a dance
figures             1 ──── * figure_edges      Edges connect two figures (directed)
users               1 ──── * routines          Users own routines
routines            1 ──── * routine_entries   Routines contain ordered figures
users + figures     1 ──── * figure_notes      Users annotate figures
```

Key tables:
- **`figures`** — step data (JSONB for man/lady steps), footwork, CBM, sway, timing
- **`figure_edges`** — directed transitions with minimum level and optional conditions
- **`routine_entries`** — ordered figure sequence with wall segment markers

## Design

### Color System

The app uses a dark theme with accent colors mapped to examination levels:

- **Bronze** `#CD7F32` — Student Teacher / Associate
- **Silver** `#C0C0C0` — Licentiate
- **Gold** `#FFD700` — Fellow

These are available as Tailwind utilities: `text-bronze`, `border-silver`, `bg-gold`, etc.

## Getting Started

### Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled, or Node.js 22+ with pnpm
- A [Neon](https://neon.tech/) PostgreSQL database (for data features)

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

# Push schema to database
pnpm db:push

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

This project is in early scaffolding. Current state:

- [x] Next.js project with dark theme and level accent colors
- [x] Database schema for figures, edges, routines
- [x] tRPC API with dance/figure/routine routers
- [x] Page structure with placeholder content
- [x] PDF extraction script
- [x] Database seed script
- [ ] React Flow graph visualization
- [ ] Live data on pages (currently placeholder)
- [ ] Clerk authentication
- [ ] Routine builder UI
- [ ] AI choreography assistant
- [ ] Framer Motion animations

## License

LGPL-3.0 — see [LICENSE](LICENSE).
