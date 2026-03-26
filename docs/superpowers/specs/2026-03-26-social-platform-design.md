# Social Platform Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Social networking features for the Figure Graph ballroom dance platform

---

## Overview

Extend Figure Graph from a syllabus visualization tool into a social platform for the ballroom dance community. Users can share routines, write technique articles, interact with posts, join organizations, and communicate via real-time messaging.

This spec covers six major subsystems built across seven implementation phases (Phase 0–6). The competition management system (organization-hosted judging, scheduling, registration) is explicitly out of scope but the organization model is designed to be extensible toward it.

---

## Architecture: Modular Monolith

### Rationale

The platform has three major product areas planned:
1. **Syllabus/Graph Tool** — existing figure browsing and visualization
2. **Social Platform & Organizations** — this spec
3. **Competition Management** — future (judging, scheduling, registration)

A modular monolith keeps a single deployable app with clear internal domain boundaries. Each domain owns its schema, routes, and components. Cross-domain access goes through explicit query/type exports. This avoids the overhead of microservices while maintaining clean seams for potential future extraction.

### Domain Structure

```
src/
  domains/
    syllabus/           # existing figure graph, dance browsing
      schema.ts         # dances, figures, figure_edges
      routers/          # dance.ts, figure.ts
      components/       # graph/, dance/, figure-list-filters, etc.
      app/              # dances/[dance]/..., graph routes
    social/
      schema.ts         # posts, comments, likes, follows, saves, folders
      routers/          # post.ts, comment.ts, follow.ts, feed.ts, save.ts
      components/       # feed/, post-card/, editor/, comment-thread/
      app/              # feed/, explore/, posts/[id]
    messaging/
      schema.ts         # conversations, messages, channels
      routers/          # conversation.ts, message.ts, channel.ts
      components/       # chat/, message-list/, channel-sidebar/
      app/              # messages/
      lib/              # ably.ts (real-time client setup)
    orgs/
      schema.ts         # organizations, memberships, invites, join_requests
      routers/          # org.ts, membership.ts
      components/       # org-card/, member-list/, org-settings/
      app/              # orgs/, orgs/[slug]/
    routines/           # extracted from current src/
      schema.ts         # routines, routine_entries
      routers/          # routine.ts
      components/       # routine-builder/, figure-picker/
      app/              # routines/
  shared/
    auth/               # Clerk helpers, user sync, protectedProcedure
    db/                 # connection, shared enums (levels)
    ui/                 # shadcn components, cn() util
    components/         # layout, nav, header (app shell)
    lib/                # trpc client, utils
    schema.ts           # users table (shared across all domains)
```

### Cross-Domain Rules

- Any domain can import from `shared/`
- Domains can import from each other's explicit `queries.ts` or `types.ts` exports
- No cross-domain component imports — shared UI goes in `shared/ui/`

---

## Infrastructure

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Hosting | Vercel | Web app deployment, serverless functions |
| Database | Neon PostgreSQL | All persistent data |
| ORM | Drizzle | Schema, queries, migrations |
| API | tRPC v11 | Type-safe API layer for mutations and client-side queries |
| Auth | Clerk | Authentication, user management |
| Real-time | Ably | WebSocket messaging, presence, typing indicators |
| Editor | Tiptap (ProseMirror) | WYSIWYG markdown editor for articles |
| Framework | Next.js 15 (App Router) | Server components for reads, client components for interactivity |

---

## Data Model

### Shared: Users Table (Extended)

The existing `users` table is extended with profile fields:

```
users (existing table, extended)
  id                      text PK           -- Clerk user ID
  displayName             text
  username                text unique       -- @handle for profiles
  avatarUrl               text nullable
  bio                     text nullable
  competitionLevel        enum              -- newcomer, bronze, silver, gold, novice, prechamp, champ, professional
  competitionLevelHigh    enum nullable     -- second consecutive level if range selected; null if single level or professional
  isPrivate               boolean default false
  createdAt               timestamp
  updatedAt               timestamp
```

**Competition level enum values:** `newcomer`, `bronze`, `silver`, `gold`, `novice`, `prechamp`, `champ`, `professional`

**Level range rules:**
- A user selects one level, or two consecutive levels (e.g., silver + gold)
- If `professional` is selected, `competitionLevelHigh` must be null
- The application layer enforces consecutiveness

Note: These competition skill levels are distinct from the ISTD exam levels (student_teacher, associate, licentiate, fellow) used in the syllabus graph data.

### Social Domain

#### posts

```
posts
  id                      serial PK
  authorId                text FK → users nullable    -- null if org post
  orgId                   integer FK → organizations nullable  -- set if posted by an org
  type                    enum('routine_share', 'article')
  visibility              enum('public', 'followers', 'organization')
  visibilityOrgId         integer FK → organizations nullable  -- which org can see (when visibility = 'organization')
  title                   text nullable                -- required for articles, optional for routine shares
  body                    text nullable                -- markdown for articles, caption for routine shares
  routineId              integer FK → routines nullable  -- set for routine_share posts
  publishedAt             timestamp nullable            -- null = draft
  createdAt               timestamp
  updatedAt               timestamp
```

**Indexes:** `authorId`, `orgId`, `type`, `publishedAt`, `(visibility, publishedAt)` for feed queries

#### comments

```
comments
  id                      serial PK
  postId                  integer FK → posts
  authorId                text FK → users
  parentId                integer FK → comments nullable  -- null = top-level, set = reply (single level only)
  body                    text
  createdAt               timestamp
  updatedAt               timestamp
```

YouTube-style threading: top-level comments with a flat reply list underneath each. Replies cannot have replies (enforced at application layer).

**Indexes:** `postId`, `parentId`

#### likes

```
likes
  id                      serial PK
  userId                  text FK → users
  postId                  integer FK → posts nullable
  commentId               integer FK → comments nullable
  createdAt               timestamp
  unique(userId, postId)
  unique(userId, commentId)
```

Exactly one of `postId` or `commentId` must be set (enforced at application layer).

#### follows

```
follows
  id                      serial PK
  followerId              text FK → users
  followingId             text FK → users
  status                  enum('active', 'pending')   -- pending for private account follow requests
  createdAt               timestamp
  unique(followerId, followingId)
```

When a user follows a public account, status is immediately `active`. When following a private account, status is `pending` until the account owner approves, at which point it becomes `active`. Declining deletes the row.

#### save_folders

```
save_folders
  id                      serial PK
  userId                  text FK → users
  name                    text
  createdAt               timestamp
  updatedAt               timestamp
```

#### saved_posts

```
saved_posts
  id                      serial PK
  userId                  text FK → users
  postId                  integer FK → posts
  folderId                integer FK → save_folders nullable  -- null = "All Saved" (unsorted)
  createdAt               timestamp
  unique(userId, postId, folderId)
```

A post can exist in multiple folders simultaneously. A row with `folderId = null` represents the default "All Saved" collection. Deleting a folder moves its saved_posts rows to `folderId = null` rather than deleting them.

### Orgs Domain

#### organizations

```
organizations
  id                      serial PK
  slug                    text unique
  name                    text
  description             text nullable
  avatarUrl               text nullable
  membershipModel         enum('open', 'invite', 'request')
  ownerId                 text FK → users
  createdAt               timestamp
  updatedAt               timestamp
```

#### memberships

```
memberships
  id                      serial PK
  orgId                   integer FK → organizations
  userId                  text FK → users
  role                    enum('member', 'admin')
  createdAt               timestamp
  unique(orgId, userId)
```

The owner is tracked on the `organizations` table and also has a row in `memberships` with role `admin` for query simplicity (so "get all members" doesn't need a special UNION). The `ownerId` field on `organizations` is the authoritative source for ownership — the membership row just ensures the owner appears in standard member listings.

#### org_invites

```
org_invites
  id                      serial PK
  orgId                   integer FK → organizations
  invitedUserId           text FK → users nullable    -- null if invite link
  invitedBy               text FK → users
  token                   text unique nullable         -- for shareable invite links
  status                  enum('pending', 'accepted', 'declined', 'expired')
  createdAt               timestamp
  expiresAt               timestamp
```

#### join_requests

```
join_requests
  id                      serial PK
  orgId                   integer FK → organizations
  userId                  text FK → users
  status                  enum('pending', 'approved', 'rejected')
  reviewedBy              text FK → users nullable
  createdAt               timestamp
  reviewedAt              timestamp nullable
```

### Messaging Domain

#### conversations

```
conversations
  id                      serial PK
  type                    enum('direct', 'group', 'org_channel')
  name                    text nullable                -- null for DMs, set for groups/channels
  orgId                   integer FK → organizations nullable  -- set for org_channels
  createdAt               timestamp
  updatedAt               timestamp
```

For direct (1:1) conversations, only one conversation can exist between any two users (enforced at application layer by checking existing DM conversations before creating).

#### conversation_members

```
conversation_members
  id                      serial PK
  conversationId          integer FK → conversations
  userId                  text FK → users
  joinedAt                timestamp
  lastReadAt              timestamp nullable           -- for unread count calculation
  unique(conversationId, userId)
```

#### messages

```
messages
  id                      serial PK
  conversationId          integer FK → conversations
  senderId                text FK → users
  body                    text
  createdAt               timestamp
```

Future: add `messageType` enum for media messages when photo/video support lands.

**Indexes:** `conversationId`, `(conversationId, createdAt)` for paginated history

### Notifications (Shared)

```
notifications
  id                      serial PK
  userId                  text FK → users              -- recipient
  type                    enum('like', 'comment', 'reply', 'follow', 'follow_request', 'follow_accepted', 'message', 'org_invite', 'join_request', 'join_approved', 'org_post')
  actorId                 text FK → users nullable     -- who triggered it
  postId                  integer nullable
  commentId               integer nullable
  orgId                   integer nullable
  conversationId          integer nullable
  read                    boolean default false
  createdAt               timestamp
```

**Indexes:** `(userId, read, createdAt)` for unread queries

---

## Routines: Publishing Model

Routines have a visibility layer independent of posts:

- **Unpublished** (default): only visible to the creator in their own routine list
- **Published**: appears on the creator's profile routines tab, browsable by others (subject to account privacy)
- **Shared as post**: a published routine with an associated feed post containing a caption

Publishing to profile and sharing as a post are separate actions. A user can publish a routine without creating a feed post.

The `routines` table gains an `isPublished` boolean field (already exists in schema, default false).

Edits to a routine propagate everywhere since posts reference routines by ID, not by copied data. The user's routine list shows a published/draft indicator.

---

## Feed System

### Two-Tab Layout

**Following tab:** Posts from users you follow, newest first, with visibility filtering:
- Show public posts from followed users
- Show followers-only posts from followed users
- Show org-only posts if you share org membership with the author
- Show org profile posts if public, or if you're a member of that org

**Explore tab:** Recent public posts from any user or org. This is the discovery surface for newcomers.

### Pagination

Cursor-based (keyset) pagination using `(createdAt, id)` as the cursor. This avoids shifting-page issues when new posts arrive during browsing.

### Post Creation

**Routine shares:** Initiated from the routine list or routine detail page. User writes a caption, selects visibility, and publishes. The routine must be in published state.

**Articles:** Dedicated "Write" page with:
- Title field (plain text input)
- Tiptap WYSIWYG editor body
- Visibility selector
- Draft/publish toggle
- Auto-save (debounced tRPC mutation)
- Preview mode to see the rendered article

Drafts (`publishedAt = null`) are only visible to the author.

---

## Markdown Editor

### Technology: Tiptap

Tiptap is a headless rich-text editor built on ProseMirror. It provides a WYSIWYG editing experience while storing content as markdown via the Tiptap markdown extension.

### Initial Feature Set

- Headings (H1–H3)
- Bold, italic, strikethrough
- Ordered and unordered lists
- Blockquotes
- Code blocks
- Links
- Horizontal rules
- Image embedding (URL-based initially; upload when media support lands)

### Storage

Content is stored as markdown in `posts.body`. Markdown is portable, human-readable in the DB, and renders easily outside the editor (feed previews, API consumers).

---

## Interactions

### Likes

Toggle action with optimistic UI update. Like counts are derived via query (no denormalized counter initially — add caching if performance requires it). Users can like both posts and comments.

### Comments

YouTube-style threading:
- Top-level comments sorted by recency (newest first)
- Replies nested underneath each top-level comment, collapsible
- Reply count shown on the collapsed state
- Replies are flat (no nesting beyond one level, enforced at application layer)

### Share

- Generates a copyable link to the post
- For logged-in users: option to "share via DM" which opens the messaging flow with the post link pre-filled

### Save/Bookmark

- Bookmark icon on every post (filled = saved, unfilled = not saved)
- Clicking opens a dropdown showing the user's folders with checkmarks on folders this post is in
- User can select/deselect multiple folders
- Option to create a new folder inline
- All saves are private to the user
- "All Saved" is the implicit default collection (folderId = null)
- Deleting a folder moves its saved posts to "All Saved"

---

## Organizations

### Profile Page (`/orgs/[slug]`)

- Header: org name, avatar, description, member count
- Membership action button (contextual: Join / Request / Pending / Member)
- Tabs: Posts, Members, About
- Admins/owner access org settings page

### Membership Models (configurable per org)

- **Open**: user clicks Join, immediately a member
- **Request**: user clicks Request, admins see queue, approve/reject
- **Invite**: admins send invites to users or generate invite links, user accepts/declines

### Roles

- **Owner**: full control, can transfer ownership to any admin
- **Admin**: manage members, create org posts, manage channels, approve/reject requests
- **Member**: participate in org channels, see org-only content

Ownership transfer: owner selects an admin → atomic swap (old owner becomes admin, target becomes owner).

### Org Posting

Admins and owner can create posts on behalf of the org. These display the org's name and avatar as the author. Org posts can be public or org-only visibility.

### Org Channels (Messaging Integration)

Each org can have named channels visible to all members. Created by admins. A default "General" channel is created when the org is formed. Channels appear grouped under the org name in the messaging sidebar.

New members joining an org are automatically added to all org channels.

### Future Extensibility: Competition Hosting

The org model is intentionally designed to support future competition management:
- Owner/admin roles map to competition organizers
- The org profile tab pattern extends to a "Competitions" tab
- Membership provides a participant pool (competitions would also support external registration)
- Org channels support event coordination
- The `competitions` domain would reference `organizations.id` as host, with its own schema for judging, scheduling, and scoring

---

## Direct Messaging

### Conversation Types

- **Direct (1:1)**: created implicitly on first message between two users. Deduplicated — only one DM conversation per user pair.
- **Group**: created explicitly by a user who adds members. Any member can add others.
- **Org channel**: created by org admins, all org members have automatic access.

### Real-Time Architecture (Ably)

```
Client (browser)
  ↕ Ably SDK (WebSocket connection)
Ably Cloud
  ↕ Webhook (optional, for server-side processing)
Next.js API route → tRPC mutation → DB write
```

**Message send flow:**
1. User sends message via tRPC mutation → saved to DB, returns message with ID
2. Server publishes to the Ably channel for that conversation
3. All subscribed members receive the message instantly
4. Sender sees optimistic UI; receivers see Ably push

**Ably channel naming:** `conversation:{id}` for all conversation types.

**Token auth:** Server generates short-lived Ably tokens scoped to the channels the user has access to. Tokens are refreshed via a tRPC endpoint.

### Presence & Typing

- Ably's presence API tracks who's online in a conversation
- Typing indicators: client publishes a presence update when typing, debounced to avoid noise

### Unread Tracking

`conversation_members.lastReadAt` is updated when a user opens a conversation. Unread count = messages where `createdAt > lastReadAt`. Messaging sidebar displays unread badges per conversation.

### Message History

Loaded via tRPC query with cursor pagination (newest first). Ably is for live delivery only — the database is the source of truth for history.

### DM Privacy Rules

A user can initiate a DM with another user if:
- They follow each other (mutual follows), OR
- They share org membership, OR
- The recipient has a public account

This prevents unsolicited messages to private account users from strangers.

---

## Notifications

### Trigger Table

| Event | Recipient | Text Pattern |
|-------|-----------|-------------|
| Like on post | Post author | "{actor} liked your post" |
| Like on comment | Comment author | "{actor} liked your comment" |
| Comment on post | Post author | "{actor} commented on your post" |
| Reply to comment | Parent comment author | "{actor} replied to your comment" |
| New follower (public account) | Followed user | "{actor} started following you" |
| Follow request (private account) | Requested user | "{actor} requested to follow you" |
| Follow request accepted | Requester | "{actor} accepted your follow request" |
| New DM/group message | Conversation members | "{actor} sent you a message" |
| Org invite | Invited user | "You've been invited to join {org}" |
| Join request | Org admins | "{actor} requested to join {org}" |
| Join request approved | Requester | "You've been accepted into {org}" |
| Org post | Org members | "{org} published a new post" |

### UI

Bell icon in the site header with unread count badge. Clicking opens a dropdown panel with notifications grouped by time period (Today, This Week, Earlier). Each notification links to the relevant content. "Mark all as read" action at the top.

### Aggregation

Multiple likes on the same post within a short window collapse into "{actor} and {n} others liked your post" rather than generating individual notifications.

### Message Notification Suppression

DM notifications are suppressed if the user currently has that conversation open (determined client-side). If the conversation is open, messages are marked as read immediately.

### Future: Email & Push Notifications

The notification `type` enum is extensible. When email/push is implemented, add a `notification_preferences` table where users configure per-type delivery channels (in-app, email, push). The notification creation logic would check preferences before dispatching to each channel.

---

## User Profiles

### Profile Page (`/users/[username]`)

- Header: avatar, display name, @username, bio, competition level badge(s), org badges
- Follow button (or Follow Request for private accounts, or Following/Pending state)
- Follower/following counts
- Tabs: Posts, Routines

### Competition Level Display

Users select from: newcomer, bronze, silver, gold, novice, prechamp, champ, professional.

Optionally select two consecutive levels (e.g., "Silver/Gold"). Professional is always standalone.

Displayed as a badge on the profile header.

### Account Privacy

- **Public account**: anyone can follow (instant), posts with `followers` visibility visible to followers
- **Private account**: follow requests require approval, profile posts tab only visible to approved followers

---

## Implementation Phases

### Phase 0: Codebase Restructure
Reorganize existing code into the domain structure. No feature changes — file moves and import updates only. Verify build passes.

### Phase 1: User Profiles & Follows
Extend users table with profile fields. Build follow system with pending state for private accounts. Create profile pages with posts/routines tabs (empty initially).

### Phase 2: Posts & Feed
Posts table and creation flows. Tiptap editor for articles. Routine publishing toggle. Feed pages (Following + Explore) with cursor pagination. Visibility enforcement (org checks stubbed until Phase 4).

### Phase 3: Interactions
Likes on posts and comments. YouTube-style comment threads. Save/bookmark system with multi-folder support. Share link generation (copy URL). "Share via DM" is deferred to Phase 6 when messaging is available.

### Phase 4: Organizations
Org CRUD, profile pages, configurable membership flows. Org posting. Org-only visibility enforcement (complete Phase 2 stub). Ownership transfer.

### Phase 5: Notifications
Notification table and creation triggers across all existing features. Bell icon UI with dropdown panel. Aggregation logic for high-activity posts. Note: email/push deferred.

### Phase 6: Direct Messaging
Ably integration with token auth. 1:1 and group conversations. Org channels (depends on Phase 4). Presence, typing indicators, unread tracking. Message history pagination.

Each phase is a self-contained deliverable. Phase 2 has a soft dependency on Phase 4 for org visibility (stubbed and completed later).
