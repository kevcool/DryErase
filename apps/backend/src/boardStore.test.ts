import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { BoardStore } from "./boardStore.js";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "dryerase-board-store-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createStore() {
  return new BoardStore(path.join(tempDir, "boards.json"));
}

test("creates, renames, duplicates, archives, restores, and deletes owned boards", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Workshop");

  assert.equal(created.board.name, "Workshop");
  assert.equal(created.board.status, "active");
  assert.equal(created.board.frames[0]?.name, "Frame 1");
  assert.deepEqual(created.board.objects, []);

  const renamed = await store.renameBoard("user-1", created.board.id, "Renamed Workshop");
  assert.equal(renamed?.board.name, "Renamed Workshop");

  const duplicate = await store.duplicateBoard("user-1", created.board.id);
  assert.equal(duplicate?.board.name, "Renamed Workshop Copy");

  const archived = await store.archiveBoard("user-1", created.board.id);
  assert.equal(archived?.board.status, "archived");
  assert.ok(archived?.board.archivedAt);

  const restored = await store.restoreBoard("user-1", created.board.id);
  assert.equal(restored?.board.status, "active");
  assert.equal(restored?.board.archivedAt, null);

  assert.equal(await store.deleteBoard("user-1", duplicate!.board.id), true);
  const listed = await store.listBoards("user-1");
  assert.deepEqual(
    listed.boards.map((board) => board.id),
    [created.board.id]
  );
});

test("does not expose boards across owners", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Private board");

  assert.equal(await store.getBoard("other-user", created.board.id), null);
  assert.equal(await store.renameBoard("other-user", created.board.id, "Nope"), null);
  assert.equal(await store.deleteBoard("other-user", created.board.id), false);

  const otherBoards = await store.listBoards("other-user");
  assert.deepEqual(otherBoards.boards, []);
});

test("grants editor access through an authenticated share link", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Shared board");
  const shareLink = await store.createShareLink("owner", created.board.id, "editor", "editor-token-hash");

  assert.ok(shareLink);
  assert.equal(await store.getBoard("editor", created.board.id), null);

  const accepted = await store.acceptShareLink("editor", "editor-token-hash");
  assert.equal(accepted?.board.currentUserRole, "editor");
  assert.equal(accepted?.board.shareLinks[0]?.id, shareLink?.id);
  assert.equal("tokenHash" in (accepted?.board.shareLinks[0] ?? {}), false);

  const listed = await store.listBoards("editor");
  assert.equal(listed.boards[0]?.role, "editor");
  assert.equal(await store.renameBoard("editor", created.board.id, "Nope"), null);
  assert.equal(await store.deleteBoard("editor", created.board.id), false);

  const object = await store.createObject("editor", created.board.id, {
    type: "sticky",
    content: "Editable"
  });
  assert.equal(object?.object.content, "Editable");
});

test("keeps viewers read-only and revoking prevents further link redemption", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "View-only board");
  const shareLink = await store.createShareLink("owner", created.board.id, "viewer", "viewer-token-hash");

  assert.ok(shareLink);
  const accepted = await store.acceptShareLink("viewer", "viewer-token-hash");
  assert.equal(accepted?.board.currentUserRole, "viewer");
  assert.ok(await store.getBoard("viewer", created.board.id));
  assert.equal(
    await store.createObject("viewer", created.board.id, { type: "sticky", content: "No writes" }),
    null
  );
  assert.equal(await store.createManualSnapshot("viewer", created.board.id), null);

  assert.equal(await store.revokeShareLink("owner", created.board.id, shareLink.id), true);
  assert.equal(await store.acceptShareLink("new-viewer", "viewer-token-hash"), null);
  assert.ok(await store.getBoard("viewer", created.board.id));
});

test("creates, updates, and deletes frames on an owned board", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Workshop");

  assert.equal(created.board.frames.length, 1);

  const frame = await store.createFrame("user-1", created.board.id, {
    name: "Concepts",
    x: 240,
    y: 320,
    width: 900,
    height: 640
  });

  assert.equal(frame?.frame.name, "Concepts");
  assert.equal(frame?.board.frames.length, 2);

  const object = await store.createObject("user-1", created.board.id, {
    type: "ellipse",
    frameId: frame!.frame.id,
    x: 300,
    y: 380
  });

  const moved = await store.updateFrame("user-1", created.board.id, frame!.frame.id, {
    name: "Principles",
    x: 360,
    y: 420
  });

  assert.equal(moved?.frame.name, "Principles");
  assert.equal(moved?.frame.x, 360);
  assert.equal(moved?.frame.y, 420);
  const movedObject = moved?.board.objects.find((item) => item.id === object?.object.id);
  assert.equal(movedObject?.x, 420);
  assert.equal(movedObject?.y, 480);

  const resized = await store.updateFrame("user-1", created.board.id, frame!.frame.id, {
    x: 320,
    y: 400,
    width: 940,
    height: 680,
    moveAttachedObjects: false
  });
  const resizedObject = resized?.board.objects.find((item) => item.id === object?.object.id);
  assert.equal(resized?.frame.x, 320);
  assert.equal(resized?.frame.y, 400);
  assert.equal(resizedObject?.x, 420);
  assert.equal(resizedObject?.y, 480);

  const deleted = await store.deleteFrame("user-1", created.board.id, frame!.frame.id);
  assert.equal(deleted?.board.frames.length, 1);

  const deletedLast = await store.deleteFrame("user-1", created.board.id, created.board.frames[0]!.id);
  assert.equal(deletedLast?.board.frames.length, 0);
});

test("does not mutate frames across owners", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Private board");
  const frame = created.board.frames[0];

  assert.equal(
    await store.updateFrame("other-user", created.board.id, frame.id, { name: "Nope" }),
    null
  );
  assert.equal(await store.deleteFrame("other-user", created.board.id, frame.id), null);

  const owned = await store.getBoard("owner", created.board.id);
  assert.equal(owned?.board.frames[0]?.name, "Frame 1");
});

test("creates, updates, and deletes canvas objects", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Objects board");
  const frameId = created.board.frames[0]!.id;

  const object = await store.createObject("user-1", created.board.id, {
    type: "sticky",
    frameId,
    x: 180,
    y: 220,
    content: "A useful note"
  });

  assert.equal(object?.object.type, "sticky");
  assert.equal(object?.object.frameId, frameId);
  assert.equal(object?.object.content, "A useful note");
  assert.equal(object?.object.style.strokeVisible, false);

  const moved = await store.updateObject("user-1", created.board.id, object!.object.id, {
    x: 320,
    y: 360,
    content: "A moved note",
    style: { strokeVisible: false }
  });

  assert.equal(moved?.object.x, 320);
  assert.equal(moved?.object.y, 360);
  assert.equal(moved?.object.content, "A moved note");
  assert.equal(moved?.object.style.strokeVisible, false);

  const deleted = await store.deleteObject("user-1", created.board.id, object!.object.id);
  assert.equal(deleted?.board.objects.length, 0);
});

test("creates prompt cards with workshop defaults", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Prompt board");

  const prompt = await store.createObject("user-1", created.board.id, { type: "prompt" });

  assert.equal(prompt?.object.type, "prompt");
  assert.equal(prompt?.object.content, "What should we explore?");
  assert.equal(prompt?.object.width, 320);
  assert.equal(prompt?.object.style.strokeVisible, false);
});

test("persists freehand stroke points", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Ink board");
  const strokePoints = [
    { x: 140, y: 180 },
    { x: 168, y: 202 },
    { x: 216, y: 194 }
  ];

  const stroke = await store.createObject("user-1", created.board.id, {
    type: "stroke",
    x: 132,
    y: 172,
    width: 92,
    height: 38,
    strokePoints,
    style: { stroke: "#2563eb", strokeWidth: 6 }
  });

  assert.deepEqual(stroke?.object.strokePoints, strokePoints);
  assert.equal(stroke?.object.style.stroke, "#2563eb");
  assert.equal(stroke?.object.style.strokeWidth, 6);

  const reloaded = await store.getBoard("user-1", created.board.id);
  assert.deepEqual(reloaded?.board.objects[0]?.strokePoints, strokePoints);
});

test("persists icon objects with their selected icon key", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Icon board");

  const icon = await store.createObject("user-1", created.board.id, {
    type: "icon",
    frameId: null,
    content: "number-7",
    style: { textColor: "#2563eb" }
  });

  assert.equal(icon?.object.type, "icon");
  assert.equal(icon?.object.frameId, null);
  assert.equal(icon?.object.content, "number-7");
  assert.equal(icon?.object.style.textColor, "#2563eb");

  const reloaded = await store.getBoard("user-1", created.board.id);
  assert.equal(reloaded?.board.objects[0]?.content, "number-7");
});

test("persists object group assignments", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Grouped objects board");

  const first = await store.createObject("user-1", created.board.id, {
    type: "rectangle",
    groupId: "group-1"
  });
  const second = await store.createObject("user-1", created.board.id, {
    type: "icon",
    groupId: "group-1",
    content: "number-1"
  });

  assert.equal(first?.object.groupId, "group-1");
  assert.equal(second?.object.groupId, "group-1");

  const ungrouped = await store.updateObject("user-1", created.board.id, second!.object.id, { groupId: null });
  assert.equal(ungrouped?.object.groupId, null);
});

test("persists connector links between canvas objects", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Connector board");
  const frameId = created.board.frames[0]!.id;

  const source = await store.createObject("user-1", created.board.id, {
    type: "rectangle",
    frameId,
    x: 100,
    y: 120
  });
  const target = await store.createObject("user-1", created.board.id, {
    type: "ellipse",
    frameId,
    x: 420,
    y: 180
  });
  const connector = await store.createObject("user-1", created.board.id, {
    type: "connector",
    frameId,
    x: 210,
    y: 180,
    width: 320,
    height: 20,
    rotation: 12,
    connection: {
      sourceObjectId: source!.object.id,
      targetObjectId: target!.object.id,
      sourceSide: "right",
      targetSide: "left",
      route: "elbow"
    }
  });

  assert.deepEqual(connector?.object.connection, {
    sourceObjectId: source!.object.id,
    targetObjectId: target!.object.id,
    sourceSide: "right",
    targetSide: "left",
    route: "elbow"
  });
  assert.equal(connector?.object.rotation, 12);
  assert.equal(connector?.object.height, 20);

  const deleted = await store.deleteObject("user-1", created.board.id, source!.object.id);
  assert.equal(deleted?.board.objects.some((item) => item.id === connector!.object.id), false);
});

test("does not mutate canvas objects across owners", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Private objects");
  const object = await store.createObject("owner", created.board.id, {
    type: "text",
    content: "Secret"
  });

  assert.equal(
    await store.updateObject("other-user", created.board.id, object!.object.id, { content: "Nope" }),
    null
  );
  assert.equal(await store.deleteObject("other-user", created.board.id, object!.object.id), null);

  const owned = await store.getBoard("owner", created.board.id);
  assert.equal(owned?.board.objects[0]?.content, "Secret");
});

test("creates image assets with linked image objects", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Asset board");
  const frameId = created.board.frames[0]!.id;

  const asset = await store.createImageAsset("user-1", created.board.id, {
    storageKey: "sample.png",
    originalName: "sample.png",
    mimeType: "image/png",
    size: 128,
    url: "/api/boards/board-1/assets/sample.png",
    thumbnailUrl: "/api/boards/board-1/assets/sample.png",
    frameId,
    x: 240,
    y: 260,
    width: 420,
    height: 280
  });

  assert.equal(asset?.asset.originalName, "sample.png");
  assert.equal(asset?.object.type, "image");
  assert.equal(asset?.object.assetId, asset?.asset.id);
  assert.equal(asset?.board.assets.length, 1);
  assert.equal(asset?.board.objects.length, 1);
});

test("does not create assets across owners", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Private assets");

  assert.equal(
    await store.createImageAsset("other-user", created.board.id, {
      storageKey: "sample.png",
      originalName: "sample.png",
      mimeType: "image/png",
      size: 128,
      url: "/api/boards/board-1/assets/sample.png",
      thumbnailUrl: "/api/boards/board-1/assets/sample.png"
    }),
    null
  );
});

test("duplicates image assets and remaps linked image objects", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Duplicated assets");
  const asset = await store.createImageAsset("user-1", created.board.id, {
    storageKey: "sample.png",
    originalName: "sample.png",
    mimeType: "image/png",
    size: 128,
    url: "/api/boards/board-1/assets/sample.png",
    thumbnailUrl: "/api/boards/board-1/assets/sample.png"
  });

  const duplicate = await store.duplicateBoard("user-1", created.board.id);

  assert.equal(duplicate?.board.assets.length, 1);
  assert.equal(duplicate?.board.objects.length, 1);
  assert.notEqual(duplicate?.board.assets[0]?.id, asset?.asset.id);
  assert.equal(duplicate?.board.objects[0]?.assetId, duplicate?.board.assets[0]?.id);
  assert.match(duplicate?.board.assets[0]?.url ?? "", /board-2/);
});

test("records snapshots and restores board state", async () => {
  const store = createStore();
  const created = await store.createBoard("user-1", "Recoverable board");
  const frameId = created.board.frames[0]!.id;
  const object = await store.createObject("user-1", created.board.id, {
    type: "sticky",
    frameId,
    content: "Keep me"
  });
  const manual = await store.createManualSnapshot("user-1", created.board.id);

  assert.equal(manual?.snapshot.type, "manual");
  assert.ok(manual?.board.snapshots.length);

  await store.deleteObject("user-1", created.board.id, object!.object.id);
  const afterDelete = await store.getBoard("user-1", created.board.id);
  assert.equal(afterDelete?.board.objects.length, 0);

  const restored = await store.restoreSnapshot("user-1", created.board.id, manual!.snapshot.id);
  assert.equal(restored?.board.objects.length, 1);
  assert.equal(restored?.board.objects[0]?.content, "Keep me");

  const snapshots = await store.listSnapshots("user-1", created.board.id);
  assert.ok((snapshots?.snapshots.length ?? 0) >= 3);
  assert.equal("board" in snapshots!.snapshots[0]!, false);
});

test("does not expose snapshots across owners", async () => {
  const store = createStore();
  const created = await store.createBoard("owner", "Private snapshots");
  const snapshot = created.board.snapshots[0]!;

  assert.equal(await store.listSnapshots("other-user", created.board.id), null);
  assert.equal(await store.createManualSnapshot("other-user", created.board.id), null);
  assert.equal(await store.restoreSnapshot("other-user", created.board.id, snapshot.id), null);
});
