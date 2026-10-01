import { APP_NAME, type HealthResponse } from "@dryerase/shared";
import cors from "cors";
import express from "express";
import multer from "multer";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { BoardStore } from "./boardStore.js";
import { CollaborationHub } from "./collaboration.js";
import { env } from "./config.js";

const app = express();
const boardStore = new BoardStore(env.DRYERASE_BOARD_STORE_PATH);
const collaborationHub = new CollaborationHub();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      void mkdir(env.DRYERASE_ASSET_STORE_PATH, { recursive: true })
        .then(() => callback(null, env.DRYERASE_ASSET_STORE_PATH))
        .catch((error: unknown) => callback(error as Error, env.DRYERASE_ASSET_STORE_PATH));
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype)) {
      callback(new Error("Only PNG, JPEG, WebP, and GIF images are supported."));
      return;
    }
    callback(null, true);
  }
});
const boardPayloadSchema = z.object({
  name: z.string().min(1).max(120)
});
const shareRoleSchema = z.enum(["editor", "viewer"]);
const createShareLinkSchema = z.object({
  role: shareRoleSchema
});
const acceptShareLinkSchema = z.object({
  token: z.string().min(16).max(256)
});
const framePayloadSchema = z.object({
  name: z.string().min(1).max(120),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional()
});
const framePatchSchema = framePayloadSchema.partial().extend({
  sortOrder: z.number().finite().optional(),
  moveAttachedObjects: z.boolean().optional()
});
const objectTypeSchema = z.enum([
  "sticky",
  "prompt",
  "text",
  "rectangle",
  "ellipse",
  "diamond",
  "terminator",
  "parallelogram",
  "document",
  "database",
  "triangle",
  "pentagon",
  "hexagon",
  "octagon",
  "connector",
  "stroke",
  "image",
  "icon"
]);
const strokePointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const objectConnectionSchema = z
  .object({
    sourceObjectId: z.string().min(1),
    targetObjectId: z.string().min(1),
    sourceSide: z.enum(["top", "right", "bottom", "left"]).optional(),
    targetSide: z.enum(["top", "right", "bottom", "left"]).optional(),
    markerStart: z.enum(["none", "arrow"]).optional(),
    markerEnd: z.enum(["none", "arrow"]).optional(),
    route: z.enum(["straight", "elbow", "curved"]).optional()
  })
  .nullable();
const objectPayloadSchema = z.object({
  type: objectTypeSchema,
  groupId: z.string().min(1).max(120).nullable().optional(),
  frameId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  rotation: z.number().finite().optional(),
  content: z.string().optional(),
  connection: objectConnectionSchema.optional(),
  strokePoints: z.array(strokePointSchema).max(5000).optional(),
  style: z
    .object({
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeVisible: z.boolean().optional(),
      textColor: z.string().optional(),
      strokeWidth: z.number().finite().positive().optional()
    })
    .optional()
});

const uploadFieldsSchema = z.object({
  frameId: z.string().optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  width: z.coerce.number().finite().positive().optional(),
  height: z.coerce.number().finite().positive().optional()
});
const objectPatchSchema = objectPayloadSchema.partial().extend({
  zIndex: z.number().finite().optional(),
  style: objectPayloadSchema.shape.style.optional()
});
const presenceSchema = z.object({
  sessionId: z.string().min(8).max(120),
  cursor: z.object({ x: z.number().finite(), y: z.number().finite() }).nullable(),
  selectedObjectIds: z.array(z.string().min(1).max(120)).max(100)
});

app.use(
  cors({
    origin: env.DRYERASE_CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.use((request, _response, next) => {
  request.userId = normalizeUserId(request.header("X-DryErase-User-Id") ?? request.query.user) ?? "dev-user";
  next();
});

app.use(async (request, response, next) => {
  const boardId = boardIdFromPath(request.path);
  if (!boardId || !isVersionedBoardMutation(request)) {
    next();
    return;
  }

  const expectedVersion = Number(request.header("X-DryErase-Board-Version"));
  if (!Number.isInteger(expectedVersion)) {
    next();
    return;
  }

  try {
    const current = await boardStore.getBoard(request.userId, boardId);
    if (current && current.board.version !== expectedVersion) {
      response.status(409).json({ error: "This board changed in another session. Refresh and try again." });
      return;
    }
    response.on("finish", () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return;
      }
      void boardStore.getBoard(request.userId, boardId).then((result) => {
        if (result) {
          collaborationHub.publishRevision(boardId, result.board.version, request.userId);
        }
      });
    });
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_request, response) => {
  const payload: HealthResponse = {
    name: APP_NAME,
    status: "ok",
    timestamp: new Date().toISOString()
  };

  response.json(payload);
});

app.get("/api/config", (_request, response) => {
  response.json({
    appName: APP_NAME,
    features: {
      boards: true,
      canvas: false,
      persistence: false,
      sharing: true
    }
  });
});

app.get("/api/boards", async (request, response, next) => {
  try {
    response.json(await boardStore.listBoards(request.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards", async (request, response, next) => {
  try {
    const payload = boardPayloadSchema.parse(request.body);
    response.status(201).json(await boardStore.createBoard(request.userId, payload.name));
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards/:boardId", async (request, response, next) => {
  try {
    const result = await boardStore.getBoard(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards/:boardId/events", async (request, response, next) => {
  try {
    const sessionId = typeof request.query.session === "string" ? request.query.session : "";
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(sessionId)) {
      response.status(400).json({ error: "A valid collaboration session is required." });
      return;
    }
    const result = await boardStore.getBoard(request.userId, request.params.boardId);
    if (!result?.board.currentUserRole) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    const disconnect = collaborationHub.connect(
      request.params.boardId,
      sessionId,
      request.userId,
      result.board.currentUserRole,
      response
    );
    request.on("close", disconnect);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/presence", async (request, response, next) => {
  try {
    const payload = presenceSchema.parse(request.body);
    const result = await boardStore.getBoard(request.userId, request.params.boardId);
    if (!result?.board.currentUserRole) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    collaborationHub.updatePresence(request.params.boardId, payload.sessionId, request.userId, result.board.currentUserRole, {
      cursor: payload.cursor,
      selectedObjectIds: payload.selectedObjectIds
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/boards/:boardId", async (request, response, next) => {
  try {
    const payload = boardPayloadSchema.parse(request.body);
    const result = await boardStore.renameBoard(request.userId, request.params.boardId, payload.name);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/duplicate", async (request, response, next) => {
  try {
    const result = await boardStore.duplicateBoard(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/archive", async (request, response, next) => {
  try {
    const result = await boardStore.archiveBoard(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/restore", async (request, response, next) => {
  try {
    const result = await boardStore.restoreBoard(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/boards/:boardId", async (request, response, next) => {
  try {
    const deleted = await boardStore.deleteBoard(request.userId, request.params.boardId);
    if (!deleted) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards/:boardId/share", async (request, response, next) => {
  try {
    const result = await boardStore.getShareInfo(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/share-links", async (request, response, next) => {
  try {
    const payload = createShareLinkSchema.parse(request.body);
    const token = randomBytes(24).toString("base64url");
    const shareLink = await boardStore.createShareLink(
      request.userId,
      request.params.boardId,
      payload.role,
      hashShareToken(token)
    );
    if (!shareLink) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(201).json({ shareLink: { ...shareLink, token } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/boards/:boardId/share-links/:linkId", async (request, response, next) => {
  try {
    const revoked = await boardStore.revokeShareLink(
      request.userId,
      request.params.boardId,
      request.params.linkId
    );
    if (!revoked) {
      response.status(404).json({ error: "Share link not found." });
      return;
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/share-links/accept", async (request, response, next) => {
  try {
    const payload = acceptShareLinkSchema.parse(request.body);
    const result = await boardStore.acceptShareLink(request.userId, hashShareToken(payload.token));
    if (!result) {
      response.status(404).json({ error: "Share link not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/frames", async (request, response, next) => {
  try {
    const payload = framePayloadSchema.parse(request.body);
    const result = await boardStore.createFrame(request.userId, request.params.boardId, payload);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/boards/:boardId/frames/:frameId", async (request, response, next) => {
  try {
    const payload = framePatchSchema.parse(request.body);
    const result = await boardStore.updateFrame(
      request.userId,
      request.params.boardId,
      request.params.frameId,
      payload
    );
    if (!result) {
      response.status(404).json({ error: "Frame not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/boards/:boardId/frames/:frameId", async (request, response, next) => {
  try {
    const result = await boardStore.deleteFrame(
      request.userId,
      request.params.boardId,
      request.params.frameId
    );
    if (!result) {
      response.status(404).json({ error: "Frame not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/objects", async (request, response, next) => {
  try {
    const payload = objectPayloadSchema.parse(request.body);
    const result = await boardStore.createObject(request.userId, request.params.boardId, payload);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/boards/:boardId/objects/:objectId", async (request, response, next) => {
  try {
    const payload = objectPatchSchema.parse(request.body);
    const result = await boardStore.updateObject(
      request.userId,
      request.params.boardId,
      request.params.objectId,
      payload
    );
    if (!result) {
      response.status(404).json({ error: "Object not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/boards/:boardId/objects/:objectId", async (request, response, next) => {
  try {
    const result = await boardStore.deleteObject(
      request.userId,
      request.params.boardId,
      request.params.objectId
    );
    if (!result) {
      response.status(404).json({ error: "Object not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/boards/:boardId/assets",
  upload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: "Image file is required." });
        return;
      }
      const fields = uploadFieldsSchema.parse(request.body);
      const boardId = String(request.params.boardId);
      const url = `/api/boards/${boardId}/assets/${request.file.filename}`;
      const result = await boardStore.createImageAsset(request.userId, boardId, {
        storageKey: request.file.filename,
        originalName: request.file.originalname,
        mimeType: request.file.mimetype,
        size: request.file.size,
        url,
        thumbnailUrl: url,
        frameId: fields.frameId,
        x: fields.x,
        y: fields.y,
        width: fields.width,
        height: fields.height
      });
      if (!result) {
        response.status(404).json({ error: "Board not found." });
        return;
      }
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/boards/:boardId/assets/:storageKey", async (request, response, next) => {
  try {
    const result = await boardStore.getBoard(request.userId, request.params.boardId);
    const asset = result?.board.assets.find((item) => item.storageKey === request.params.storageKey);
    if (!asset) {
      response.status(404).json({ error: "Asset not found." });
      return;
    }
    response.type(asset.mimeType);
    response.sendFile(path.join(env.DRYERASE_ASSET_STORE_PATH, asset.storageKey));
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards/:boardId/snapshots", async (request, response, next) => {
  try {
    const result = await boardStore.listSnapshots(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/snapshots", async (request, response, next) => {
  try {
    const result = await boardStore.createManualSnapshot(request.userId, request.params.boardId);
    if (!result) {
      response.status(404).json({ error: "Board not found." });
      return;
    }
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/snapshots/:snapshotId/restore", async (request, response, next) => {
  try {
    const result = await boardStore.restoreSnapshot(
      request.userId,
      request.params.boardId,
      request.params.snapshotId
    );
    if (!result) {
      response.status(404).json({ error: "Snapshot not found." });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError || error instanceof Error) {
    response.status(400).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Unexpected server error." });
});

app.listen(env.DRYERASE_API_PORT, env.DRYERASE_API_HOST, () => {
  console.log(
    `${APP_NAME} API listening on http://${env.DRYERASE_API_HOST}:${env.DRYERASE_API_PORT}`
  );
});

function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const userId = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(userId) ? userId : null;
}

function boardIdFromPath(pathname: string): string | null {
  return /^\/api\/boards\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

function isVersionedBoardMutation(request: express.Request): boolean {
  if (!new Set(["POST", "PATCH", "DELETE"]).has(request.method)) {
    return false;
  }
  return /^\/api\/boards\/[^/]+\/(?:frames(?:\/[^/]+)?|objects(?:\/[^/]+)?|assets|archive|restore|snapshots\/[^/]+\/restore)$/.test(
    request.path
  ) || (request.method === "PATCH" && /^\/api\/boards\/[^/]+$/.test(request.path));
}
