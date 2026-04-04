# Competition Organizer Guide

This guide covers creating and managing a ballroom dance competition on World of Floorcraft.

## Prerequisites

- You must be an **admin** or **owner** of an organization to create a competition
- The competition is always hosted under your organization

---

## Creating a Competition

### Step 1: Basic Info

Start by giving your competition a name and selecting which organization is hosting it. The system creates the competition in **draft** status and generates a URL-friendly slug (e.g., "Spring Fling 2026" → `spring-fling-2026`).

### Step 2: Schedule Setup

Your competition starts with a default 1-day template containing six sessions:

1. Smooth
2. Standard
3. Latin
4. Rhythm
5. Nightclub
6. Open Events

From here you can:
- **Rename sessions** to match your competition's format
- **Add or remove days** for multi-day competitions
- **Add breaks** between sessions (lunch, dinner, costume change, etc.)
- **Reorder sessions and breaks** by dragging them into the desired order
- **Set estimated times** for planning purposes

### Step 3: Events

Click **Generate Default Events** and select which styles your competition will offer. The system creates all events across all levels following standard ballroom competition grouping rules:

- **Lower levels** (Newcomer, Bronze): All dances are individual single-dance events
- **Higher levels** (Silver through Champ): Some dances are grouped into multi-dance events scored together (e.g., Gold Standard Waltz/Tango/Quickstep)

After generation, review the event list and:
- **Remove events** you don't want to offer
- **Edit event names** or groupings
- **Add custom events** that aren't covered by the defaults
- **Change which dances** are in a multi-dance event
- **Assign events to sessions** if they weren't auto-matched

Each event is automatically assigned to its matching session (e.g., Smooth events go to the "Smooth" session) when session names match the style.

### Step 4: Details (Optional)

Fill in additional competition information. All of these can be edited later from the dashboard:

- **Location**: Venue name, address, parking/directions notes
- **Description**: Home page content (supports markdown formatting)
- **Rules**: Competition rules page (supports markdown formatting)
- **Pricing**: Base registration fee
- **Settings**: Max final size (default 8), max preliminary heat size, starting competitor number, number exclusions

### Step 5: Publish

Review your competition setup, then change the status to make it visible:

- **Advertised** — Posted publicly, but registration not yet open
- **Accepting Entries** — Registration form is active

---

## Competition Lifecycle

Your competition moves through these statuses. You can transition freely in any direction — moving backward never deletes data.

| Status | What It Means |
|--------|--------------|
| **Draft** | Being set up. Only visible to org admins and assigned staff. |
| **Advertised** | Publicly visible on your org page. Registration not yet open. |
| **Accepting Entries** | Competitors can register and enter events. |
| **Entries Closed** | Registration closed. Competitors can submit add/drop requests for late changes. |
| **Running** | Competition is live. Judging active, real-time views enabled. |
| **Finished** | Competition complete. Results published, feedback form available. |

---

## Managing Staff

Assign platform users to staff roles for your competition. A single person can hold multiple roles.

| Role | Access |
|------|--------|
| **Scrutineer** | Full management access — equivalent to org admin for this competition. Runs day-of operations, manages scoring. |
| **Chairman** | Manages judge assignments and schedule. |
| **Emcee** | Schedule view with announcement notes and results for reading placements. |
| **Deck Captain** | On-floor check-in, scratch/unscratch couples, stay-on-floor indicators. |
| **Registration** | Registration table — check-in, payments, add/drop approvals. |

The scrutineer role is special: anyone assigned as scrutineer gets the same competition management permissions as an org admin, allowing them to update competition details, manage the schedule, and run events on comp day.

---

## Managing Judges

Judges are separate from platform user accounts — they don't need to sign up for World of Floorcraft. Instead, there's a global judge directory that grows as judges are added across competitions.

### Adding Judges

1. **Search** the existing directory by name
2. If not found, **create a new judge** with their first name, last name, optional initials (for tabulation table headers), and affiliation
3. **Assign the judge** to your competition

### Judge Tablet Authentication

For comp day, judges authenticate on tablets using a lightweight system:

1. Set a **competition code** (short identifier like "OSB" for Ohio Star Ball) — must be globally unique
2. Set a **master password** — shared across all judges for this competition

On the tablet, a judge enters the competition code, selects their name from the list, and enters the master password. The scrutineer typically sets up tablets before the competition begins.

---

## Default Event Groupings

When you generate default events, the system follows standard ballroom competition rules for which dances are grouped into multi-dance events at each level. Here's the full breakdown:

### Standard
| Level | Multi-Dance Event | Single-Dance Events |
|-------|------------------|-------------------|
| Newcomer | — | W, T, F, Q, VW |
| Bronze | — | W, T, F, Q, VW |
| Silver | W/Q | T, F, VW |
| Gold | W/T/Q | F, VW |
| Novice | W/F/Q | T, VW |
| Pre-champ | W/T/F/Q | VW |
| Champ | W/T/F/Q/VW | — |

### Smooth
| Level | Multi-Dance Event | Single-Dance Events |
|-------|------------------|-------------------|
| Newcomer | — | W, T, F, VW |
| Bronze | — | W, T, F, VW |
| Silver | — | W, T, F, VW |
| Gold | W/F | T, VW |
| Novice | W/T/F | VW |
| Pre-champ | W/T/F/VW | — |
| Champ | W/T/F/VW | — |

### Latin
| Level | Multi-Dance Event | Single-Dance Events |
|-------|------------------|-------------------|
| Newcomer | — | CC, S, R, PD, J |
| Bronze | — | CC, S, R, PD, J |
| Silver | CC/R | S, PD, J |
| Gold | CC/S/R | PD, J |
| Novice | CC/S/R | PD, J |
| Pre-champ | CC/S/R/J | PD |
| Champ | CC/S/R/PD/J | — |

### Rhythm
| Level | Multi-Dance Event | Single-Dance Events |
|-------|------------------|-------------------|
| Newcomer | — | CC, R, Sw, B, M |
| Bronze | — | CC, R, Sw, B, M |
| Silver | CC/R | Sw, B, M |
| Gold | CC/R/Sw | B, M |
| Novice | CC/R/Sw | B, M |
| Pre-champ | CC/R/Sw/B | M |
| Champ | CC/R/Sw/B/M | — |

### Nightclub
Dance list TBD — all single dances at all levels.

---

## Registration & Entries

Once your competition is in **Accepting Entries** status, competitors can register and enter events.

### How Registration Works

1. One partner **registers both** by entering the other partner's username
2. The system creates two linked registrations (one per person)
3. Either partner can later add, remove, or modify their entries
4. Competitors don't need to belong to an organization — they can enter unaffiliated
5. If partners belong to different orgs, they choose which org to enter under

A single person can also register solo (without a partner) — useful if they're still looking for a partner via the TBA board.

### Managing Entries

Competitors enter events as couples (leader + follower). They can:
- **Enter individual events** one at a time
- **Bulk-enter multiple events** at once (e.g., all Newcomer Smooth events)
- **Remove entries** before the entry deadline

Staff with the **deck captain** role can **scratch** entries on comp day (reversible toggle).

### Payment & Pricing

Two pricing models are available:

| Model | How It Works |
|-------|-------------|
| **Flat fee** (default) | One price covers all event entries. Set the base fee on the competition. |
| **Per event** | Each event has its own price. The amount owed recalculates as entries are added/removed. |

Optionally, create **pricing tiers** for discounted rates (e.g., student pricing).

**Collecting payment:**
- **Online**: Connect your Stripe account to accept card payments. Competitors pay via Stripe Checkout.
- **At the door**: Staff with the **registration** role can record cash, check, or other manual payments.

Refunds are recorded as separate negative-amount transactions, keeping a full audit trail.

### Competitor Numbers

Numbers are assigned to **leaders only** (the leader's number identifies the couple on the floor).

- **Auto-assign**: Assigns sequential numbers starting from your configured start number, skipping any excluded numbers
- **Manual assign**: Override with a specific number for any registration
- **Unassign**: Remove a number assignment

Configure number settings (start number, exclusions) from the competition dashboard before assigning.

### TBA (To Be Announced) Finder

Competitors looking for a partner can post to the TBA board:
- Specify the **style**, **level**, and **role** they're looking for
- Other competitors browse listings filtered by style
- Once a match is found, the poster marks the listing as fulfilled

TBA listings are public — anyone can browse them without logging in.

### Team Match

Competitors can submit team match ideas/suggestions via a text form. These submissions are visible only to competition staff.

---

## Tips

- **Start simple**: Create a 1-day competition first. You can add days and complexity later.
- **Generate then prune**: It's faster to generate all default events and remove what you don't need than to create each event manually.
- **Draft mode is safe**: Take your time setting up in draft. Nothing is visible to competitors until you change the status.
- **Backward transitions are safe**: If you accidentally move to "Accepting Entries" before you're ready, just move back to "Advertised" or "Draft". No data is lost.
- **Flat fee is simpler**: Unless you have a specific reason for per-event pricing, the flat fee model is easier to manage.
- **Auto-assign numbers last**: Wait until most entries are in before assigning competitor numbers, so the numbering is sequential without gaps.
