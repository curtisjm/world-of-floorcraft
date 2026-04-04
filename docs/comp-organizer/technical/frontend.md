# Frontend Architecture — Competition Organizer

## Route Structure

```
src/app/competitions/
  page.tsx                                       # Discovery/list page (public)
  create/page.tsx                                # Creation wizard (authenticated)
  [slug]/
    page.tsx                                     # Public info page
    register/page.tsx                            # Competitor registration
    entries/page.tsx                             # Public entries by event
    results/page.tsx                             # Public results + tabulation
    tba/page.tsx                                 # Partner finder (TBA)
    team-match/page.tsx                          # Team match ideas
    add-drop/page.tsx                            # Competitor add/drop form
    dashboard/
      layout.tsx                                 # Dashboard shell (sidebar + content)
      page.tsx                                   # Overview + checklist + status controls
      schedule/page.tsx                          # Schedule management (dnd)
      events/page.tsx                            # Event management
      staff/page.tsx                             # Staff assignment
      judges/page.tsx                            # Judge management
      settings/page.tsx                          # Competition settings
      registrations/page.tsx                     # Registration table (staff)
      numbers/page.tsx                           # Competitor number management
      add-drop/page.tsx                          # Add/drop request management
      payments/page.tsx                          # Payment summary + Stripe
      rounds/page.tsx                            # Round/heat management
      scoring/page.tsx                           # Scoring + scrutineer controls
      schedule-estimation/page.tsx               # Time estimation
      stats/page.tsx                             # Stats + awards calculator

src/app/judge/
  page.tsx                                       # Judge tablet (standalone, no Clerk)
```

## Shared Components

```
src/domains/competitions/components/
  competition-card.tsx          # Card for discovery list
  status-badge.tsx              # Color-coded status badge (6 statuses)
  dashboard-nav.tsx             # Sidebar with sectioned nav (Setup, Entries, Competition)
```

## UI Stack

| Library | Purpose |
|---------|---------|
| shadcn/ui (new-york) | UI components (`@shared/ui/*`) |
| react-hook-form + zod | Complex forms (settings, creation wizard, event editor) |
| sonner | Toast notifications (`toast.success()` / `toast.error()`) |
| @dnd-kit/react v2 | Drag-and-drop (schedule block reordering) |
| @tanstack/react-table | Data tables (installed, not yet used) |
| jose | JWT creation/verification for judge tablet auth |
| lucide-react | Icons |

## Key Patterns

### Data Fetching
All pages use tRPC React Query hooks:
```tsx
const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
const { data: events } = trpc.event.listByCompetition.useQuery(
  { competitionId: comp?.id ?? 0 },
  { enabled: !!comp },
);
```

Chained queries use `enabled` to wait for parent data. Cache invalidation uses `utils.router.procedure.invalidate()`.

### Forms
Complex forms use react-hook-form with zod validation:
```tsx
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});
```

For shadcn Select/Checkbox (uncontrolled), use `Controller`:
```tsx
<Controller control={form.control} name="style" render={({ field }) => (
  <Select value={field.value} onValueChange={field.onChange}>...</Select>
)} />
```

Simple dialogs use `useState` instead.

### Mutations
All mutations follow this pattern:
```tsx
const mutation = trpc.router.procedure.useMutation({
  onSuccess: () => {
    invalidate();
    toast.success("Action completed");
    closeDialog();
  },
  onError: (err) => toast.error(err.message),
});
```

### Loading States
Skeleton components matching the layout structure of loaded content:
```tsx
if (isLoading || !comp) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
```

### Dashboard Layout
Sidebar nav with sectioned groups. Content renders in the main area via nested routes. The layout fetches the competition by slug and provides the comp name + status badge header.

### Drag-and-Drop (@dnd-kit/react v2)
Uses the simpler v2 API:
```tsx
<DragDropProvider onDragEnd={(event) => {
  const newItems = move(items, event);
  setItems(newItems);
  reorderMutation.mutate(newItems.map(i => i.id));
}}>
  {items.map((item, index) => (
    <SortableItem key={item.id} id={item.id} index={index} />
  ))}
</DragDropProvider>

// SortableItem just needs:
const { ref } = useSortable({ id, index });
return <div ref={ref}>...</div>;
```

### Creation Wizard
Multi-step flow that creates the competition on Step 1 (draft status). Steps 2-3 operate on the created competition using real backend mutations. This means:
- Steps 2-3 have a real `competitionId` for mutations
- If the user abandons mid-wizard, the draft comp is saved
- Org selector is disabled after creation (can't change org)

## Dashboard Navigation Sections

The sidebar organizes dashboard pages into three sections:

**Setup** — Initial competition configuration
- Overview, Schedule, Events, Staff, Judges

**Entries** — Registration and entry management
- Registrations, Numbers, Add/Drop, Payments

**Competition** — Day-of and post-comp operations
- Rounds, Scoring, Schedule Estimation, Stats & Awards

Plus Settings at the bottom.

## Page Summary

| Page | Route | Auth | Key Features |
|------|-------|------|--------------|
| Discovery | `/competitions` | Public | Status tabs, card grid, pagination |
| Public Info | `/competitions/[slug]` | Public | Venue, rules, pricing, quick links |
| Create | `/competitions/create` | Auth | 4-step wizard |
| Register | `/[slug]/register` | Auth | Partner entry, org selection, bulk events |
| Entries | `/[slug]/entries` | Public | Events with couple lists |
| Results | `/[slug]/results` | Public | Placements + tabulation |
| TBA | `/[slug]/tba` | Public/Auth | Filter, post/delete listings |
| Team Match | `/[slug]/team-match` | Auth | Submit/view ideas |
| Add/Drop | `/[slug]/add-drop` | Auth | Submit requests |
| Overview | `dashboard/` | Admin | Status controls, stats, checklist |
| Schedule | `dashboard/schedule` | Admin | Drag-and-drop blocks |
| Events | `dashboard/events` | Admin | Generate, create, grouped by session |
| Staff | `dashboard/staff` | Admin | User search, role assignment |
| Judges | `dashboard/judges` | Admin | Directory search, create, assign |
| Settings | `dashboard/settings` | Admin | 4 form sections + danger zone |
| Registrations | `dashboard/registrations` | Admin | Check-in, payments, detail view |
| Numbers | `dashboard/numbers` | Admin | Auto/manual assign |
| Add/Drop Mgmt | `dashboard/add-drop` | Admin | Safe/review groups, batch approve |
| Payments | `dashboard/payments` | Admin | Summary, Stripe Connect |
| Rounds | `dashboard/rounds` | Admin | Generate, expand, manage heats |
| Scoring | `dashboard/scoring` | Admin | Scrutineer controls, round start/stop, submissions, compute, review, publish, corrections |
| Schedule Est. | `dashboard/schedule-estimation` | Admin | Time breakdown, settings |
| Stats | `dashboard/stats` | Admin | Stats cards, awards calculator |
| Judge Tablet | `/judge` | Judge JWT | Comp code auth, callback marking, final ranking, submit/edit flow |
