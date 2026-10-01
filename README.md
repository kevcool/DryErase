# DryErase

DryErase is a self-hosted collaborative whiteboard platform in early development.

The first milestone is a fast board editor with frames, core canvas objects, visual imports, autosave, sharing, and export. Real-time shared editing and advanced facilitation come later.

## License

DryErase is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`). The complete license is in [LICENSE](LICENSE).

When distributing a modified version, provide the corresponding source under AGPLv3 and retain applicable copyright and third-party notices. If a modified version is run as a network service, its users must be offered the corresponding source. This includes GPLv3-compatible combined works as permitted by AGPLv3 section 13. Dependency licenses remain their respective authors' licenses; `package-lock.json` records the resolved dependency metadata used by this project.

## Workspace

- `apps/frontend`: Vite, React, TypeScript whiteboard UI
- `apps/backend`: TypeScript API service
- `packages/shared`: shared contracts and constants
- `whiteboard_plan.md`: planning baseline and product roadmap
- `AGENTS.md`: repository workflow and guardrails for agentic development

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
```

Create `.env.local` from `.env.example` if one does not exist yet. Merge only local application settings into an existing file rather than replacing it.

Keep secrets in `.env.local`; it is ignored by Git.

## Development

Start frontend and backend together:

```bash
npm run dev
```

Frontend:

```bash
npm run dev:frontend
```

Backend:

```bash
npm run dev:backend
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend health: `http://127.0.0.1:5050/health`

## Board API

The current development API uses a simple `X-DryErase-User-Id` header as an auth boundary until real authentication lands.

- `GET /api/boards`
- `POST /api/boards` with `{ "name": "Workshop" }`
- `GET /api/boards/:boardId`
- `PATCH /api/boards/:boardId` with `{ "name": "New name" }`
- `POST /api/boards/:boardId/duplicate`
- `POST /api/boards/:boardId/archive`
- `POST /api/boards/:boardId/restore`
- `DELETE /api/boards/:boardId`
- `POST /api/boards/:boardId/frames` with `{ "name": "Frame", "x"?: 0, "y"?: 0, "width"?: 1180, "height"?: 820 }`
- `PATCH /api/boards/:boardId/frames/:frameId` with `{ "name"?, "x"?, "y"?, "width"?, "height"?, "sortOrder"? }`
- `DELETE /api/boards/:boardId/frames/:frameId`
- `POST /api/boards/:boardId/objects` with `{ "type": "sticky"|"text"|"rectangle"|"ellipse"|"diamond"|"connector"|"image", "frameId"?, "assetId"?, "x"?, "y"?, "width"?, "height"?, "content"? }`
- `PATCH /api/boards/:boardId/objects/:objectId` with `{ "x"?, "y"?, "width"?, "height"?, "content"?, "rotation"?, "zIndex"?, "style"? }`
- `DELETE /api/boards/:boardId/objects/:objectId`
- `POST /api/boards/:boardId/assets` as multipart form data with `file`, optional `frameId`, `x`, `y`, `width`, and `height`
- `GET /api/boards/:boardId/assets/:storageKey`
- `GET /api/boards/:boardId/snapshots`
- `POST /api/boards/:boardId/snapshots`
- `POST /api/boards/:boardId/snapshots/:snapshotId/restore`

Boards are stored in `data/boards.json` by default. Uploaded assets are stored in `data/assets`. Override with `DRYERASE_BOARD_STORE_PATH` and `DRYERASE_ASSET_STORE_PATH`.

## Current Editor Gestures

- Select the hand tool or hold Space to pan
- Drag empty canvas space to pan without switching tools
- Use the mouse wheel to zoom toward the pointer
- Use the frame panel to create, select, fit, rename, and delete frames
- Use the plus button in the viewport controls to create from the active object tool
- Use the top toolbar for select, pan, connector mode, image upload, and frames
- Open Components from the top toolbar to create sticky notes, text, shapes, workshop items, and assets
- Select an object to reveal side link handles, then drag a handle to another object's exposed link point to create an attached diagram arrow
- Select a connector to switch between line, arrow, and double-arrow variants
- Select a connector to adjust line thickness presets
- Select an object to edit its fill, border, text, or connector line color in the style inspector
- Double-click a sticky note, text box, or shape, or select it and press Enter, to annotate it inline
- Double-click the image tool, or select it and press the viewport plus button, to upload PNG, JPEG, WebP, or GIF images
- Drag selected frames or objects in select mode
- Click empty canvas space or press Escape to clear the selected object
- Press Delete or Backspace to remove the selected frame when no object is selected
- Use Arrow keys to nudge the selected object by 1px, or Shift+Arrow to nudge by 10px
- Use Cmd/Ctrl+C and Cmd/Ctrl+V to copy and paste the selected object, or Cmd/Ctrl+D to duplicate it
- Press Delete or Backspace to remove the selected object
- Use the recovery panel to save a manual snapshot or restore one of the recent autosave snapshots

## Verification

```bash
npm run typecheck
npm run build
```
