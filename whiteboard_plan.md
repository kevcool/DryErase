# Whiteboard Platform Planning

**Project Name:** TBD

**Version:** 0.2

**Status:** Draft

---

# Vision

Develop a modern, self-hosted whiteboarding platform that helps teams brainstorm, facilitate workshops, plan work, and document ideas on an intuitive infinite canvas.

The long-term product should support real-time collaboration, enterprise administration, extensibility, and integrations. The first release should focus on becoming a fast, reliable, self-hosted board editor before expanding into full multiplayer facilitation.

---

# Product Strategy

## Delivery Tracking

Implementation work should be tracked in the project's configured issue tracker. Keep tracker configuration, identifiers, credentials, and personal operating procedures outside this public repository.

Initial roadmap:

- Collaborative whiteboard MVP
- Scaffold the application stack
- Implement board CRUD foundation
- Build infinite canvas shell
- Add frames and fit-to-frame navigation
- Add core canvas objects
- Implement visual imports and asset thumbnails
- Add autosave snapshots and recovery
- Add sharing roles and authenticated links
- Export board views and frames
- Add MVP quality and performance checks

## Guiding Principles

- Build a small, usable core before broadening the feature set
- Keep the canvas model simple enough to sync, export, and recover
- Prioritize responsiveness over decorative richness
- Design for self-hosting from the beginning
- Capture major architecture choices as ADRs before implementation hardens

## Initial Product Bet

The first version should prove that users can create, edit, save, reopen, and share useful boards. Real-time collaboration should be introduced after the core board model and canvas interaction patterns are stable.

## Reference Experience

The target experience should be a facilitated workshop board rather than a generic drawing app. A typical board may contain a large framed workshop area, imported slide or document content, diagrams, sticky notes, arrows, grouped concept areas, and facilitation controls around the canvas.

Important interaction patterns:

- A persistent board title and share controls in the top application bar
- A compact vertical creation toolbar for selection, pan, sticky notes, text, shapes, connectors, images, and future templates
- Large frames or sections that organize workshop content and can be exported or presented
- Imported visual artifacts such as slides, screenshots, PDFs, and images placed directly on the canvas
- Sticky notes and annotations layered on top of prepared material
- Facilitator controls that can later expose follow mode, voting, timers, participant controls, and presentation navigation
- Fast zooming and panning across large boards that mix small notes with large imported assets

---

# Goals

## Business Goals

- Reduce dependency on third-party collaboration platforms
- Support internal workshops and planning sessions
- Provide a credible self-hosted deployment path
- Establish an architecture that can later support enterprise security and integrations

## Product Goals

- Infinite canvas
- Fast board editing
- Durable autosave
- Sticky notes, text, and basic shapes
- Frames for organizing workshop content
- Image and document-derived visual imports
- Basic sharing and permissions
- Export for documentation
- Responsive desktop experience
- Foundation for future real-time collaboration

---

# Non-Goals

The initial release will NOT include:

- Graphic design capabilities
- Video conferencing
- Spreadsheet editing
- Complex CAD drawing
- Public marketplace
- Full plugin SDK
- Full offline mode
- Mobile-first editing
- SAML
- Advanced diagramming such as BPMN or UML

---

# Users

## Facilitator

Responsible for leading workshops.

Needs:

- Create and organize boards
- Prepare workshop materials
- Guide participants through a board
- Use simple facilitation tools such as timers and voting
- Control when participants can edit or follow along

## Team Member

Participates in workshops.

Needs:

- Create sticky notes
- Move and edit objects
- Read and contribute to shared boards
- Comment or vote when prompted
- Reopen boards after sessions

## Administrator

Responsible for platform management.

Needs:

- Configure authentication
- Manage users and permissions
- Monitor usage and health
- Control storage and retention
- Review audit events

---

# MVP Scope

The MVP is a single-user-plus-sharing board editor. It should be useful without real-time collaborative editing.

## Included

### Boards

- Create board
- Rename board
- Duplicate board
- Archive board
- Delete board
- List recent boards

### Canvas

- Infinite pan
- Zoom
- Grid
- Snap to grid
- Frames or sections
- Select and pan modes
- Fit to frame
- Selection
- Multi-select
- Move selected objects
- Resize selected objects
- Keyboard shortcuts
- Undo and redo

### Objects

- Sticky notes
- Plain text
- Rectangles
- Circles
- Diamonds
- Lines with optional arrowheads
- Image upload
- Imported screenshots, slide images, or PDF page images
- Icon or sticker library deferred unless needed for templates

### Persistence

- Autosave board changes
- Reopen saved boards
- Store image assets separately from board JSON
- Basic board recovery from recent autosave snapshots

### Sharing

- Invite user by email or username
- Owner, editor, and viewer roles
- Shareable board link for authenticated users

### Export

- Export board viewport or selected frame as PNG
- Export board or selected frame as PDF
- Structured JSON export is future work

## Deferred From MVP

- Live cursors
- Presence
- Shared editing
- CRDT or Operational Transform conflict resolution
- Threaded comments
- Presentation mode
- Voting
- Timers
- Templates
- Rich document editing
- Plugin SDK
- AI features

---

# Collaboration Roadmap

Real-time collaboration should be phased in after the MVP board model is stable.

## Phase A: Durable Single-User Editing

- Board state is persisted reliably
- Autosave is visible and recoverable
- Object model supports future sync operations

## Phase B: Awareness

- Presence
- Live cursors
- Active viewer list
- Follow another user without shared editing

## Phase C: Shared Editing

- Real-time object creation, movement, editing, and deletion
- Conflict handling
- Server-side validation of operations
- Collaboration latency monitoring

## Phase D: Facilitation

- Follow presenter
- Laser pointer
- Frames
- Voting
- Timer
- Lock board or selected objects
- Participant edit controls

---

# Functional Requirements

## FR-001

Users shall be able to create a board.

## FR-002

Users shall be able to rename, duplicate, archive, and delete boards they own.

## FR-003

Users shall be able to create, move, resize, copy, and delete supported canvas objects.

## FR-004

Users shall be able to create frames or sections that group workshop content.

## FR-005

Users shall be able to import images, screenshots, and document-derived page images to a board.

## FR-006

Users shall be able to undo and redo recent board edits.

## FR-007

The system shall automatically save board changes.

## FR-008

Users shall be able to reopen saved boards.

## FR-009

Users shall be able to invite authenticated collaborators with viewer or editor permissions.

## FR-010

Users shall be able to export a board view or frame as PNG or PDF.

## FR-011

Administrators shall be able to configure authentication and manage users.

---

# Non-Functional Requirements

## Performance

- Initial application load should complete in under 3 seconds on a typical modern laptop and broadband connection
- Pan, zoom, drag, and resize interactions should target 60 FPS for ordinary boards
- MVP boards should support at least 2,000 simple objects comfortably
- The long-term architecture should support 20,000+ simple objects through viewport rendering, batching, and object indexing
- Image-heavy boards may have lower practical limits and should use thumbnailing or progressive loading
- Large imported assets should load progressively so users can navigate the board before every asset is fully rendered

## Availability

- MVP target: reliable self-hosted deployment with documented backup and restore
- Long-term target: 99.9% uptime for production deployments

## Security

- OIDC support
- Local bootstrap administrator
- Role-based board permissions
- Audit logging for administration and sharing events
- Encryption in transit
- Encryption at rest where supported by deployment storage
- SAML deferred until enterprise phase

## Scalability

MVP should support:

- Hundreds of boards
- Dozens of users
- Single application instance

Long-term architecture should support:

- Thousands of boards
- Hundreds of concurrent users
- Multiple application instances
- Horizontal WebSocket scaling

## Reliability

- Autosave failures must be visible to users
- Board saves should be idempotent
- Recent autosave snapshots should support recovery from accidental destructive edits
- Asset upload failures should not corrupt board state

---

# Technical Architecture

## Frontend

- React
- TypeScript
- Canvas rendering library such as Konva.js, Excalidraw-style canvas, or tldraw-style architecture
- Zustand or equivalent local state management
- Command history for undo and redo

## Backend

- Node.js
- NestJS or equivalent structured HTTP/WebSocket framework
- PostgreSQL
- Redis for future presence, pub/sub, and distributed coordination
- WebSockets for future real-time collaboration

## Storage

- PostgreSQL for users, boards, permissions, object metadata, and snapshots
- S3-compatible object storage for uploaded assets and export artifacts
- Optional local filesystem storage for development deployments

## Authentication

- Local bootstrap administrator
- OAuth2 / OpenID Connect
- SAML in a later enterprise phase

## Data Model Draft

### User

- id
- display name
- email
- authentication provider
- created at
- last seen at

### Board

- id
- owner id
- name
- status
- created at
- updated at
- archived at

### Board Membership

- board id
- user id
- role: owner, editor, viewer
- invited by
- created at

### Board Object

- id
- board id
- type
- parent frame id, when applicable
- position
- size
- rotation
- z index
- style
- content
- asset id, when applicable
- created by
- updated by
- created at
- updated at

### Frame or Section

- id
- board id
- name
- position
- size
- sort order
- created by
- updated by
- created at
- updated at

### Asset

- id
- board id
- storage key
- mime type
- size
- width
- height
- source type: upload, screenshot, pdf page, slide page, export
- thumbnail storage key
- uploaded by
- created at

### Board Snapshot

- id
- board id
- snapshot type: autosave, manual, export
- storage location or JSON payload
- created by
- created at

### Future Comment

- id
- board id
- object id or canvas position
- parent comment id
- body
- status
- created by
- created at
- resolved at

---

# Epics

## Epic 1: Board Management

Features:

- Create board
- Rename board
- Duplicate board
- Archive board
- Delete board
- Recent boards

## Epic 2: Canvas Editor

Features:

- Infinite canvas
- Zoom
- Pan
- Select and pan modes
- Grid
- Snap
- Fit to frame
- Selection
- Multi-select
- Keyboard shortcuts
- Undo and redo

## Epic 3: Canvas Objects

Features:

- Sticky notes
- Text
- Basic shapes
- Lines and arrowheads
- Frames and sections
- Images
- Imported page images from PDFs or slide decks
- Object copy and paste

## Epic 4: Persistence and Recovery

Features:

- Autosave
- Save status
- Asset upload lifecycle
- Asset thumbnails
- Imported document page lifecycle
- Recent snapshot recovery
- Export to PNG and PDF

## Epic 5: Sharing and Permissions

Features:

- Invite collaborators
- Board roles
- Authenticated share links
- Permission enforcement

## Epic 6: Real-Time Collaboration

Features:

- Presence
- Live cursors
- Shared editing
- Synchronization
- Conflict handling

## Epic 7: Facilitation

Features:

- Presentation frame navigation
- Follow mode
- Laser pointer
- Timer
- Voting
- Participant controls
- Object locking

## Epic 8: Administration

Features:

- Authentication
- User management
- Permissions
- Monitoring
- Audit logs
- Backup and restore guidance

---

# Architecture Decision Records

Initial ADR candidates:

- ADR-001: Rendering engine selection
- ADR-002: Board persistence model: snapshots, event log, or hybrid
- ADR-003: Collaboration model: CRDT, Operational Transform, or server-authoritative operations
- ADR-004: Deployment model: single tenant first or multi-tenant first
- ADR-005: Authentication model: local auth, OIDC, or both
- ADR-006: Asset storage model
- ADR-007: Export architecture
- ADR-008: Document import architecture for PDFs, slides, and screenshots
- ADR-009: Frame model: separate entity or specialized board object

---

# Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Real-time synchronization complexity | High | Defer shared editing until object model is stable; document collaboration ADR |
| Large board performance | High | Use viewport rendering, batching, and performance budgets from the start |
| Autosave data loss | High | Use idempotent saves, save status, and recoverable snapshots |
| Rendering library lock-in | Medium | Prototype core interactions before committing |
| Imported asset performance | High | Generate thumbnails, lazy-load full assets, and cap initial render work |
| Storage costs | Medium | Use asset lifecycle policies and thumbnail generation |
| Browser compatibility | Medium | Define supported browsers and use progressive enhancement |
| Scope expansion | High | Keep MVP separate from collaboration and facilitation phases |

---

# Success Metrics

## MVP Metrics

- Average board load time
- Save success rate
- Autosave failure rate
- Board reopen success rate
- Export success rate
- Median interaction frame time on common boards
- Number of created boards
- Number of active users

## Long-Term Metrics

- Collaboration latency
- Concurrent editors per board
- Average workshop duration
- Voting and facilitation usage
- User satisfaction
- Administrator setup time

---

# Development Roadmap

## Phase 1: Foundation

- Project scaffold
- Authentication baseline
- Board CRUD
- Basic PostgreSQL schema
- Local development deployment

## Phase 2: Core Editor

- Infinite canvas
- Pan and zoom
- Selection
- Select and pan modes
- Frames and fit-to-frame navigation
- Sticky notes
- Text
- Basic shapes
- Undo and redo

## Phase 3: Persistence and Sharing

- Autosave
- Board snapshots
- Image upload
- PDF or slide page import as canvas images
- Asset thumbnails
- Export to PNG and PDF
- Invite collaborators
- Viewer and editor roles

## Phase 4: Awareness

- Presence
- Live cursors
- Active users list
- Follow user

## Phase 5: Shared Editing

- Real-time object operations
- Conflict handling
- Distributed sync
- Collaboration load testing

## Phase 6: Facilitation

- Presentation frames
- Follow presenter
- Laser pointer
- Timer
- Voting
- Participant controls

## Phase 7: Enterprise and Extensibility

- SAML
- Advanced audit logging
- Integrations
- Plugin SDK
- AI clustering and summaries

---

# Testing Strategy

- Unit tests for object model, permissions, and command history
- Integration tests for board persistence and asset upload
- API tests for board CRUD, sharing, and auth boundaries
- Canvas interaction tests for selection, pan mode, movement, resizing, frames, undo, and redo
- Screenshot or visual regression tests for core editor states
- Import tests for PDFs, slide-derived images, screenshots, and thumbnail generation
- Load tests for large boards and future collaboration paths
- Backup and restore verification for self-hosted deployments

---

# Open Questions

- Which rendering engine should be used?
- Should board persistence use snapshots, an event log, or a hybrid model?
- Should shared editing use CRDT, Operational Transform, or server-authoritative operations?
- Should the first deployment model be strictly single-tenant?
- What browsers are officially supported?
- How much mobile viewing support is required before mobile editing?
- Is offline read-only mode required before full offline editing?
- What export fidelity is acceptable for PNG and PDF?
- Should PDF and slide imports preserve searchable text later, or are rendered page images enough for MVP?
- Should frames be stored as their own entity or as a special board object type?

---

# Notes

This document represents the planning baseline and should evolve alongside implementation. Major architectural decisions should be documented as Architecture Decision Records. Detailed user behavior should be captured in Gherkin feature files once MVP flows are selected.
