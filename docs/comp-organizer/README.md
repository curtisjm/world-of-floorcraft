# Competition Organizer

Documentation for the World of Floorcraft competition organizing, judging, and results system.

Linear epic: [WOF-13](https://linear.app/floorcraft/issue/WOF-13/competition-organizer)

## Implementation Status

| Phase | Backend | Frontend | Notes |
|-------|---------|----------|-------|
| Phase 1: Foundation | Complete | Complete | 10 dashboard pages, creation wizard, discovery |
| Phase 2: Registration & Entries | Complete | Complete | Registration, entries, TBA, team match, payments, numbers |
| Phase 3: Pre-comp Operations | Complete | Complete | Add/drop, rounds, schedule estimation, stats, awards |
| Phase 4: Scoring Engine | Complete | Complete | Scoring workflow, public results with tabulation |
| Phase 5: Judge UI | Complete | Complete | Judge tablet, scrutineer controls, JWT auth |
| Phase 6: Comp Day Operations | Designed | Not started | Real-time views for all staff roles |
| Phase 7: Post-comp & Global | Designed | Not started | Results history, feedback, global search |

**Total: 263 backend tests passing, 24 frontend pages implemented.**

## Documentation Structure

### [`technical/`](./technical/)
Architecture, data model, and implementation details for developers.

- [Design Document](./technical/design.md) — Feature design, page specs, and business rules
- [Implementation Phases](./technical/phases.md) — Phased breakdown with task checklists and implementation notes
- [Frontend Architecture](./technical/frontend.md) — Route structure, UI stack, key patterns, page summary
- Schema docs: [Phase 1](./technical/schema-phase1.md) · [Phase 2](./technical/schema-phase2.md) · [Phase 3](./technical/schema-phase3.md) · [Phase 4](./technical/schema-phase4.md) · [Phase 5](./technical/schema-phase5.md) · [Phase 6](./technical/schema-phase6.md) · [Phase 7](./technical/schema-phase7.md)
- Router docs: [Phase 1](./technical/routers-phase1.md) · [Phase 2](./technical/routers-phase2.md) · [Phase 3](./technical/routers-phase3.md) · [Phase 4](./technical/routers-phase4.md) · [Phase 5](./technical/routers-phase5.md) · [Phase 6](./technical/routers-phase6.md) · [Phase 7](./technical/routers-phase7.md)
- [Scoring Test Data](./technical/scoring-tests.md) — Comprehensive test cases from skating system PDF

### [`user-guide/`](./user-guide/)
End-user documentation organized by role.

- [Competition Organizer Guide](./user-guide/organizer.md) — Creating and managing competitions
- [Competitor Guide](./user-guide/competitor.md) — Finding, registering for, and competing in competitions
- [Judge Guide](./user-guide/judge.md) — Using the tablet marking interface
- Scrutineer Guide — *coming with Phase 6*
- Day-of Staff Guide — *coming with Phase 6*
