import assert from "node:assert/strict";
import test from "node:test";
import { CollaborationHub } from "./collaboration.js";

test("broadcasts presence and board revisions to connected sessions", () => {
  const hub = new CollaborationHub();
  const writes: string[] = [];
  const response = {
    status: () => response,
    set: () => response,
    flushHeaders: () => undefined,
    write: (message: string) => writes.push(message)
  };

  const disconnect = hub.connect("board-1", "session-1", "alex", "editor", response as never);
  hub.updatePresence("board-1", "session-1", "alex", "editor", {
    cursor: { x: 120, y: 240 },
    selectedObjectIds: ["object-1"]
  });
  hub.publishRevision("board-1", 4, "alex");

  assert.ok(writes.some((message) => message.includes('"cursor":{"x":120,"y":240}')));
  assert.ok(writes.some((message) => message.includes('"type":"board-revision","version":4')));
  disconnect();
});

test("ignores presence updates for disconnected sessions", () => {
  const hub = new CollaborationHub();
  const writes: string[] = [];
  const response = {
    status: () => response,
    set: () => response,
    flushHeaders: () => undefined,
    write: (message: string) => writes.push(message)
  };
  const disconnect = hub.connect("board-1", "session-1", "alex", "editor", response as never);
  disconnect();

  hub.updatePresence("board-1", "session-1", "alex", "editor", {
    cursor: { x: 120, y: 240 },
    selectedObjectIds: []
  });

  assert.equal(writes.filter((message) => message.includes('"x":120')).length, 0);
});
