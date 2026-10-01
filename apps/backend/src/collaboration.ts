import type { BoardRole, CollaboratorPresence } from "@dryerase/shared";
import type { Response } from "express";

type PresenceInput = Omit<CollaboratorPresence, "sessionId" | "userId" | "role" | "color">;

type Connection = {
  response: Response;
  heartbeat: ReturnType<typeof setInterval>;
};

export class CollaborationHub {
  private readonly connections = new Map<string, Map<string, Connection>>();
  private readonly presence = new Map<string, Map<string, CollaboratorPresence>>();

  connect(boardId: string, sessionId: string, userId: string, role: BoardRole, response: Response) {
    response.status(200);
    response.set({
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    response.flushHeaders();

    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 25_000);
    const boardConnections = this.connections.get(boardId) ?? new Map<string, Connection>();
    boardConnections.set(sessionId, { response, heartbeat });
    this.connections.set(boardId, boardConnections);
    this.setPresence(boardId, sessionId, userId, role, { cursor: null, selectedObjectIds: [] });

    return () => {
      const connection = this.connections.get(boardId)?.get(sessionId);
      if (connection) {
        clearInterval(connection.heartbeat);
      }
      this.connections.get(boardId)?.delete(sessionId);
      if (this.connections.get(boardId)?.size === 0) {
        this.connections.delete(boardId);
      }
      this.presence.get(boardId)?.delete(sessionId);
      if (this.presence.get(boardId)?.size === 0) {
        this.presence.delete(boardId);
      }
      this.broadcastPresence(boardId);
    };
  }

  updatePresence(boardId: string, sessionId: string, userId: string, role: BoardRole, input: PresenceInput) {
    if (!this.connections.get(boardId)?.has(sessionId)) {
      return;
    }
    this.setPresence(boardId, sessionId, userId, role, input);
    this.broadcastPresence(boardId);
  }

  publishRevision(boardId: string, version: number, changedBy: string) {
    this.broadcast(boardId, "board-revision", { type: "board-revision", version, changedBy });
  }

  private setPresence(boardId: string, sessionId: string, userId: string, role: BoardRole, input: PresenceInput) {
    const boardPresence = this.presence.get(boardId) ?? new Map<string, CollaboratorPresence>();
    boardPresence.set(sessionId, { sessionId, userId, role, color: colorForUser(userId), ...input });
    this.presence.set(boardId, boardPresence);
  }

  private broadcastPresence(boardId: string) {
    this.broadcast(boardId, "presence", {
      type: "presence",
      collaborators: [...(this.presence.get(boardId)?.values() ?? [])]
    });
  }

  private broadcast(boardId: string, name: string, payload: unknown) {
    const message = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const connection of this.connections.get(boardId)?.values() ?? []) {
      connection.response.write(message);
    }
  }
}

function colorForUser(userId: string) {
  const colors = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return colors[hash % colors.length]!;
}
