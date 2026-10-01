import type {
  BoardDetail,
  BoardListResponse,
  BoardResponse,
  BoardShareResponse,
  CreatedBoardShareLink,
  CreateFrameRequest,
  CreateObjectRequest,
  AssetResponse,
  BoardCollaborationEvent,
  FrameResponse,
  ObjectResponse,
  SnapshotListResponse,
  SnapshotResponse,
  UpdateFrameRequest,
  UpdateObjectRequest
} from "@dryerase/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5050";
const USER_STORAGE_KEY = "dryerase-user-id";
const SESSION_STORAGE_KEY = "dryerase-collaboration-session";
const boardVersions = new Map<string, number>();

export function getCurrentUserId(): string {
  return window.localStorage.getItem(USER_STORAGE_KEY) ?? "dev-user";
}

export function setCurrentUserId(userId: string) {
  window.localStorage.setItem(USER_STORAGE_KEY, userId.trim().toLowerCase());
}

export function getCollaborationSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export function resolveApiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const boardId = boardIdForPath(path);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-DryErase-User-Id", getCurrentUserId());
  if (boardId && isBoardMutation(init?.method) && boardVersions.has(boardId)) {
    headers.set("X-DryErase-Board-Version", String(boardVersions.get(boardId)));
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as T;
  rememberBoardVersion(payload);
  return payload;
}

export function subscribeToBoardEvents(
  boardId: string,
  onEvent: (event: BoardCollaborationEvent) => void
): () => void {
  const query = new URLSearchParams({ user: getCurrentUserId(), session: getCollaborationSessionId() });
  const events = new EventSource(`${API_URL}/api/boards/${boardId}/events?${query.toString()}`);
  const receive = (event: MessageEvent<string>) => onEvent(JSON.parse(event.data) as BoardCollaborationEvent);
  events.addEventListener("presence", receive as EventListener);
  events.addEventListener("board-revision", receive as EventListener);
  return () => events.close();
}

export async function updateBoardPresence(
  boardId: string,
  payload: { cursor: { x: number; y: number } | null; selectedObjectIds: string[] }
): Promise<void> {
  await request<void>(`/api/boards/${boardId}/presence`, {
    method: "POST",
    body: JSON.stringify({ sessionId: getCollaborationSessionId(), ...payload })
  });
}
export async function listBoards(): Promise<BoardListResponse> {
  return request<BoardListResponse>("/api/boards");
}

export async function createBoard(name: string): Promise<BoardResponse> {
  return request<BoardResponse>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function getBoard(boardId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}`);
}

export async function renameBoard(boardId: string, name: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export async function duplicateBoard(boardId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}/duplicate`, {
    method: "POST"
  });
}

export async function archiveBoard(boardId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}/archive`, {
    method: "POST"
  });
}

export async function restoreBoard(boardId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}/restore`, {
    method: "POST"
  });
}

export async function deleteBoard(boardId: string): Promise<void> {
  await request<void>(`/api/boards/${boardId}`, {
    method: "DELETE"
  });
}

export async function getBoardShareInfo(boardId: string): Promise<BoardShareResponse> {
  return request<BoardShareResponse>(`/api/boards/${boardId}/share`);
}

export async function createBoardShareLink(
  boardId: string,
  role: "editor" | "viewer"
): Promise<{ shareLink: CreatedBoardShareLink }> {
  return request<{ shareLink: CreatedBoardShareLink }>(`/api/boards/${boardId}/share-links`, {
    method: "POST",
    body: JSON.stringify({ role })
  });
}

export async function revokeBoardShareLink(boardId: string, linkId: string): Promise<void> {
  await request<void>(`/api/boards/${boardId}/share-links/${linkId}`, {
    method: "DELETE"
  });
}

export async function acceptBoardShareLink(token: string): Promise<BoardResponse> {
  return request<BoardResponse>("/api/share-links/accept", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export async function createFrame(
  boardId: string,
  payload: CreateFrameRequest
): Promise<FrameResponse> {
  return request<FrameResponse>(`/api/boards/${boardId}/frames`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateFrame(
  boardId: string,
  frameId: string,
  payload: UpdateFrameRequest
): Promise<FrameResponse> {
  return request<FrameResponse>(`/api/boards/${boardId}/frames/${frameId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteFrame(boardId: string, frameId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}/frames/${frameId}`, {
    method: "DELETE"
  });
}

export async function createObject(
  boardId: string,
  payload: CreateObjectRequest
): Promise<ObjectResponse> {
  return request<ObjectResponse>(`/api/boards/${boardId}/objects`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadAsset(
  boardId: string,
  payload: {
    file: File;
    frameId?: string | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }
): Promise<AssetResponse> {
  const body = new FormData();
  body.set("file", payload.file);
  if (payload.frameId) body.set("frameId", payload.frameId);
  if (payload.x !== undefined) body.set("x", String(payload.x));
  if (payload.y !== undefined) body.set("y", String(payload.y));
  if (payload.width !== undefined) body.set("width", String(payload.width));
  if (payload.height !== undefined) body.set("height", String(payload.height));

  const response = await fetch(`${API_URL}/api/boards/${boardId}/assets`, {
    method: "POST",
    headers: {
      "X-DryErase-User-Id": getCurrentUserId(),
      ...(boardVersions.has(boardId) ? { "X-DryErase-Board-Version": String(boardVersions.get(boardId)) } : {})
    },
    body
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Upload failed with ${response.status}`);
  }

  const result = (await response.json()) as AssetResponse;
  rememberBoardVersion(result);
  return result;
}

function boardIdForPath(path: string): string | null {
  return /^\/api\/boards\/([^/]+)/.exec(path)?.[1] ?? null;
}

function isBoardMutation(method: string | undefined): boolean {
  return ["POST", "PATCH", "DELETE"].includes(method ?? "GET");
}

function rememberBoardVersion(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("board" in payload)) {
    return;
  }
  const board = (payload as { board?: unknown }).board;
  if (
    board &&
    typeof board === "object" &&
    "id" in board &&
    "version" in board &&
    typeof board.id === "string" &&
    typeof board.version === "number"
  ) {
    boardVersions.set(board.id, board.version);
  }
}

export async function updateObject(
  boardId: string,
  objectId: string,
  payload: UpdateObjectRequest
): Promise<ObjectResponse> {
  return request<ObjectResponse>(`/api/boards/${boardId}/objects/${objectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteObject(boardId: string, objectId: string): Promise<BoardResponse> {
  return request<BoardResponse>(`/api/boards/${boardId}/objects/${objectId}`, {
    method: "DELETE"
  });
}

export async function listSnapshots(boardId: string): Promise<SnapshotListResponse> {
  return request<SnapshotListResponse>(`/api/boards/${boardId}/snapshots`);
}

export async function createSnapshot(boardId: string): Promise<SnapshotResponse> {
  return request<SnapshotResponse>(`/api/boards/${boardId}/snapshots`, {
    method: "POST"
  });
}

export async function restoreSnapshot(
  boardId: string,
  snapshotId: string
): Promise<SnapshotResponse> {
  return request<SnapshotResponse>(`/api/boards/${boardId}/snapshots/${snapshotId}/restore`, {
    method: "POST"
  });
}

export type { BoardDetail };
