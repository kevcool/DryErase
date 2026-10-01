import type {
  BoardDetail,
  BoardAsset,
  BoardFrame,
  BoardRole,
  BoardShareLink,
  BoardShareResponse,
  BoardSnapshot,
  BoardListResponse,
  BoardResponse,
  BoardStatus,
  CanvasObject,
  CanvasObjectType,
  CreateFrameRequest,
  CreateObjectRequest,
  AssetResponse,
  FrameResponse,
  ObjectResponse,
  SnapshotListResponse,
  SnapshotResponse,
  UpdateFrameRequest,
  UpdateObjectRequest
} from "@dryerase/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

type StoredShareLink = BoardShareLink & {
  tokenHash: string;
};

type StoredBoard = Omit<BoardDetail, "shareLinks" | "snapshots" | "currentUserRole"> & {
  shareLinks: StoredShareLink[];
  snapshots: BoardSnapshot[];
};

type StoredData = {
  nextBoardNumber: number;
  boards: StoredBoard[];
};

const defaultData: StoredData = {
  nextBoardNumber: 1,
  boards: []
};

export class BoardStore {
  constructor(private readonly filePath: string) {}

  async listBoards(userId: string): Promise<BoardListResponse> {
    const data = await this.read();
    const boards = data.boards
      .map((board) => ({ board, role: boardRoleForUser(board, userId) }))
      .filter((entry): entry is { board: StoredBoard; role: BoardRole } => entry.role !== null)
      .sort((a, b) => b.board.updatedAt.localeCompare(a.board.updatedAt))
      .map(({ board, role }) => ({
        id: board.id,
        ownerId: board.ownerId,
        role,
        name: board.name,
        status: board.status,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        archivedAt: board.archivedAt
      }));

    return { boards };
  }

  async createBoard(ownerId: string, name: string): Promise<BoardResponse> {
    const data = await this.read();
    const now = new Date().toISOString();
    const board: StoredBoard = {
      id: `board-${data.nextBoardNumber}`,
      ownerId,
      name: normalizeName(name),
      status: "active",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 1,
      nextFrameNumber: 2,
      nextObjectNumber: 1,
      nextSnapshotNumber: 1,
      nextAssetNumber: 1,
      frames: [createInitialFrame(`board-${data.nextBoardNumber}`, now)],
      objects: [],
      assets: [],
      snapshots: [],
      members: [],
      shareLinks: []
    };

    appendSnapshot(board, now, "Initial board");
    data.nextBoardNumber += 1;
    data.boards.push(board);
    await this.write(data);

    return { board: publicBoard(board, ownerId) };
  }

  async getBoard(userId: string, boardId: string): Promise<BoardResponse | null> {
    const board = await this.findBoardWithRole(userId, boardId, "viewer");
    return board ? { board: publicBoard(board, userId) } : null;
  }

  async renameBoard(
    ownerId: string,
    boardId: string,
    name: string
  ): Promise<BoardResponse | null> {
    return this.updateBoard(ownerId, boardId, "owner", (board) => {
      board.name = normalizeName(name);
    });
  }

  async duplicateBoard(ownerId: string, boardId: string): Promise<BoardResponse | null> {
    const data = await this.read();
    const source = findBoardWithMinimumRole(data, ownerId, boardId, "viewer");
    if (!source) {
      return null;
    }

    const now = new Date().toISOString();
    const duplicateBoardId = `board-${data.nextBoardNumber}`;
    const assetIdMap = new Map(source.assets.map((asset) => [asset.id, `${asset.id}-copy-${data.nextBoardNumber}`]));
    const duplicate: StoredBoard = {
      ...source,
      id: duplicateBoardId,
      name: `${source.name} Copy`,
      status: "active",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 1,
      nextObjectNumber: source.nextObjectNumber,
      nextSnapshotNumber: 1,
      nextAssetNumber: source.nextAssetNumber,
      frames: source.frames.map((frame) => ({
        ...frame,
        id: `${frame.id}-copy-${data.nextBoardNumber}`,
        boardId: duplicateBoardId,
        createdAt: now,
        updatedAt: now
      })),
      objects: source.objects.map((object) => ({
        ...object,
        id: `${object.id}-copy-${data.nextBoardNumber}`,
        boardId: duplicateBoardId,
        assetId: object.assetId ? assetIdMap.get(object.assetId) ?? object.assetId : null,
        createdAt: now,
        updatedAt: now
      })),
      assets: source.assets.map((asset) => ({
        ...asset,
        id: assetIdMap.get(asset.id) ?? `${asset.id}-copy-${data.nextBoardNumber}`,
        boardId: duplicateBoardId,
        url: `/api/boards/${duplicateBoardId}/assets/${asset.storageKey}`,
        thumbnailUrl: `/api/boards/${duplicateBoardId}/assets/${asset.storageKey}`,
        createdAt: now
      })),
      snapshots: [],
      members: [],
      shareLinks: []
    };

    appendSnapshot(duplicate, now, "Duplicated board");
    data.nextBoardNumber += 1;
    data.boards.push(duplicate);
    await this.write(data);

    return { board: publicBoard(duplicate, ownerId) };
  }

  async archiveBoard(ownerId: string, boardId: string): Promise<BoardResponse | null> {
    return this.setStatus(ownerId, boardId, "archived");
  }

  async restoreBoard(ownerId: string, boardId: string): Promise<BoardResponse | null> {
    return this.setStatus(ownerId, boardId, "active");
  }

  async deleteBoard(ownerId: string, boardId: string): Promise<boolean> {
    const data = await this.read();
    const initialLength = data.boards.length;
    data.boards = data.boards.filter((board) => !(board.id === boardId && board.ownerId === ownerId));

    if (data.boards.length === initialLength) {
      return false;
    }

    await this.write(data);
    return true;
  }

  async createFrame(
    ownerId: string,
    boardId: string,
    payload: CreateFrameRequest
  ): Promise<FrameResponse | null> {
    let createdFrame: BoardFrame | null = null;
    const result = await this.updateBoard(ownerId, boardId, "editor", (board, now) => {
      const frameNumber = board.nextFrameNumber;
      createdFrame = {
        id: `frame-${frameNumber}`,
        boardId,
        name: normalizeFrameName(payload.name),
        x: normalizeNumber(payload.x, 120),
        y: normalizeNumber(payload.y, 120),
        width: normalizeSize(payload.width, 1180),
        height: normalizeSize(payload.height, 820),
        sortOrder: board.frames.length + 1,
        createdAt: now,
        updatedAt: now
      };
      board.nextFrameNumber += 1;
      board.frames.push(createdFrame);
    });

    return result && createdFrame ? { board: result.board, frame: createdFrame } : null;
  }

  async updateFrame(
    ownerId: string,
    boardId: string,
    frameId: string,
    payload: UpdateFrameRequest
  ): Promise<FrameResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "editor");
    const frame = board?.frames.find((item) => item.id === frameId);
    if (!board || !frame) {
      return null;
    }

    const now = new Date().toISOString();
    const previousX = frame.x;
    const previousY = frame.y;
    if (payload.name !== undefined) {
      frame.name = normalizeFrameName(payload.name);
    }
    if (payload.x !== undefined) {
      frame.x = normalizeNumber(payload.x, frame.x);
    }
    if (payload.y !== undefined) {
      frame.y = normalizeNumber(payload.y, frame.y);
    }
    if (payload.width !== undefined) {
      frame.width = normalizeSize(payload.width, frame.width);
    }
    if (payload.height !== undefined) {
      frame.height = normalizeSize(payload.height, frame.height);
    }
    if (payload.sortOrder !== undefined) {
      frame.sortOrder = normalizeNumber(payload.sortOrder, frame.sortOrder);
    }

    const deltaX = frame.x - previousX;
    const deltaY = frame.y - previousY;
    if ((deltaX !== 0 || deltaY !== 0) && payload.moveAttachedObjects !== false) {
      board.objects.forEach((object) => {
        if (object.frameId === frame.id) {
          object.x += deltaX;
          object.y += deltaY;
          if (object.type === "stroke") {
            object.strokePoints = object.strokePoints.map((point) => ({
              x: point.x + deltaX,
              y: point.y + deltaY
            }));
          }
          object.updatedAt = now;
        }
      });
    }

    frame.updatedAt = now;
    board.updatedAt = now;
    board.version += 1;
    appendSnapshot(board, now, "Frame updated");
    await this.write(data);

    return { board: publicBoard(board, ownerId), frame };
  }

  async deleteFrame(
    ownerId: string,
    boardId: string,
    frameId: string
  ): Promise<BoardResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "editor");
    if (!board || !board.frames.some((frame) => frame.id === frameId)) {
      return null;
    }

    const now = new Date().toISOString();
    board.frames = board.frames.filter((frame) => frame.id !== frameId);
    board.updatedAt = now;
    board.version += 1;
    appendSnapshot(board, now, "Frame deleted");
    await this.write(data);

    return { board: publicBoard(board, ownerId) };
  }

  async createObject(
    ownerId: string,
    boardId: string,
    payload: CreateObjectRequest
  ): Promise<ObjectResponse | null> {
    let createdObject: CanvasObject | null = null;
    const result = await this.updateBoard(ownerId, boardId, "editor", (board, now) => {
      const objectNumber = board.nextObjectNumber;
      const defaults = objectDefaults(payload.type);
      createdObject = {
        id: `object-${objectNumber}`,
        boardId,
        groupId: payload.groupId ?? null,
        frameId: payload.frameId === undefined ? board.frames[0]?.id ?? null : payload.frameId,
        type: payload.type,
        x: normalizeNumber(payload.x, 120),
        y: normalizeNumber(payload.y, 120),
        width: normalizeObjectSize(payload.type, "width", payload.width, defaults.width),
        height: normalizeObjectSize(payload.type, "height", payload.height, defaults.height),
        rotation: normalizeNumber(payload.rotation, 0),
        zIndex: board.objects.length + 1,
        content: payload.content ?? defaults.content,
        assetId: payload.assetId ?? null,
        strokePoints: payload.strokePoints ?? [],
        connection: payload.connection ?? null,
        style: { ...defaults.style, ...payload.style },
        createdAt: now,
        updatedAt: now
      };
      board.nextObjectNumber += 1;
      board.objects.push(createdObject);
    });

    return result && createdObject ? { board: result.board, object: createdObject } : null;
  }

  async updateObject(
    ownerId: string,
    boardId: string,
    objectId: string,
    payload: UpdateObjectRequest
  ): Promise<ObjectResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "editor");
    const object = board?.objects.find((item) => item.id === objectId);
    if (!board || !object) {
      return null;
    }

    const now = new Date().toISOString();
    if (payload.type !== undefined) object.type = payload.type;
    if (payload.groupId !== undefined) object.groupId = payload.groupId;
    if (payload.frameId !== undefined) object.frameId = payload.frameId;
    if (payload.assetId !== undefined) object.assetId = payload.assetId;
    if (payload.x !== undefined) object.x = normalizeNumber(payload.x, object.x);
    if (payload.y !== undefined) object.y = normalizeNumber(payload.y, object.y);
    if (payload.width !== undefined) object.width = normalizeObjectSize(object.type, "width", payload.width, object.width);
    if (payload.height !== undefined) object.height = normalizeObjectSize(object.type, "height", payload.height, object.height);
    if (payload.rotation !== undefined) object.rotation = normalizeNumber(payload.rotation, object.rotation);
    if (payload.zIndex !== undefined) object.zIndex = normalizeNumber(payload.zIndex, object.zIndex);
    if (payload.content !== undefined) object.content = String(payload.content);
    if (payload.strokePoints !== undefined) object.strokePoints = payload.strokePoints;
    if (payload.connection !== undefined) object.connection = payload.connection;
    if (payload.style !== undefined) object.style = { ...object.style, ...payload.style };
    object.updatedAt = now;
    board.updatedAt = now;
    board.version += 1;
    appendSnapshot(board, now, "Object updated");
    await this.write(data);

    return { board: publicBoard(board, ownerId), object };
  }

  async deleteObject(
    ownerId: string,
    boardId: string,
    objectId: string
  ): Promise<BoardResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "editor");
    if (!board || !board.objects.some((object) => object.id === objectId)) {
      return null;
    }

    const now = new Date().toISOString();
    board.objects = board.objects.filter(
      (object) =>
        object.id !== objectId &&
        object.connection?.sourceObjectId !== objectId &&
        object.connection?.targetObjectId !== objectId
    );
    board.updatedAt = now;
    board.version += 1;
    appendSnapshot(board, now, "Object deleted");
    await this.write(data);

    return { board: publicBoard(board, ownerId) };
  }

  async createImageAsset(
    ownerId: string,
    boardId: string,
    payload: {
      storageKey: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
      thumbnailUrl: string;
      frameId?: string | null;
      x?: number;
      y?: number;
      width?: number | null;
      height?: number | null;
    }
  ): Promise<AssetResponse | null> {
    let createdAsset: BoardAsset | null = null;
    let createdObject: CanvasObject | null = null;
    const result = await this.updateBoard(ownerId, boardId, "editor", (board, now) => {
      const assetNumber = board.nextAssetNumber;
      createdAsset = {
        id: `asset-${assetNumber}`,
        boardId,
        storageKey: payload.storageKey,
        originalName: payload.originalName,
        mimeType: payload.mimeType,
        size: payload.size,
        width: payload.width ?? null,
        height: payload.height ?? null,
        sourceType: "upload",
        url: payload.url,
        thumbnailUrl: payload.thumbnailUrl,
        createdAt: now
      };
      board.nextAssetNumber += 1;
      board.assets.push(createdAsset);

      const objectNumber = board.nextObjectNumber;
      const frame = board.frames.find((item) => item.id === payload.frameId) ?? board.frames[0];
      createdObject = {
        id: `object-${objectNumber}`,
        boardId,
        groupId: null,
        frameId: frame?.id ?? null,
        type: "image",
        x: normalizeNumber(payload.x, (frame?.x ?? 0) + 180),
        y: normalizeNumber(payload.y, (frame?.y ?? 0) + 180),
        width: normalizeSize(payload.width, 360),
        height: normalizeSize(payload.height, 240),
        rotation: 0,
        zIndex: board.objects.length + 1,
        content: payload.originalName,
        assetId: createdAsset.id,
        strokePoints: [],
        connection: null,
        style: { fill: "#ffffff", stroke: "#cbd5e1", textColor: "#1c2430" },
        createdAt: now,
        updatedAt: now
      };
      board.nextObjectNumber += 1;
      board.objects.push(createdObject);
    });

    return result && createdAsset && createdObject
      ? { board: result.board, asset: createdAsset, object: createdObject }
      : null;
  }

  async getShareInfo(userId: string, boardId: string): Promise<BoardShareResponse | null> {
    const board = await this.findBoardWithRole(userId, boardId, "owner");
    if (!board) {
      return null;
    }

    return shareInfoForBoard(board, userId);
  }

  async createShareLink(
    userId: string,
    boardId: string,
    role: Exclude<BoardRole, "owner">,
    tokenHash: string
  ): Promise<BoardShareLink | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, userId, boardId, "owner");
    if (!board) {
      return null;
    }

    const link: StoredShareLink = {
      id: `share-${randomUUID()}`,
      role,
      tokenHash,
      createdAt: new Date().toISOString(),
      createdBy: userId
    };
    board.shareLinks.push(link);
    await this.write(data);
    return publicShareLink(link);
  }

  async revokeShareLink(userId: string, boardId: string, linkId: string): Promise<boolean> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, userId, boardId, "owner");
    if (!board) {
      return false;
    }

    const initialLength = board.shareLinks.length;
    board.shareLinks = board.shareLinks.filter((link) => link.id !== linkId);
    if (board.shareLinks.length === initialLength) {
      return false;
    }

    await this.write(data);
    return true;
  }

  async acceptShareLink(userId: string, tokenHash: string): Promise<BoardResponse | null> {
    const data = await this.read();
    const board = data.boards.find((item) => item.shareLinks.some((link) => link.tokenHash === tokenHash));
    const link = board?.shareLinks.find((item) => item.tokenHash === tokenHash);
    if (!board || !link) {
      return null;
    }

    if (board.ownerId !== userId) {
      const now = new Date().toISOString();
      const member = board.members.find((item) => item.userId === userId);
      if (member) {
        member.role = link.role;
      } else {
        board.members.push({ userId, role: link.role, addedAt: now });
      }
      board.updatedAt = now;
      await this.write(data);
    }

    return { board: publicBoard(board, userId) };
  }

  async listSnapshots(ownerId: string, boardId: string): Promise<SnapshotListResponse | null> {
    const board = await this.findBoardWithRole(ownerId, boardId, "viewer");
    if (!board) {
      return null;
    }

    return {
      snapshots: board.snapshots
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(stripSnapshotPayload)
    };
  }

  async createManualSnapshot(ownerId: string, boardId: string): Promise<SnapshotResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "editor");
    if (!board) {
      return null;
    }

    const now = new Date().toISOString();
    const snapshot = appendSnapshot(board, now, "Manual snapshot", "manual");
    board.updatedAt = now;
    await this.write(data);

    return { snapshot: stripSnapshotPayload(snapshot), board: publicBoard(board, ownerId) };
  }

  async restoreSnapshot(
    ownerId: string,
    boardId: string,
    snapshotId: string
  ): Promise<SnapshotResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, ownerId, boardId, "owner");
    const snapshot = board?.snapshots.find((item) => item.id === snapshotId);
    if (!board || !snapshot) {
      return null;
    }

    const now = new Date().toISOString();
    const existingSnapshots = board.snapshots;
    const nextSnapshotNumber = board.nextSnapshotNumber;
    const restoredBoard: StoredBoard = {
      ...structuredClone(snapshot.board),
      members: board.members,
      shareLinks: board.shareLinks,
      updatedAt: now,
      version: board.version + 1,
      nextSnapshotNumber,
      snapshots: existingSnapshots
    };
    appendSnapshot(restoredBoard, now, `Restored ${snapshot.label}`);

    const index = data.boards.findIndex((item) => item.id === boardId);
    data.boards[index] = restoredBoard;
    await this.write(data);

    return { snapshot: stripSnapshotPayload(snapshot), board: publicBoard(restoredBoard, ownerId) };
  }

  private async setStatus(
    ownerId: string,
    boardId: string,
    status: BoardStatus
  ): Promise<BoardResponse | null> {
    return this.updateBoard(ownerId, boardId, "owner", (board, now) => {
      board.status = status;
      board.archivedAt = status === "archived" ? now : null;
    });
  }

  private async findBoardWithRole(userId: string, boardId: string, minimumRole: BoardRole): Promise<StoredBoard | null> {
    const data = await this.read();
    return findBoardWithMinimumRole(data, userId, boardId, minimumRole);
  }

  private async updateBoard(
    userId: string,
    boardId: string,
    minimumRole: BoardRole,
    mutate: (board: StoredBoard, now: string) => void
  ): Promise<BoardResponse | null> {
    const data = await this.read();
    const board = findBoardWithMinimumRole(data, userId, boardId, minimumRole);
    if (!board) {
      return null;
    }

    const now = new Date().toISOString();
    mutate(board, now);
    board.updatedAt = now;
    board.version += 1;
    appendSnapshot(board, now);
    await this.write(data);

    return { board: publicBoard(board, userId) };
  }

  private async read(): Promise<StoredData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as StoredData;
      return {
        nextBoardNumber: Number.isInteger(data.nextBoardNumber) ? data.nextBoardNumber : 1,
        boards: Array.isArray(data.boards) ? data.boards.map(hydrateBoard) : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(defaultData);
      }
      throw error;
    }
  }

  private async write(data: StoredData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Board name is required.");
  }
  if (trimmed.length > 120) {
    throw new Error("Board name must be 120 characters or fewer.");
  }
  return trimmed;
}

function hydrateBoard(board: BoardDetail | StoredBoard): StoredBoard {
  const now = new Date().toISOString();
  const frames = Array.isArray(board.frames) ? board.frames : [createInitialFrame(board.id, now)];
  return {
    ...board,
    nextFrameNumber: Number.isInteger(board.nextFrameNumber) ? board.nextFrameNumber : frames.length + 1,
    nextObjectNumber: Number.isInteger(board.nextObjectNumber) ? board.nextObjectNumber : 1,
    nextSnapshotNumber: Number.isInteger(board.nextSnapshotNumber) ? board.nextSnapshotNumber : 1,
    nextAssetNumber: Number.isInteger(board.nextAssetNumber) ? board.nextAssetNumber : 1,
    frames,
    objects: Array.isArray(board.objects)
      ? board.objects.map((object) => ({
          ...object,
          connection: object.connection ?? null,
          strokePoints: Array.isArray(object.strokePoints) ? object.strokePoints : []
        }))
      : [],
    assets: Array.isArray(board.assets) ? board.assets : [],
    snapshots: Array.isArray(board.snapshots) ? board.snapshots : [],
    members: Array.isArray(board.members) ? board.members : [],
    shareLinks: Array.isArray(board.shareLinks)
      ? board.shareLinks.map((link) => ({
          ...link,
          tokenHash: "tokenHash" in link && typeof link.tokenHash === "string" ? link.tokenHash : ""
        }))
      : []
  };
}

function boardRoleForUser(board: StoredBoard, userId: string): BoardRole | null {
  if (board.ownerId === userId) {
    return "owner";
  }
  return board.members.find((member) => member.userId === userId)?.role ?? null;
}

function findBoardWithMinimumRole(
  data: StoredData,
  userId: string,
  boardId: string,
  minimumRole: BoardRole
): StoredBoard | null {
  return (
    data.boards.find((board) => {
      const role = boardRoleForUser(board, userId);
      return board.id === boardId && role !== null && roleRank(role) >= roleRank(minimumRole);
    }) ?? null
  );
}

function roleRank(role: BoardRole): number {
  switch (role) {
    case "viewer":
      return 1;
    case "editor":
      return 2;
    case "owner":
      return 3;
  }
}

function publicShareLink(link: BoardShareLink | StoredShareLink): BoardShareLink {
  const { tokenHash: _tokenHash, ...publicLink } = link as StoredShareLink;
  return publicLink;
}

function shareInfoForBoard(board: StoredBoard, userId: string): BoardShareResponse {
  return {
    role: boardRoleForUser(board, userId)!,
    members: structuredClone(board.members),
    shareLinks: board.shareLinks.map(publicShareLink)
  };
}

function publicBoard(board: StoredBoard, userId: string): BoardDetail {
  const role = boardRoleForUser(board, userId);
  const { shareLinks, ...detail } = structuredClone(board);
  return {
    ...detail,
    role: role ?? undefined,
    currentUserRole: role ?? undefined,
    shareLinks: shareLinks.map(publicShareLink),
    snapshots: detail.snapshots.map((snapshot) => ({
      ...snapshot,
      board: {
        ...snapshot.board,
        shareLinks: (snapshot.board.shareLinks ?? []).map(publicShareLink)
      }
    }))
  };
}

function createInitialFrame(boardId: string, now: string): BoardFrame {
  return {
    id: "frame-1",
    boardId,
    name: "Frame 1",
    x: 0,
    y: 0,
    width: 1180,
    height: 820,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeFrameName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Frame name is required.");
  }
  if (trimmed.length > 120) {
    throw new Error("Frame name must be 120 characters or fewer.");
  }
  return trimmed;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSize(value: unknown, fallback: number): number {
  return Math.max(160, normalizeNumber(value, fallback));
}

function normalizeObjectSize(
  type: CanvasObjectType,
  dimension: "width" | "height",
  value: unknown,
  fallback: number
): number {
  const minimum =
    type === "connector"
      ? dimension === "height"
        ? 4
        : 24
      : type === "stroke"
        ? 1
      : type === "image" || type === "icon" || isFlowchartObject(type)
        ? 80
        : 160;
  return Math.max(minimum, normalizeNumber(value, fallback));
}

function isFlowchartObject(type: CanvasObjectType): boolean {
  return ["terminator", "parallelogram", "document", "database"].includes(type);
}

function objectDefaults(type: CanvasObjectType): Pick<CanvasObject, "width" | "height" | "content" | "style"> {
  switch (type) {
    case "sticky":
      return {
        width: 190,
        height: 170,
        content: "New sticky note",
        style: { fill: "#f9e85f", stroke: "#e7cf43", strokeVisible: false, textColor: "#1c2430" }
      };
    case "prompt":
      return {
        width: 320,
        height: 200,
        content: "What should we explore?",
        style: { fill: "#dbeafe", stroke: "#60a5fa", strokeVisible: false, textColor: "#1e3a8a" }
      };
    case "text":
      return {
        width: 260,
        height: 90,
        content: "Text",
        style: { fill: "transparent", stroke: "transparent", textColor: "#1c2430" }
      };
    case "connector":
      return {
        width: 260,
        height: 20,
        content: "",
        style: { fill: "transparent", stroke: "#2563eb", textColor: "#1c2430", strokeWidth: 5 }
      };
    case "stroke":
      return {
        width: 1,
        height: 1,
        content: "",
        style: { fill: "transparent", stroke: "#1c2430", textColor: "#1c2430", strokeWidth: 4 }
      };
    case "image":
      return {
        width: 360,
        height: 240,
        content: "",
        style: { fill: "#ffffff", stroke: "#cbd5e1", textColor: "#1c2430" }
      };
    case "icon":
      return {
        width: 88,
        height: 88,
        content: "check",
        style: { fill: "transparent", stroke: "transparent", textColor: "#1c2430" }
      };
    case "ellipse":
      return {
        width: 200,
        height: 140,
        content: "",
        style: { fill: "#e0f2fe", stroke: "#0284c7", textColor: "#1c2430" }
      };
    case "diamond":
      return {
        width: 180,
        height: 180,
        content: "",
        style: { fill: "#fce7f3", stroke: "#db2777", textColor: "#1c2430" }
      };
    case "rectangle":
      return {
        width: 220,
        height: 140,
        content: "",
        style: { fill: "#eef2ff", stroke: "#4f46e5", textColor: "#1c2430" }
      };
    case "terminator":
      return {
        width: 220,
        height: 110,
        content: "",
        style: { fill: "#dcfce7", stroke: "#16a34a", textColor: "#1c2430" }
      };
    case "parallelogram":
      return {
        width: 230,
        height: 130,
        content: "",
        style: { fill: "#fef3c7", stroke: "#d97706", textColor: "#1c2430" }
      };
    case "document":
      return {
        width: 220,
        height: 145,
        content: "",
        style: { fill: "#ffffff", stroke: "#64748b", textColor: "#1c2430" }
      };
    case "database":
      return {
        width: 190,
        height: 145,
        content: "",
        style: { fill: "#e0f2fe", stroke: "#0284c7", textColor: "#1c2430" }
      };
    case "triangle":
      return {
        width: 190,
        height: 170,
        content: "",
        style: { fill: "#fef3c7", stroke: "#d97706", textColor: "#1c2430" }
      };
    case "pentagon":
      return {
        width: 190,
        height: 180,
        content: "",
        style: { fill: "#dcfce7", stroke: "#16a34a", textColor: "#1c2430" }
      };
    case "hexagon":
      return {
        width: 210,
        height: 170,
        content: "",
        style: { fill: "#e0e7ff", stroke: "#4f46e5", textColor: "#1c2430" }
      };
    case "octagon":
      return {
        width: 185,
        height: 185,
        content: "",
        style: { fill: "#fee2e2", stroke: "#dc2626", textColor: "#1c2430" }
      };
  }
}

function appendSnapshot(
  board: BoardDetail,
  now: string,
  label = "Autosave",
  type: BoardSnapshot["type"] = "autosave"
): BoardSnapshot {
  const snapshot: BoardSnapshot = {
    id: `snapshot-${board.nextSnapshotNumber}`,
    boardId: board.id,
    type,
    label,
    createdAt: now,
    board: snapshotPayload(board)
  };

  board.nextSnapshotNumber += 1;
  board.snapshots = [...board.snapshots, snapshot]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12);
  return snapshot;
}

function snapshotPayload(board: BoardDetail): BoardSnapshot["board"] {
  const { snapshots: _snapshots, nextSnapshotNumber: _nextSnapshotNumber, ...payload } = structuredClone(board);
  return payload;
}

function stripSnapshotPayload(snapshot: BoardSnapshot): Omit<BoardSnapshot, "board"> {
  const { board: _board, ...metadata } = snapshot;
  return metadata;
}
