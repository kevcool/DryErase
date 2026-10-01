export const APP_NAME = "DryErase";

export const WORKFLOW_LISTS = {
  todo: 64,
  doing: 65,
  done: 66
} as const;

export type BoardRole = "owner" | "editor" | "viewer";

export type CollaboratorPresence = {
  sessionId: string;
  userId: string;
  role: BoardRole;
  cursor: { x: number; y: number } | null;
  selectedObjectIds: string[];
  color: string;
};

export type BoardCollaborationEvent =
  | { type: "presence"; collaborators: CollaboratorPresence[] }
  | { type: "board-revision"; version: number; changedBy: string };

export type BoardStatus = "active" | "archived";

export type BoardSummary = {
  id: string;
  ownerId: string;
  role?: BoardRole;
  name: string;
  status: BoardStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type BoardFrame = {
  id: string;
  boardId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CanvasObjectType =
  | "sticky"
  | "prompt"
  | "text"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "terminator"
  | "parallelogram"
  | "document"
  | "database"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "connector"
  | "stroke"
  | "image"
  | "icon";

export type CanvasLinkSide = "top" | "right" | "bottom" | "left";
export type CanvasConnectorMarker = "none" | "arrow";
export type CanvasConnectorRoute = "straight" | "elbow" | "curved";
export type CanvasStrokePoint = { x: number; y: number };

export type BoardAsset = {
  id: string;
  boardId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  sourceType: "upload";
  url: string;
  thumbnailUrl: string;
  createdAt: string;
};

export type BoardMember = {
  userId: string;
  role: Exclude<BoardRole, "owner">;
  addedAt: string;
};

export type BoardShareLink = {
  id: string;
  role: Exclude<BoardRole, "owner">;
  createdAt: string;
  createdBy: string;
};

export type BoardShareResponse = {
  role: BoardRole;
  members: BoardMember[];
  shareLinks: BoardShareLink[];
};

export type CreatedBoardShareLink = BoardShareLink & {
  token: string;
};

export type CanvasObject = {
  id: string;
  boardId: string;
  frameId: string | null;
  type: CanvasObjectType;
  groupId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: string;
  assetId: string | null;
  strokePoints: CanvasStrokePoint[];
  connection: {
    sourceObjectId: string;
    targetObjectId: string;
    sourceSide?: CanvasLinkSide;
    targetSide?: CanvasLinkSide;
    markerStart?: CanvasConnectorMarker;
    markerEnd?: CanvasConnectorMarker;
    route?: CanvasConnectorRoute;
  } | null;
  style: {
    fill: string;
    stroke: string;
    strokeVisible?: boolean;
    textColor: string;
    strokeWidth?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type BoardSnapshot = {
  id: string;
  boardId: string;
  type: "autosave" | "manual";
  label: string;
  createdAt: string;
  board: BoardSnapshotPayload;
};

export type BoardSnapshotPayload = Omit<BoardDetail, "snapshots" | "nextSnapshotNumber">;

export type BoardDetail = BoardSummary & {
  currentUserRole?: BoardRole;
  version: number;
  nextFrameNumber: number;
  nextObjectNumber: number;
  nextSnapshotNumber: number;
  nextAssetNumber: number;
  frames: BoardFrame[];
  objects: CanvasObject[];
  assets: BoardAsset[];
  snapshots: BoardSnapshot[];
  members: BoardMember[];
  shareLinks: BoardShareLink[];
};

export type CreateBoardRequest = {
  name: string;
};

export type RenameBoardRequest = {
  name: string;
};

export type CreateFrameRequest = {
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type UpdateFrameRequest = Partial<CreateFrameRequest> & {
  sortOrder?: number;
  moveAttachedObjects?: boolean;
};

export type CreateObjectRequest = {
  type: CanvasObjectType;
  groupId?: string | null;
  frameId?: string | null;
  assetId?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  content?: string;
  connection?: CanvasObject["connection"];
  strokePoints?: CanvasStrokePoint[];
  style?: Partial<CanvasObject["style"]>;
};

export type UpdateObjectRequest = Partial<CreateObjectRequest> & {
  zIndex?: number;
  style?: Partial<CanvasObject["style"]>;
};

export type BoardListResponse = {
  boards: BoardSummary[];
};

export type BoardResponse = {
  board: BoardDetail;
};

export type FrameResponse = {
  frame: BoardFrame;
  board: BoardDetail;
};

export type ObjectResponse = {
  object: CanvasObject;
  board: BoardDetail;
};

export type AssetResponse = {
  asset: BoardAsset;
  object: CanvasObject;
  board: BoardDetail;
};

export type SnapshotListResponse = {
  snapshots: Array<Omit<BoardSnapshot, "board">>;
};

export type SnapshotResponse = {
  snapshot: Omit<BoardSnapshot, "board">;
  board: BoardDetail;
};

export type CanvasTool =
  | "select"
  | "pan"
  | "sticky"
  | "text"
  | "shape"
  | "connector"
  | "pen"
  | "eraser"
  | "image"
  | "frame";

export type HealthResponse = {
  name: typeof APP_NAME;
  status: "ok";
  timestamp: string;
};
