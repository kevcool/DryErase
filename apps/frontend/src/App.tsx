import {
  APP_NAME,
  type BoardCollaborationEvent,
  type BoardDetail,
  type BoardFrame,
  type BoardShareResponse,
  type BoardSummary,
  type CanvasConnectorMarker,
  type CanvasConnectorRoute,
  type CanvasLinkSide,
  type CanvasObject,
  type CanvasObjectType,
  type CollaboratorPresence,
  type CanvasTool
} from "@dryerase/shared";
import {
  Archive,
  ArrowRight,
  Ban,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Database,
  Download,
  Circle,
  Diamond,
  Eraser,
  FileText,
  Flame,
  Frame,
  Group,
  Lightbulb,
  Link,
  Hand,
  Image,
  Hexagon,
  LayoutGrid,
  MousePointer2,
  MessageCircle,
  MessagesSquare,
  Octagon,
  PanelTop,
  Pentagon,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Scan,
  Search,
  Share2,
  Shapes,
  Sparkles,
  Square,
  StickyNote,
  ThumbsUp,
  Triangle,
  Trash2,
  Type,
  Ungroup,
  UserRound,
  AlertTriangle,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { toPng } from "html-to-image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent
} from "react";
import { create } from "zustand";
import {
  archiveBoard,
  acceptBoardShareLink,
  createBoard,
  createBoardShareLink,
  createFrame,
  createObject,
  createSnapshot,
  deleteBoard,
  deleteFrame,
  deleteObject,
  duplicateBoard,
  getCollaborationSessionId,
  getCurrentUserId,
  getBoard,
  getBoardShareInfo,
  listBoards,
  listSnapshots,
  renameBoard,
  restoreBoard,
  restoreSnapshot,
  revokeBoardShareLink,
  resolveApiUrl,
  setCurrentUserId as persistCurrentUserId,
  subscribeToBoardEvents,
  uploadAsset,
  updateBoardPresence,
  updateFrame,
  updateObject
} from "./api";
import { useCanvasViewport } from "./useCanvasViewport";

type ToolState = {
  activeTool: CanvasTool;
  setActiveTool: (tool: CanvasTool) => void;
};

type ShapeToolType = Extract<
  CanvasObjectType,
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
>;
type ComponentCategory = "basics" | "diagramming" | "icons" | "workshop" | "assets";

type LinkDraft = {
  pointerId: number;
  sourceObjectId: string;
  sourceSide: CanvasLinkSide;
  start: Point;
  current: Point;
  targetObjectId: string | null;
  targetSide: CanvasLinkSide | null;
};

type Point = {
  x: number;
  y: number;
};

type LinkTarget = {
  object: CanvasObject;
  side: CanvasLinkSide;
};

type ConnectorVariant = "line" | "arrow" | "double-arrow";
type StyleColorKey = Extract<keyof CanvasObject["style"], "fill" | "stroke" | "textColor">;

type ResizeCorner = "nw" | "ne" | "se" | "sw";
type InkDraft = {
  pointerId: number;
  frameId: string | null;
  points: Point[];
};
type SelectionDraft = {
  pointerId: number;
  start: Point;
  end: Point;
  additive: boolean;
};
const MIN_FRAME_WIDTH = 360;
const MIN_FRAME_HEIGHT = 260;

type BoardState = {
  boards: BoardSummary[];
  boardDetail: BoardDetail | null;
  selectedBoardId: string | null;
  selectedFrameId: string | null;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  isLoading: boolean;
  error: string | null;
  setBoards: (boards: BoardSummary[]) => void;
  setBoardDetail: (boardDetail: BoardDetail | null) => void;
  selectBoard: (boardId: string) => void;
  selectFrame: (frameId: string | null) => void;
  selectObject: (objectId: string | null) => void;
  selectObjects: (objectIds: string[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
};

const useToolStore = create<ToolState>((set) => ({
  activeTool: "select",
  setActiveTool: (activeTool) => set({ activeTool })
}));

const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  boardDetail: null,
  selectedBoardId: null,
  selectedFrameId: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  isLoading: true,
  error: null,
  setBoards: (boards) =>
    set((state) => ({
      boards,
      selectedBoardId:
        state.selectedBoardId && boards.some((board) => board.id === state.selectedBoardId)
          ? state.selectedBoardId
          : boards[0]?.id ?? null
    })),
  setBoardDetail: (boardDetail) =>
    set((state) => ({
      boardDetail,
      selectedFrameId:
        state.selectedFrameId && boardDetail?.frames.some((frame) => frame.id === state.selectedFrameId)
          ? state.selectedFrameId
          : boardDetail?.frames[0]?.id ?? null,
      selectedObjectId:
        state.selectedObjectId && boardDetail?.objects.some((object) => object.id === state.selectedObjectId)
          ? state.selectedObjectId
          : null,
      selectedObjectIds: state.selectedObjectIds.filter((objectId) =>
        boardDetail?.objects.some((object) => object.id === objectId)
      )
    })),
  selectBoard: (selectedBoardId) =>
    set({ selectedBoardId, boardDetail: null, selectedFrameId: null, selectedObjectId: null, selectedObjectIds: [] }),
  selectFrame: (selectedFrameId) => set({ selectedFrameId }),
  selectObject: (selectedObjectId) => set({ selectedObjectId, selectedObjectIds: selectedObjectId ? [selectedObjectId] : [] }),
  selectObjects: (selectedObjectIds) =>
    set({ selectedObjectIds, selectedObjectId: selectedObjectIds.length === 1 ? selectedObjectIds[0]! : null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error })
}));

const shapeOptions: Array<{
  type: ShapeToolType;
  label: string;
  icon: typeof Square;
}> = [
  { type: "rectangle", label: "Rectangle", icon: Square },
  { type: "ellipse", label: "Ellipse", icon: Circle },
  { type: "diamond", label: "Diamond", icon: Diamond },
  { type: "triangle", label: "Triangle", icon: Triangle },
  { type: "pentagon", label: "Pentagon", icon: Pentagon },
  { type: "hexagon", label: "Hexagon", icon: Hexagon },
  { type: "octagon", label: "Octagon", icon: Octagon }
];

const flowchartOptions: Array<{ type: ShapeToolType; label: string; icon: typeof Square }> = [
  { type: "terminator", label: "Terminator", icon: Circle },
  { type: "rectangle", label: "Process", icon: Square },
  { type: "diamond", label: "Decision", icon: Diamond },
  { type: "parallelogram", label: "Input / output", icon: PanelTop },
  { type: "document", label: "Document", icon: FileText },
  { type: "database", label: "Database", icon: Database }
];

const boardIconOptions = [
  { key: "arrow-right", label: "Arrow", icon: ArrowRight },
  { key: "check", label: "Check", icon: Check },
  { key: "close", label: "Close", icon: X },
  { key: "warning", label: "Warning", icon: AlertTriangle },
  { key: "help", label: "Help", icon: CircleHelp },
  { key: "blocked", label: "Blocked", icon: Ban },
  { key: "person", label: "Person", icon: UserRound },
  { key: "comment", label: "Comment", icon: MessageCircle },
  { key: "discussion", label: "Discussion", icon: MessagesSquare },
  { key: "pin", label: "Pin", icon: Pin },
  { key: "idea", label: "Idea", icon: Lightbulb },
  { key: "priority", label: "Priority", icon: Flame },
  { key: "search", label: "Search", icon: Search },
  { key: "image", label: "Image", icon: Image },
  { key: "camera", label: "Camera", icon: Camera },
  { key: "document", label: "Document", icon: FileText },
  { key: "link", label: "Link", icon: Link },
  { key: "play", label: "Play", icon: Play },
  { key: "approve", label: "Approve", icon: ThumbsUp }
] as const;

const numberedIconKeys = Array.from({ length: 10 }, (_, index) => `number-${index + 1}`);

const componentCategories: Array<{ id: ComponentCategory; label: string; icon: typeof Square }> = [
  { id: "basics", label: "Basics", icon: Square },
  { id: "diagramming", label: "Diagramming", icon: ArrowRight },
  { id: "icons", label: "Icons", icon: Shapes },
  { id: "workshop", label: "Workshop", icon: Sparkles },
  { id: "assets", label: "Assets", icon: Image }
];

export function App() {
  type SnapshotSummary = Awaited<ReturnType<typeof listSnapshots>>["snapshots"][number];
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const canvasViewport = useCanvasViewport(activeTool);
  const dragFrameRef = useRef<{
    pointerId: number;
    frameId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    objectOrigins: Array<{
      id: string;
      x: number;
      y: number;
      strokePoints: Point[];
    }>;
  } | null>(null);
  const resizeFrameRef = useRef<{
    pointerId: number;
    frameId: string;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragObjectRef = useRef<{
    pointerId: number;
    objectId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    memberOrigins: Array<{ id: string; x: number; y: number }>;
  } | null>(null);
  const resizeObjectRef = useRef<{
    pointerId: number;
    objectId: string;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
    aspectRatio: number;
  } | null>(null);
  const inkDraftRef = useRef<InkDraft | null>(null);
  const selectionDraftRef = useRef<SelectionDraft | null>(null);
  const boards = useBoardStore((state) => state.boards);
  const boardDetail = useBoardStore((state) => state.boardDetail);
  const selectedBoardId = useBoardStore((state) => state.selectedBoardId);
  const selectedFrameId = useBoardStore((state) => state.selectedFrameId);
  const selectedObjectId = useBoardStore((state) => state.selectedObjectId);
  const selectedObjectIds = useBoardStore((state) => state.selectedObjectIds);
  const isLoading = useBoardStore((state) => state.isLoading);
  const error = useBoardStore((state) => state.error);
  const setBoards = useBoardStore((state) => state.setBoards);
  const setBoardDetail = useBoardStore((state) => state.setBoardDetail);
  const selectBoard = useBoardStore((state) => state.selectBoard);
  const selectFrame = useBoardStore((state) => state.selectFrame);
  const selectObject = useBoardStore((state) => state.selectObject);
  const selectObjects = useBoardStore((state) => state.selectObjects);
  const setLoading = useBoardStore((state) => state.setLoading);
  const setError = useBoardStore((state) => state.setError);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [saveState, setSaveState] = useState("Loaded");
  const [activeShape, setActiveShape] = useState<ShapeToolType>("rectangle");
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [componentDrawerOpen, setComponentDrawerOpen] = useState(false);
  const [componentCategory, setComponentCategory] = useState<ComponentCategory>("basics");
  const [componentSearch, setComponentSearch] = useState("");
  const [iconPlacement, setIconPlacement] = useState<"frame" | "canvas">("frame");
  const [pendingCanvasIcon, setPendingCanvasIcon] = useState<string | null>(null);
  const [alwaysShowConnectorPoints, setAlwaysShowConnectorPoints] = useState(false);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<BoardShareResponse | null>(null);
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [latestShareUrl, setLatestShareUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [inkDraft, setInkDraft] = useState<InkDraft | null>(null);
  const [inkColor, setInkColor] = useState("#1c2430");
  const [inkWidth, setInkWidth] = useState(4);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [currentUserId, setCurrentUserId] = useState(() => getCurrentUserId());
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const linkDraftRef = useRef<LinkDraft | null>(null);
  const clipboardObjectRef = useRef<CanvasObject | null>(null);
  const lastPresenceAtRef = useRef(0);

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId]
  );
  const selectedFrame = useMemo(
    () => boardDetail?.frames.find((frame) => frame.id === selectedFrameId) ?? null,
    [boardDetail?.frames, selectedFrameId]
  );
  const selectedObject = useMemo(
    () => boardDetail?.objects.find((object) => object.id === selectedObjectId) ?? null,
    [boardDetail?.objects, selectedObjectId]
  );
  const canGroupSelection = useMemo(
    () =>
      selectedObjectIds.filter((objectId) => {
        const object = boardDetail?.objects.find((item) => item.id === objectId);
        return object ? isGroupableObject(object) : false;
      }).length >= 2,
    [boardDetail?.objects, selectedObjectIds]
  );
  const canUngroupSelection = useMemo(
    () =>
      selectedObjectIds.some((objectId) =>
        Boolean(boardDetail?.objects.find((object) => object.id === objectId)?.groupId)
      ),
    [boardDetail?.objects, selectedObjectIds]
  );
  const connectorSource = useMemo(
    () => boardDetail?.objects.find((object) => object.id === connectorSourceId) ?? null,
    [boardDetail?.objects, connectorSourceId]
  );
  const normalizedComponentSearch = componentSearch.trim().toLowerCase();
  const matchesComponentSearch = (label: string, keywords = "") =>
    `${label} ${keywords}`.toLowerCase().includes(normalizedComponentSearch);
  const hasComponentSearchResults = [
    "Sticky note",
    "Text",
    "Connector mode diagramming",
    "Frame workshop",
    "Prompt card workshop",
    "Image upload asset",
    ...shapeOptions.map((option) => `${option.label} shape`),
    ...flowchartOptions.map((option) => `${option.label} flowchart`),
    ...boardIconOptions.map((option) => `${option.label} icon`),
    ...numberedIconKeys.map((_, index) => `Number ${index + 1} icon`)
  ].some((label) => matchesComponentSearch(label));

  useEffect(() => {
    if (activeTool !== "connector") {
      setConnectorSourceId(null);
    }
  }, [activeTool]);

  useEffect(() => {
    linkDraftRef.current = linkDraft;
  }, [linkDraft?.pointerId]);

  useEffect(() => {
    if (!linkDraft) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== linkDraftRef.current?.pointerId) {
        return;
      }
      event.preventDefault();
      updateLinkDraftFromPointer(event.pointerId, event.clientX, event.clientY);
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== linkDraftRef.current?.pointerId) {
        return;
      }
      event.preventDefault();
      finishLinkDraft(event.pointerId, event.clientX, event.clientY);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [linkDraft?.pointerId]);

  useEffect(() => {
    void refreshBoards();
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token) {
      return;
    }

    const nickname = window.prompt("Choose a nickname to join this board", currentUserId)?.trim().toLowerCase();
    if (!nickname) {
      setError("Choose a nickname to join the shared board.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(nickname)) {
      setError("Nicknames use 2-63 lowercase letters, numbers, hyphens, or underscores.");
      return;
    }
    persistCurrentUserId(nickname);
    setCurrentUserId(nickname);

    void acceptBoardShareLink(token)
      .then(async (response) => {
        window.history.replaceState({}, "", window.location.pathname);
        selectBoard(response.board.id);
        setBoardDetail(response.board);
        await refreshBoards();
      })
      .catch((shareError: unknown) => {
        setError(shareError instanceof Error ? shareError.message : "Unable to open shared board.");
      });
  }, []);

  useEffect(() => {
    if (!selectedBoardId) {
      setBoardDetail(null);
      return;
    }

    void refreshBoardDetail(selectedBoardId);
  }, [selectedBoardId]);

  useEffect(() => {
    if (!selectedBoardId) {
      setCollaborators([]);
      return;
    }
    return subscribeToBoardEvents(selectedBoardId, (event: BoardCollaborationEvent) => {
      if (event.type === "presence") {
        setCollaborators(event.collaborators);
        return;
      }
      if (event.changedBy !== currentUserId) {
        setSaveState(`Updated by ${event.changedBy}`);
        void refreshBoardDetail(selectedBoardId);
      }
    });
  }, [selectedBoardId, currentUserId]);

  useEffect(() => {
    if (!selectedBoardId) {
      return;
    }
    void publishPresence(null);
  }, [selectedBoardId, selectedObjectIds, currentUserId]);

  async function refreshBoards() {
    setLoading(true);
    setError(null);
    try {
      const response = await listBoards();
      setBoards(response.boards);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load boards.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshBoardDetail(boardId: string) {
    setError(null);
    try {
      const response = await getBoard(boardId);
      setBoardDetail(response.board);
      await refreshSnapshots(boardId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load board.");
    }
  }

  function publishPresence(cursor: { x: number; y: number } | null) {
    if (!selectedBoardId) {
      return;
    }
    void updateBoardPresence(selectedBoardId, {
      cursor,
      selectedObjectIds
    }).catch(() => undefined);
  }

  function handleCollaborationPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!selectedBoardId || Date.now() - lastPresenceAtRef.current < 45) {
      return;
    }
    lastPresenceAtRef.current = Date.now();
    publishPresence(clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport));
  }

  function handleSwitchCollaborator() {
    const nextUserId = window.prompt("Collaborator name", currentUserId)?.trim().toLowerCase();
    if (!nextUserId || !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(nextUserId)) {
      return;
    }
    persistCurrentUserId(nextUserId);
    setCurrentUserId(nextUserId);
    setBoardDetail(null);
    void refreshBoards();
  }

  async function refreshSnapshots(boardId: string) {
    const response = await listSnapshots(boardId);
    setSnapshots(response.snapshots);
  }

  async function runBoardAction(action: () => Promise<void>) {
    setError(null);
    setSaveState("Saving");
    try {
      await action();
      await refreshBoards();
      if (selectedBoardId) {
        await refreshSnapshots(selectedBoardId);
      }
      setSaveState("Saved");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Board action failed.");
      setSaveState("Save failed");
    }
  }

  async function handleCreateBoard() {
    const defaultName = `Workshop board ${boards.length + 1}`;
    const name = window.prompt("Board name", defaultName)?.trim();
    if (!name) {
      return;
    }

    await runBoardAction(async () => {
      const response = await createBoard(name);
      selectBoard(response.board.id);
      setBoardDetail(response.board);
    });
  }

  async function handleRenameBoard(board: BoardSummary) {
    const name = window.prompt("Rename board", board.name)?.trim();
    if (!name || name === board.name) {
      return;
    }

    await runBoardAction(async () => {
      await renameBoard(board.id, name);
    });
  }

  async function handleDeleteBoard(board: BoardSummary) {
    if (!window.confirm(`Delete "${board.name}"? This cannot be undone.`)) {
      return;
    }

    await runBoardAction(async () => {
      await deleteBoard(board.id);
      setBoardDetail(null);
    });
  }

  async function handleOpenShare() {
    if (!boardDetail || boardDetail.currentUserRole !== "owner") {
      return;
    }

    setError(null);
    try {
      const response = await getBoardShareInfo(boardDetail.id);
      setShareInfo(response);
      setSharePanelOpen(true);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to load sharing settings.");
    }
  }

  async function handleCreateShareLink() {
    if (!boardDetail) {
      return;
    }

    setError(null);
    try {
      const response = await createBoardShareLink(boardDetail.id, shareRole);
      const url = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(response.shareLink.token)}`;
      setLatestShareUrl(url);
      setShareInfo(await getBoardShareInfo(boardDetail.id));
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to create a share link.");
    }
  }

  async function handleRevokeShareLink(linkId: string) {
    if (!boardDetail) {
      return;
    }

    setError(null);
    try {
      await revokeBoardShareLink(boardDetail.id, linkId);
      setShareInfo(await getBoardShareInfo(boardDetail.id));
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to revoke the share link.");
    }
  }

  async function handleCopyShareLink() {
    if (!latestShareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestShareUrl);
      setSaveState("Link copied");
    } catch {
      setError("Copy the share link from the field.");
    }
  }

  async function handleExportView() {
    await exportCanvas(`${exportFilename(selectedBoard?.name ?? "dryerase-board")}-view.png`);
  }

  async function handleExportFrame(frame: BoardFrame) {
    await exportCanvas(`${exportFilename(frame.name)}.png`, frame);
  }

  async function exportCanvas(filename: string, frame?: BoardFrame) {
    const stage = document.querySelector<HTMLElement>(".canvas-stage");
    if (!stage || isExporting) {
      return;
    }

    const originalViewport = canvasViewport.viewport;
    const exportViewport = frame ? canvasViewport.viewportForFrame(frame) : originalViewport;
    setError(null);
    setIsExporting(true);
    setSaveState("Exporting");
    try {
      if (frame) {
        canvasViewport.setViewport(exportViewport);
      }
      await waitForCanvasPaint();
      const dataUrl = await toPng(stage, {
        backgroundColor: "#d9dde3",
        cacheBust: true,
        pixelRatio: 2
      });
      const exportDataUrl = await drawExportConnectors(
        dataUrl,
        stage,
        boardDetail?.objects ?? [],
        exportViewport
      );
      downloadDataUrl(
        frame ? await cropFrameExport(exportDataUrl, stage, frame, exportViewport) : exportDataUrl,
        filename
      );
      setSaveState("Exported");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export this canvas view.");
      setSaveState("Export failed");
    } finally {
      if (frame) {
        canvasViewport.setViewport(originalViewport);
      }
      setIsExporting(false);
    }
  }

  async function runFrameAction(action: () => Promise<BoardDetail | void>) {
    if (!boardDetail) {
      return;
    }

    setError(null);
    setSaveState("Saving");
    try {
      const nextBoard = await action();
      if (nextBoard) {
        setBoardDetail(nextBoard);
        await refreshSnapshots(nextBoard.id);
      } else {
        await refreshBoardDetail(boardDetail.id);
      }
      await refreshBoards();
      setSaveState("Saved");
    } catch (actionError) {
      await handleCollaborationActionError(actionError, boardDetail.id, "Frame action failed.");
    }
  }

  async function runObjectAction(action: () => Promise<BoardDetail | void>) {
    if (!boardDetail) {
      return;
    }

    setError(null);
    setSaveState("Saving");
    try {
      const nextBoard = await action();
      if (nextBoard) {
        setBoardDetail(nextBoard);
        await refreshSnapshots(nextBoard.id);
      } else {
        await refreshBoardDetail(boardDetail.id);
      }
      await refreshBoards();
      setSaveState("Saved");
    } catch (actionError) {
      await handleCollaborationActionError(actionError, boardDetail.id, "Object action failed.");
    }
  }

  async function handleCollaborationActionError(actionError: unknown, boardId: string, fallback: string) {
    const message = actionError instanceof Error ? actionError.message : fallback;
    if (message.includes("changed in another session")) {
      await refreshBoardDetail(boardId);
      setError("Another collaborator changed the board. Your view was refreshed before retrying.");
      setSaveState("Refreshed");
      return;
    }
    setError(message);
    setSaveState("Save failed");
  }

  async function handleManualSnapshot() {
    if (!boardDetail) {
      return;
    }
    setError(null);
    try {
      const response = await createSnapshot(boardDetail.id);
      setBoardDetail(response.board);
      await refreshSnapshots(boardDetail.id);
      setSaveState("Snapshot saved");
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : "Snapshot failed.");
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!boardDetail || !window.confirm("Restore this snapshot? Current board state will be replaced.")) {
      return;
    }
    setError(null);
    setSaveState("Restoring");
    try {
      const response = await restoreSnapshot(boardDetail.id, snapshotId);
      setBoardDetail(response.board);
      await refreshSnapshots(boardDetail.id);
      await refreshBoards();
      setSaveState("Restored");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Restore failed.");
      setSaveState("Restore failed");
    }
  }

  async function handleCreateFrame() {
    if (!boardDetail) {
      return;
    }
    const name = window.prompt("Frame name", `Frame ${boardDetail.frames.length + 1}`)?.trim();
    if (!name) {
      return;
    }

    await runFrameAction(async () => {
      const response = await createFrame(boardDetail.id, {
        name,
        x: 140 + boardDetail.frames.length * 80,
        y: 140 + boardDetail.frames.length * 80,
        width: 1180,
        height: 820
      });
      selectFrame(response.frame.id);
      canvasViewport.fitToFrame(response.frame);
      return response.board;
    });
  }

  async function handleRenameFrame(frame: BoardFrame) {
    if (!boardDetail) {
      return;
    }
    const name = window.prompt("Rename frame", frame.name)?.trim();
    if (!name || name === frame.name) {
      return;
    }

    await runFrameAction(async () => {
      const response = await updateFrame(boardDetail.id, frame.id, { name });
      return response.board;
    });
  }

  async function handleDeleteFrame(frame: BoardFrame) {
    if (!boardDetail) {
      return;
    }
    const isLastFrame = boardDetail.frames.length === 1;
    const message = isLastFrame
      ? `Delete "${frame.name}"? The board canvas will remain available.`
      : `Delete "${frame.name}"?`;
    if (!window.confirm(message)) {
      return;
    }

    await runFrameAction(async () => {
      const response = await deleteFrame(boardDetail.id, frame.id);
      selectFrame(response.board.frames[0]?.id ?? null);
      return response.board;
    });
  }

  function handleDeleteSelection() {
    if (selectedObjectIds.length) {
      void handleDeleteSelectedObjects();
      return;
    }

    if (selectedFrame) {
      void handleDeleteFrame(selectedFrame);
    }
  }

  function handleFramePointerDown(event: ReactPointerEvent<HTMLElement>, frame: BoardFrame) {
    if (!boardDetail || activeTool !== "select" || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    selectFrame(frame.id);
    selectObject(null);
    capturePointer(event.currentTarget, event.pointerId);
    dragFrameRef.current = {
      pointerId: event.pointerId,
      frameId: frame.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: frame.x,
      originY: frame.y,
      objectOrigins: boardDetail.objects
        .filter((object) => object.frameId === frame.id)
        .map((object) => ({
          id: object.id,
          x: object.x,
          y: object.y,
          strokePoints: object.strokePoints
        }))
    };
  }

  async function handleCreateObject(tool: CanvasTool, shapeOverride?: ShapeToolType) {
    if (!boardDetail) {
      return;
    }
    if (tool === "image") {
      fileInputRef.current?.click();
      return;
    }

    const type = objectTypeForTool(tool, shapeOverride ?? activeShape);
    if (!type) {
      return;
    }

    const frame = selectedFrame ?? boardDetail.frames[0];
    await runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type,
        frameId: frame?.id ?? null,
        x: (frame?.x ?? 0) + 180 + boardDetail.objects.length * 18,
        y: (frame?.y ?? 0) + 180 + boardDetail.objects.length * 18,
        content: type === "sticky" ? "New idea" : type === "text" ? "Text" : ""
      });
      selectObject(response.object.id);
      setActiveTool("select");
      return response.board;
    });
  }

  function handleSetTool(tool: CanvasTool) {
    setActiveTool(tool);
    setComponentDrawerOpen(false);
  }

  function handleComponentCreate(tool: CanvasTool, shapeOverride?: ShapeToolType) {
    if (shapeOverride) {
      setActiveShape(shapeOverride);
    }
    setComponentDrawerOpen(false);
    void handleCreateObject(tool, shapeOverride);
  }

  function handleCreatePromptCard() {
    if (!boardDetail) {
      return;
    }

    const frame = selectedFrame ?? boardDetail.frames[0];
    const content = "What should we explore?";
    setComponentDrawerOpen(false);
    void runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type: "prompt",
        frameId: frame?.id ?? null,
        x: (frame?.x ?? 0) + 160 + boardDetail.objects.length * 18,
        y: (frame?.y ?? 0) + 160 + boardDetail.objects.length * 18,
        width: 320,
        height: 200,
        content
      });
      selectObject(response.object.id);
      selectFrame(frame?.id ?? null);
      setEditingObjectId(response.object.id);
      setEditingContent(content);
      setActiveTool("select");
      return response.board;
    });
  }

  function handleCreateIcon(iconKey: string) {
    if (!boardDetail) {
      return;
    }

    if (iconPlacement === "canvas") {
      setPendingCanvasIcon(iconKey);
      setComponentDrawerOpen(false);
      setActiveTool("select");
      selectObject(null);
      selectFrame(null);
      return;
    }

    const frame = selectedFrame ?? boardDetail.frames[0];
    setComponentDrawerOpen(false);
    void runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type: "icon",
        frameId: frame?.id ?? null,
        x: (frame?.x ?? 0) + 200 + boardDetail.objects.length * 18,
        y: (frame?.y ?? 0) + 200 + boardDetail.objects.length * 18,
        width: 88,
        height: 88,
        content: iconKey
      });
      selectObject(response.object.id);
      setActiveTool("select");
      return response.board;
    });
  }

  async function handleImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !boardDetail) {
      return;
    }

    const frame = selectedFrame ?? boardDetail.frames[0];
    await runObjectAction(async () => {
      const response = await uploadAsset(boardDetail.id, {
        file,
        frameId: frame?.id ?? null,
        x: (frame?.x ?? 0) + 220 + boardDetail.objects.length * 18,
        y: (frame?.y ?? 0) + 220 + boardDetail.objects.length * 18,
        width: 420,
        height: 280
      });
      selectObject(response.object.id);
      setActiveTool("select");
      return response.board;
    });
  }

  async function handleDeleteSelectedObjects() {
    if (!boardDetail || !selectedObjectIds.length) {
      return;
    }

    await runObjectAction(async () => {
      let board = boardDetail;
      for (const objectId of selectedObjectIds) {
        if (!board.objects.some((object) => object.id === objectId)) {
          continue;
        }
        const response = await deleteObject(board.id, objectId);
        board = response.board;
      }
      selectObject(null);
      return board;
    });
  }

  function handleGroupSelectedObjects() {
    if (!boardDetail) {
      return;
    }

    const objectIds = selectedObjectIds.filter((objectId) => {
      const object = boardDetail.objects.find((item) => item.id === objectId);
      return object ? isGroupableObject(object) : false;
    });
    if (objectIds.length < 2) {
      return;
    }

    const groupId = `group-${crypto.randomUUID()}`;
    setBoardDetail({
      ...boardDetail,
      objects: boardDetail.objects.map((object) =>
        objectIds.includes(object.id) ? { ...object, groupId } : object
      )
    });
    selectObjects(objectIds);
    void runObjectAction(async () => {
      let response: Awaited<ReturnType<typeof updateObject>> | undefined;
      for (const objectId of objectIds) {
        response = await updateObject(boardDetail.id, objectId, { groupId });
      }
      return response?.board;
    });
  }

  function handleUngroupSelectedObjects() {
    if (!boardDetail) {
      return;
    }

    const groupIds = new Set(
      selectedObjectIds
        .map((objectId) => boardDetail.objects.find((object) => object.id === objectId)?.groupId)
        .filter((groupId): groupId is string => Boolean(groupId))
    );
    const objectIds = boardDetail.objects
      .filter((object) => object.groupId && groupIds.has(object.groupId))
      .map((object) => object.id);
    if (!objectIds.length) {
      return;
    }

    setBoardDetail({
      ...boardDetail,
      objects: boardDetail.objects.map((object) =>
        objectIds.includes(object.id) ? { ...object, groupId: null } : object
      )
    });
    selectObjects(objectIds);
    void runObjectAction(async () => {
      let response: Awaited<ReturnType<typeof updateObject>> | undefined;
      for (const objectId of objectIds) {
        response = await updateObject(boardDetail.id, objectId, { groupId: null });
      }
      return response?.board;
    });
  }

  function handleStartEditingObject(object: CanvasObject) {
    if (!isAnnotatableObject(object)) {
      return;
    }

    selectObject(object.id);
    selectFrame(object.frameId);
    setEditingObjectId(object.id);
    setEditingContent(object.content);
  }

  function handleCancelEditingObject() {
    setEditingObjectId(null);
    setEditingContent("");
  }

  function handleCommitEditingObject() {
    if (!boardDetail || !editingObjectId) {
      handleCancelEditingObject();
      return;
    }

    const object = boardDetail.objects.find((item) => item.id === editingObjectId);
    if (!object) {
      handleCancelEditingObject();
      return;
    }

    const content = editingContent.trimEnd();
    setEditingObjectId(null);
    setEditingContent("");
    if (content === object.content) {
      return;
    }

    setBoardDetail({
      ...boardDetail,
      objects: boardDetail.objects.map((item) => (item.id === object.id ? { ...item, content } : item))
    });

    void runObjectAction(async () => {
      const response = await updateObject(boardDetail.id, object.id, { content });
      return response.board;
    });
  }

  function handleUpdateSelectedStyle(style: Partial<CanvasObject["style"]>) {
    if (!boardDetail || !selectedObject) {
      return;
    }

    const boardId = boardDetail.id;
    const objectId = selectedObject.id;
    setBoardDetail({
      ...boardDetail,
      objects: boardDetail.objects.map((object) =>
        object.id === objectId ? { ...object, style: { ...object.style, ...style } } : object
      )
    });

    void runObjectAction(async () => {
      const response = await updateObject(boardId, objectId, { style });
      return response.board;
    });
  }

  function handleUpdateSelectedConnection(connection: Partial<NonNullable<CanvasObject["connection"]>>) {
    if (!boardDetail || !selectedObject?.connection) {
      return;
    }

    const boardId = boardDetail.id;
    const objectId = selectedObject.id;
    const nextConnection = { ...selectedObject.connection, ...connection };
    const source = boardDetail.objects.find((object) => object.id === nextConnection.sourceObjectId);
    const target = boardDetail.objects.find((object) => object.id === nextConnection.targetObjectId);
    const geometry =
      selectedObject.type === "connector" && source && target
        ? connectorGeometry(source, target, nextConnection.sourceSide, nextConnection.targetSide, nextConnection.route)
        : {};
    setBoardDetail({
      ...boardDetail,
      objects: boardDetail.objects.map((object) =>
        object.id === objectId ? { ...object, connection: nextConnection, ...geometry } : object
      )
    });

    void runObjectAction(async () => {
      const response = await updateObject(boardId, objectId, { connection: nextConnection, ...geometry });
      return response.board;
    });
  }

  function handleCopySelectedObject() {
    if (!selectedObject) {
      return;
    }

    clipboardObjectRef.current = { ...selectedObject, style: { ...selectedObject.style } };
  }

  async function handlePasteObject() {
    const source = clipboardObjectRef.current;
    if (!boardDetail || !source) {
      return;
    }

    await duplicateObject(source, 28);
  }

  async function handleDuplicateSelectedObject() {
    if (!boardDetail || !selectedObject) {
      return;
    }

    clipboardObjectRef.current = { ...selectedObject, style: { ...selectedObject.style } };
    await duplicateObject(selectedObject, 28);
  }

  async function duplicateObject(source: CanvasObject, offset: number) {
    if (!boardDetail) {
      return;
    }

    await runObjectAction(async () => {
      let response = await createObject(boardDetail.id, {
        type: source.type,
        frameId: source.frameId,
        x: source.x + offset,
        y: source.y + offset,
        width: source.width,
        height: source.height,
        rotation: source.rotation,
        content: source.content,
        connection: null
      });
      response = await updateObject(response.board.id, response.object.id, {
        assetId: source.assetId,
        style: source.style,
        zIndex: boardDetail.objects.length + 1
      });
      selectObject(response.object.id);
      selectFrame(response.object.frameId);
      setActiveTool("select");
      clipboardObjectRef.current = { ...response.object, style: { ...response.object.style } };
      return response.board;
    });
  }

  function handleNudgeSelectedObjects(deltaX: number, deltaY: number) {
    if (!boardDetail || !selectedObjectIds.length) {
      return;
    }

    const origins = boardDetail.objects
      .filter((object) => selectedObjectIds.includes(object.id))
      .map((object) => ({ id: object.id, x: object.x, y: object.y }));
    const nextObjects = moveObjectsAndLinkedConnectors(boardDetail.objects, origins, deltaX, deltaY);
    setBoardDetail({ ...boardDetail, objects: nextObjects });

    void runObjectAction(async () => {
      let response: Awaited<ReturnType<typeof updateObject>> | undefined;
      for (const origin of origins) {
        const object = nextObjects.find((item) => item.id === origin.id);
        if (object) {
          response = await updateObject(boardDetail.id, object.id, { x: object.x, y: object.y });
        }
      }
      if (!response) {
        return;
      }
      const movedIds = new Set(origins.map((origin) => origin.id));
      const linkedConnectors = response.board.objects.filter(
        (item) =>
          item.type === "connector" &&
          (movedIds.has(item.connection?.sourceObjectId ?? "") || movedIds.has(item.connection?.targetObjectId ?? ""))
      );
      for (const connector of linkedConnectors) {
        const source = response.board.objects.find((item) => item.id === connector.connection?.sourceObjectId);
        const target = response.board.objects.find((item) => item.id === connector.connection?.targetObjectId);
        if (source && target) {
          response = await updateObject(
            response.board.id,
            connector.id,
            connectorGeometry(source, target, connector.connection?.sourceSide, connector.connection?.targetSide, connector.connection?.route)
          );
        }
      }
      return response.board;
    });
  }

  function handleObjectPointerDown(event: ReactPointerEvent<HTMLElement>, object: CanvasObject) {
    if (activeTool === "eraser" && object.type === "stroke") {
      event.stopPropagation();
      selectObject(null);
      void runObjectAction(async () => {
        const response = await deleteObject(boardDetail!.id, object.id);
        return response.board;
      });
      return;
    }

    if (activeTool === "connector" && event.button === 0) {
      event.stopPropagation();
      void handleConnectorObjectClick(object);
      return;
    }

    if (activeTool !== "select" || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    const memberIds = groupMemberIds(boardDetail?.objects ?? [], object);
    const nextSelection = event.shiftKey || event.metaKey || event.ctrlKey
      ? [...new Set([...selectedObjectIds, ...memberIds])]
      : memberIds;
    selectObjects(expandGroupedObjectIds(boardDetail?.objects ?? [], nextSelection));
    selectFrame(object.frameId);
    if (object.type === "stroke") {
      return;
    }
    capturePointer(event.currentTarget, event.pointerId);
    dragObjectRef.current = {
      pointerId: event.pointerId,
      objectId: object.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: object.x,
      originY: object.y,
      memberOrigins: (boardDetail?.objects ?? [])
        .filter((item) => memberIds.includes(item.id))
        .map((item) => ({ id: item.id, x: item.x, y: item.y }))
    };
  }

  function handleObjectPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragObjectRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    const deltaX = (event.clientX - drag.startX) / canvasViewport.viewport.scale;
    const deltaY = (event.clientY - drag.startY) / canvasViewport.viewport.scale;
    setBoardDetail({
      ...boardDetail,
      objects: moveObjectsAndLinkedConnectors(
        boardDetail.objects,
        drag.memberOrigins,
        Math.round(deltaX),
        Math.round(deltaY)
      )
    });
  }

  function handleObjectPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragObjectRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    dragObjectRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    const movedObjectIds = drag.memberOrigins.map((member) => member.id);
    const movedObjects = boardDetail.objects.filter((object) => movedObjectIds.includes(object.id));
    if (movedObjects.length) {
      void runObjectAction(async () => {
        let response: Awaited<ReturnType<typeof updateObject>> | undefined;
        for (const object of movedObjects) {
          response = await updateObject(boardDetail.id, object.id, { x: object.x, y: object.y });
        }
        if (!response) {
          return;
        }
        const linkedConnectors = response.board.objects.filter(
          (item) =>
            item.type === "connector" &&
            (movedObjectIds.includes(item.connection?.sourceObjectId ?? "") ||
              movedObjectIds.includes(item.connection?.targetObjectId ?? ""))
        );

        for (const connector of linkedConnectors) {
          const nextConnector = response.board.objects.find((item) => item.id === connector.id);
          const source = response.board.objects.find((item) => item.id === connector.connection?.sourceObjectId);
          const target = response.board.objects.find((item) => item.id === connector.connection?.targetObjectId);
          if (!nextConnector || !source || !target) {
            continue;
          }
          const geometry = connectorGeometry(
            source,
            target,
            nextConnector.connection?.sourceSide,
            nextConnector.connection?.targetSide,
            nextConnector.connection?.route
          );
          response = await updateObject(response.board.id, nextConnector.id, geometry);
        }

        return response.board;
      });
    }
  }

  function handleResizeHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    object: CanvasObject,
    corner: ResizeCorner
  ) {
    if (activeTool !== "select" || event.button !== 0 || object.type === "connector") {
      return;
    }

    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    selectObject(object.id);
    selectFrame(object.frameId);
    resizeObjectRef.current = {
      pointerId: event.pointerId,
      objectId: object.id,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      originX: object.x,
      originY: object.y,
      originWidth: object.width,
      originHeight: object.height,
      aspectRatio: object.width / object.height
    };
  }

  function handleResizeHandlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeObjectRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    const object = boardDetail.objects.find((item) => item.id === resize.objectId);
    if (!object) {
      return;
    }

    const deltaX = (event.clientX - resize.startX) / canvasViewport.viewport.scale;
    const deltaY = (event.clientY - resize.startY) / canvasViewport.viewport.scale;
    const nextBounds = resizeObjectBounds(
      resize,
      deltaX,
      deltaY,
      object.type === "image",
      isFlowchartObject(object.type) ? 80 : 160
    );
    setBoardDetail({
      ...boardDetail,
      objects: updateObjectBoundsAndLinkedConnectors(boardDetail.objects, resize.objectId, nextBounds)
    });
  }

  function handleResizeHandlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeObjectRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    resizeObjectRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    const object = boardDetail.objects.find((item) => item.id === resize.objectId);
    if (object) {
      void runObjectAction(async () => {
        let response = await updateObject(boardDetail.id, object.id, {
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height
        });
        const linkedConnectors = boardDetail.objects.filter(
          (item) =>
            item.type === "connector" &&
            (item.connection?.sourceObjectId === object.id || item.connection?.targetObjectId === object.id)
        );

        for (const connector of linkedConnectors) {
          const nextConnector = response.board.objects.find((item) => item.id === connector.id);
          const source = response.board.objects.find((item) => item.id === connector.connection?.sourceObjectId);
          const target = response.board.objects.find((item) => item.id === connector.connection?.targetObjectId);
          if (!nextConnector || !source || !target) {
            continue;
          }
          const geometry = connectorGeometry(
            source,
            target,
            nextConnector.connection?.sourceSide,
            nextConnector.connection?.targetSide,
            nextConnector.connection?.route
          );
          response = await updateObject(response.board.id, nextConnector.id, geometry);
        }

        return response.board;
      });
    }
  }

  async function handleConnectorObjectClick(object: CanvasObject) {
    if (!boardDetail || !isConnectableObject(object)) {
      return;
    }

    if (!connectorSource) {
      setConnectorSourceId(object.id);
      selectObject(object.id);
      return;
    }

    if (connectorSource.id === object.id) {
      setConnectorSourceId(null);
      return;
    }

    const source = connectorSource;
    const target = object;
    const sourceSide = bestSideForTarget(source, target);
    const targetSide = bestSideForTarget(target, source);
    const geometry = connectorGeometry(source, target, sourceSide, targetSide);
    await runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type: "connector",
        frameId: source.frameId ?? target.frameId ?? selectedFrame?.id ?? null,
        ...geometry,
        connection: {
          sourceObjectId: source.id,
          targetObjectId: target.id,
          sourceSide,
          targetSide,
          markerStart: "none",
          markerEnd: "arrow",
          route: "straight"
        }
      });
      setConnectorSourceId(null);
      selectObject(response.object.id);
      setActiveTool("select");
      return response.board;
    });
  }

  function handleLinkHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    object: CanvasObject,
    side: CanvasLinkSide
  ) {
    if (!boardDetail || event.button !== 0 || !isConnectableObject(object)) {
      return;
    }

    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const start = sideBoundaryPoint(object, side);
    selectObject(object.id);
    setActiveTool("select");
    const draft = {
      pointerId: event.pointerId,
      sourceObjectId: object.id,
      sourceSide: side,
      start,
      current: start,
      targetObjectId: null,
      targetSide: null
    };
    linkDraftRef.current = draft;
    setLinkDraft(draft);
  }

  function handleLinkHandlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    updateLinkDraftFromPointer(event.pointerId, event.clientX, event.clientY);
  }

  function handleLinkHandlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    releasePointer(event.currentTarget, event.pointerId);
    finishLinkDraft(event.pointerId, event.clientX, event.clientY);
  }

  function updateLinkDraftFromPointer(pointerId: number, clientX: number, clientY: number) {
    if (!boardDetail) {
      return;
    }

    setLinkDraft((draft) => {
      if (!draft || draft.pointerId !== pointerId) {
        return draft;
      }

      const nextDraft = linkDraftFromPointer(draft, clientX, clientY, boardDetail.objects, canvasViewport.viewport);
      linkDraftRef.current = nextDraft;
      return nextDraft;
    });
  }

  function finishLinkDraft(pointerId: number, clientX: number, clientY: number) {
    const draft = linkDraftRef.current;
    if (!draft || draft.pointerId !== pointerId || !boardDetail) {
      return;
    }

    const completedDraft = linkDraftFromPointer(draft, clientX, clientY, boardDetail.objects, canvasViewport.viewport);
    linkDraftRef.current = null;
    setLinkDraft(null);
    void completeLinkDraft(completedDraft);
  }

  async function completeLinkDraft(draft: LinkDraft) {
    if (!boardDetail) {
      return;
    }
    const source = boardDetail.objects.find((object) => object.id === draft.sourceObjectId);
    const target = boardDetail.objects.find((object) => object.id === draft.targetObjectId);
    const targetSide = draft.targetSide;
    if (!source || !target || !targetSide) {
      return;
    }

    const geometry = connectorGeometry(source, target, draft.sourceSide, targetSide);
    void runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type: "connector",
        frameId: source.frameId ?? target.frameId ?? selectedFrame?.id ?? null,
        ...geometry,
        connection: {
          sourceObjectId: source.id,
          targetObjectId: target.id,
          sourceSide: draft.sourceSide,
          targetSide,
          markerStart: "none",
          markerEnd: "arrow",
          route: "straight"
        }
      });
      selectObject(response.object.id);
      return response.board;
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.key === "Escape" && pendingCanvasIcon) {
        event.preventDefault();
        setPendingCanvasIcon(null);
        return;
      }

      if (event.key === "Escape" && selectedObjectIds.length) {
        event.preventDefault();
        handleCancelEditingObject();
        selectObject(null);
        setConnectorSourceId(null);
        setLinkDraft(null);
        linkDraftRef.current = null;
        return;
      }

      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && selectedObject && isAnnotatableObject(selectedObject)) {
        event.preventDefault();
        handleStartEditingObject(selectedObject);
        return;
      }

      const shortcutKey = event.metaKey || event.ctrlKey;
      if (shortcutKey && event.key.toLowerCase() === "g" && selectedObjectIds.length) {
        event.preventDefault();
        if (event.shiftKey) {
          handleUngroupSelectedObjects();
        } else {
          handleGroupSelectedObjects();
        }
        return;
      }
      if (shortcutKey && event.key.toLowerCase() === "c" && selectedObjectId) {
        event.preventDefault();
        handleCopySelectedObject();
        return;
      }

      if (shortcutKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePasteObject();
        return;
      }

      if (shortcutKey && event.key.toLowerCase() === "d" && selectedObjectId) {
        event.preventDefault();
        void handleDuplicateSelectedObject();
        return;
      }

      const nudge = nudgeDeltaForKey(event.key, event.shiftKey ? 10 : 1);
      if (nudge && selectedObjectIds.length) {
        event.preventDefault();
        handleNudgeSelectedObjects(nudge.x, nudge.y);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedObjectIds.length) {
        event.preventDefault();
        void handleDeleteSelectedObjects();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedFrame &&
        !selectedObjectIds.length
      ) {
        event.preventDefault();
        void handleDeleteFrame(selectedFrame);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObjectId, selectedObjectIds, selectedFrame, boardDetail, pendingCanvasIcon]);

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (pendingCanvasIcon && event.button === 0 && isBlankCanvasTarget(event.target, event.currentTarget) && boardDetail) {
      event.preventDefault();
      event.stopPropagation();
      const point = clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport);
      const iconKey = pendingCanvasIcon;
      setPendingCanvasIcon(null);
      void runObjectAction(async () => {
        const response = await createObject(boardDetail.id, {
          type: "icon",
          frameId: null,
          x: Math.round(point.x - 44),
          y: Math.round(point.y - 44),
          width: 88,
          height: 88,
          content: iconKey
        });
        selectObject(response.object.id);
        selectFrame(null);
        return response.board;
      });
      return;
    }

    canvasViewport.stageHandlers.onPointerDown(event);

    if (activeTool === "pen" && event.pointerType !== "touch" && event.button === 0 && boardDetail) {
      event.preventDefault();
      const point = clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport);
      const frame = [...boardDetail.frames]
        .reverse()
        .find((item) => point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height);
      const draft = { pointerId: event.pointerId, frameId: frame?.id ?? null, points: [point] };
      inkDraftRef.current = draft;
      setInkDraft(draft);
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    if (activeTool === "select" && event.button === 0 && isBlankCanvasTarget(event.target, event.currentTarget)) {
      const point = clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport);
      const draft = {
        pointerId: event.pointerId,
        start: point,
        end: point,
        additive: event.shiftKey || event.metaKey || event.ctrlKey
      };
      selectionDraftRef.current = draft;
      setSelectionDraft(draft);
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    if (activeTool !== "select" || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target === event.currentTarget || target.classList.contains("canvas-world"))
    ) {
      selectObject(null);
      selectFrame(null);
      setConnectorSourceId(null);
      setLinkDraft(null);
      linkDraftRef.current = null;
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLElement>) {
    canvasViewport.stageHandlers.onPointerMove(event);
    const selection = selectionDraftRef.current;
    if (selection?.pointerId === event.pointerId) {
      const nextDraft = {
        ...selection,
        end: clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport)
      };
      selectionDraftRef.current = nextDraft;
      setSelectionDraft(nextDraft);
      return;
    }
    const draft = inkDraftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) {
      return;
    }

    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const points = events.map((pointerEvent) =>
      clientPointToWorld(pointerEvent.clientX, pointerEvent.clientY, canvasViewport.viewport)
    );
    const last = draft.points[draft.points.length - 1];
    const nextPoints = points.filter((point) => !last || Math.hypot(point.x - last.x, point.y - last.y) >= 1);
    if (!nextPoints.length) {
      return;
    }
    const nextDraft = { ...draft, points: [...draft.points, ...nextPoints] };
    inkDraftRef.current = nextDraft;
    setInkDraft(nextDraft);
  }

  function handleCanvasPointerUp(event: ReactPointerEvent<HTMLElement>) {
    canvasViewport.stageHandlers.onPointerUp(event);
    const selection = selectionDraftRef.current;
    if (selection?.pointerId === event.pointerId && boardDetail) {
      selectionDraftRef.current = null;
      setSelectionDraft(null);
      releasePointer(event.currentTarget, event.pointerId);
      const bounds = normalizedSelectionBounds(selection.start, selection.end);
      const selected = boardDetail.objects
        .filter((object) => objectIntersectsBounds(object, bounds))
        .map((object) => object.id);
      const nextSelected = selection.additive ? [...new Set([...selectedObjectIds, ...selected])] : selected;
      selectObjects(expandGroupedObjectIds(boardDetail.objects, nextSelected));
      selectFrame(null);
      return;
    }
    const draft = inkDraftRef.current;
    if (!draft || draft.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    inkDraftRef.current = null;
    setInkDraft(null);
    releasePointer(event.currentTarget, event.pointerId);
    if (draft.points.length < 2) {
      return;
    }
    const bounds = strokeBounds(draft.points, inkWidth);
    void runObjectAction(async () => {
      await createObject(boardDetail.id, {
        type: "stroke",
        frameId: draft.frameId,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        strokePoints: draft.points,
        style: { stroke: inkColor, strokeWidth: inkWidth }
      });
    });
  }

  function handleCanvasDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    if (!boardDetail || event.button !== 0 || !isBlankCanvasTarget(event.target, event.currentTarget)) {
      return;
    }

    const point = clientPointToWorld(event.clientX, event.clientY, canvasViewport.viewport);
    const frame = [...boardDetail.frames]
      .reverse()
      .find(
        (item) =>
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height
      );

    void runObjectAction(async () => {
      const response = await createObject(boardDetail.id, {
        type: "sticky",
        frameId: frame?.id ?? null,
        x: Math.round(point.x - 90),
        y: Math.round(point.y - 80),
        content: "New idea"
      });
      selectObject(response.object.id);
      selectFrame(frame?.id ?? null);
      setActiveTool("select");
      return response.board;
    });
  }

  function handleFramePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragFrameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    const deltaX = (event.clientX - drag.startX) / canvasViewport.viewport.scale;
    const deltaY = (event.clientY - drag.startY) / canvasViewport.viewport.scale;
    const nextFrameX = Math.round(drag.originX + deltaX);
    const nextFrameY = Math.round(drag.originY + deltaY);
    const objectDeltaX = nextFrameX - drag.originX;
    const objectDeltaY = nextFrameY - drag.originY;
    const objectOrigins = new Map(drag.objectOrigins.map((object) => [object.id, object]));
    setBoardDetail({
      ...boardDetail,
      frames: boardDetail.frames.map((frame) =>
        frame.id === drag.frameId
          ? {
              ...frame,
              x: nextFrameX,
              y: nextFrameY
            }
          : frame
      ),
      objects: boardDetail.objects.map((object) =>
        objectOrigins.has(object.id)
          ? {
              ...object,
              x: objectOrigins.get(object.id)!.x + objectDeltaX,
              y: objectOrigins.get(object.id)!.y + objectDeltaY,
              strokePoints:
                object.type === "stroke"
                  ? objectOrigins.get(object.id)!.strokePoints.map((point) => ({
                      x: point.x + objectDeltaX,
                      y: point.y + objectDeltaY
                    }))
                  : object.strokePoints
            }
          : object
      )
    });
  }

  function handleFramePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragFrameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    dragFrameRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    const frame = boardDetail.frames.find((item) => item.id === drag.frameId);
    if (frame && (frame.x !== drag.originX || frame.y !== drag.originY)) {
      void runFrameAction(async () => {
        const response = await updateFrame(boardDetail.id, frame.id, { x: frame.x, y: frame.y });
        return response.board;
      });
    }
  }

  function handleFrameResizePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    frame: BoardFrame,
    corner: ResizeCorner
  ) {
    if (!boardDetail || activeTool !== "select" || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    selectFrame(frame.id);
    selectObject(null);
    resizeFrameRef.current = {
      pointerId: event.pointerId,
      frameId: frame.id,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      originX: frame.x,
      originY: frame.y,
      originWidth: frame.width,
      originHeight: frame.height
    };
  }

  function handleFrameResizePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeFrameRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    const deltaX = (event.clientX - resize.startX) / canvasViewport.viewport.scale;
    const deltaY = (event.clientY - resize.startY) / canvasViewport.viewport.scale;
    const nextBounds = resizeFrameBounds(resize, deltaX, deltaY);
    setBoardDetail({
      ...boardDetail,
      frames: boardDetail.frames.map((frame) =>
        frame.id === resize.frameId
          ? {
              ...frame,
              ...nextBounds
            }
          : frame
      )
    });
  }

  function handleFrameResizePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const resize = resizeFrameRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !boardDetail) {
      return;
    }

    resizeFrameRef.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    const frame = boardDetail.frames.find((item) => item.id === resize.frameId);
    if (frame) {
      void runFrameAction(async () => {
        const response = await updateFrame(boardDetail.id, frame.id, {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          moveAttachedObjects: false
        });
        return response.board;
      });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <section className="board-menu-shell" aria-label="Board">
          <button
            type="button"
            className="board-switcher"
            aria-expanded={boardMenuOpen}
            onClick={() => setBoardMenuOpen((open) => !open)}
          >
            <div className="brand-mark" aria-hidden="true">
              <DryEraseMark />
            </div>
            <div className="board-meta">
              <p className="eyebrow">Board</p>
              <h1>{selectedBoard?.name ?? APP_NAME}</h1>
              <span>{isLoading ? "Loading boards" : `${boards.length} recent board${boards.length === 1 ? "" : "s"}`}</span>
            </div>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          {boardMenuOpen ? (
            <div className="board-dropdown" role="menu">
              <section className="board-dropdown-section" aria-label="Boards">
                <button
                  type="button"
                  role="menuitem"
                  className="create-board-row"
                  onClick={() => {
                    setBoardMenuOpen(false);
                    void handleCreateBoard();
                  }}
                >
                  <Plus size={18} />
                  <span>Create board</span>
                </button>
                {boards.map((board) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={board.id}
                    className={board.id === selectedBoardId ? "selected" : ""}
                    onClick={() => {
                      selectBoard(board.id);
                      setBoardMenuOpen(false);
                    }}
                  >
                    <span>{board.name}</span>
                    {board.status === "archived" ? <Archive size={14} /> : null}
                  </button>
                ))}
              </section>
              {selectedBoard ? (
                <section className="board-dropdown-section" aria-label="Board actions">
                  <div className="panel-heading">
                    <span>Board actions</span>
                  </div>
                  <div className="board-action-grid">
                    <button
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void handleRenameBoard(selectedBoard);
                      }}
                    >
                      <Type size={16} />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void runBoardAction(async () => {
                          const response = await duplicateBoard(selectedBoard.id);
                          selectBoard(response.board.id);
                        });
                      }}
                    >
                      <Copy size={16} />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void handleExportView();
                      }}
                    >
                      <Download size={16} />
                      <span>Export view</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void runBoardAction(async () => {
                          if (selectedBoard.status === "archived") {
                            await restoreBoard(selectedBoard.id);
                          } else {
                            await archiveBoard(selectedBoard.id);
                          }
                        });
                      }}
                    >
                      {selectedBoard.status === "archived" ? <RotateCcw size={16} /> : <Archive size={16} />}
                      <span>{selectedBoard.status === "archived" ? "Restore" : "Archive"}</span>
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void handleDeleteBoard(selectedBoard);
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </section>
              ) : null}
              {boardDetail ? (
                <section className="board-dropdown-section recovery-menu" aria-label="Recovery">
                  <div className="panel-heading">
                    <span>Recovery</span>
                    <button type="button" title="Save snapshot" onClick={() => void handleManualSnapshot()}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className={`save-state ${saveState.toLowerCase().replaceAll(" ", "-")}`}>{saveState}</div>
                  {snapshots.slice(0, 5).map((snapshot) => (
                    <button
                      type="button"
                      key={snapshot.id}
                      className="snapshot-row"
                      onClick={() => void handleRestoreSnapshot(snapshot.id)}
                    >
                      <span>{snapshot.label}</span>
                      <time>{new Date(snapshot.createdAt).toLocaleTimeString()}</time>
                    </button>
                  ))}
                </section>
              ) : null}
            </div>
          ) : null}
        </section>

        <nav className="session-tools" aria-label="Session tools">
          <button
            type="button"
            title="Components"
            className={componentDrawerOpen ? "active" : ""}
            aria-expanded={componentDrawerOpen}
            onClick={() => {
              setComponentDrawerOpen((open) => !open);
              setComponentSearch("");
            }}
          >
            <LayoutGrid size={19} />
          </button>
          <button type="button" title="Switch collaborator" className="collaborator-button" onClick={handleSwitchCollaborator}>
            <UserRound size={17} />
            <span>{currentUserId}</span>
          </button>
          <button
            type="button"
            title="Select"
            className={activeTool === "select" ? "active" : ""}
            aria-pressed={activeTool === "select"}
            onClick={() => handleSetTool("select")}
          >
            <MousePointer2 size={19} />
          </button>
          <button
            type="button"
            title="Pan"
            className={activeTool === "pan" ? "active" : ""}
            aria-pressed={activeTool === "pan"}
            onClick={() => handleSetTool("pan")}
          >
            <Hand size={19} />
          </button>
          <button
            type="button"
            title="Pen"
            className={activeTool === "pen" ? "active" : ""}
            aria-pressed={activeTool === "pen"}
            onClick={() => handleSetTool("pen")}
          >
            <Pencil size={19} />
          </button>
          {boardDetail?.currentUserRole === "owner" ? (
            <button
              type="button"
              title="Share board"
              className="share-button"
              onClick={() => void handleOpenShare()}
            >
              <Share2 size={18} />
              <span>Share</span>
            </button>
          ) : null}
        </nav>
      </header>

      {activeTool === "pen" || activeTool === "eraser" ? (
        <aside className="ink-controls" aria-label="Ink controls">
          <label title="Ink color">
            <input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} />
          </label>
          <label>
            <span>Width</span>
            <input
              aria-label="Ink width"
              type="range"
              min="2"
              max="16"
              step="1"
              value={inkWidth}
              onChange={(event) => setInkWidth(Number(event.target.value))}
            />
          </label>
          <output>{inkWidth}px</output>
          <button
            type="button"
            title="Erase drawn strokes"
            aria-label="Erase drawn strokes"
            className={activeTool === "eraser" ? "active" : ""}
            aria-pressed={activeTool === "eraser"}
            onClick={() => handleSetTool(activeTool === "eraser" ? "pen" : "eraser")}
          >
            <Eraser size={18} />
          </button>
        </aside>
      ) : null}

      {sharePanelOpen && shareInfo ? (
        <aside className="share-panel" aria-label="Share board">
          <div className="panel-heading">
            <span>Share</span>
            <button type="button" title="Close sharing" onClick={() => setSharePanelOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="share-create-row">
            <select
              aria-label="Share role"
              value={shareRole}
              onChange={(event) => setShareRole(event.target.value as "editor" | "viewer")}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button type="button" onClick={() => void handleCreateShareLink()}>
              Create link
            </button>
          </div>
          {latestShareUrl ? (
            <div className="share-url-row">
              <input aria-label="New share link" readOnly value={latestShareUrl} />
              <button type="button" title="Copy share link" onClick={() => void handleCopyShareLink()}>
                <Copy size={16} />
              </button>
            </div>
          ) : null}
          <section className="share-section" aria-label="Active share links">
            <span>Active links</span>
            {shareInfo.shareLinks.length ? (
              shareInfo.shareLinks.map((link) => (
                <div className="share-row" key={link.id}>
                  <div>
                    <strong>{link.role === "editor" ? "Can edit" : "Can view"}</strong>
                    <small>{new Date(link.createdAt).toLocaleDateString()}</small>
                  </div>
                  <button
                    type="button"
                    title="Revoke share link"
                    onClick={() => void handleRevokeShareLink(link.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <p>No active links.</p>
            )}
          </section>
          <section className="share-section" aria-label="Board members">
            <span>Members</span>
            {shareInfo.members.length ? (
              shareInfo.members.map((member) => (
                <div className="share-row" key={member.userId}>
                  <strong>{member.userId}</strong>
                  <small>{member.role}</small>
                </div>
              ))
            ) : (
              <p>No members yet.</p>
            )}
          </section>
        </aside>
      ) : null}

      {boardDetail ? (
        <aside className={`frame-navigator${sharePanelOpen ? " with-share-panel" : ""}`} aria-label="Frames">
          <div className="panel-heading">
            <span>Frames</span>
            <button type="button" title="Create frame" onClick={() => void handleCreateFrame()}>
              <Plus size={16} />
            </button>
          </div>
          {boardDetail.frames
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((frame) => (
              <div
                key={frame.id}
                className={`frame-nav-row ${frame.id === selectedFrameId ? "selected" : ""}`}
              >
                <button
                  type="button"
                  className="frame-nav-select"
                  title={`Select ${frame.name}`}
                  onClick={() => {
                    selectFrame(frame.id);
                    selectObject(null);
                    canvasViewport.fitToFrame(frame);
                  }}
                >
                  <Frame size={16} />
                  <span>{frame.name}</span>
                </button>
                <div className="frame-nav-actions">
                  <button type="button" title="Export frame" onClick={() => void handleExportFrame(frame)}>
                    <Download size={15} />
                  </button>
                  <button type="button" title="Fit to frame" onClick={() => canvasViewport.fitToFrame(frame)}>
                    <Crosshair size={15} />
                  </button>
                  <button type="button" title="Rename frame" onClick={() => void handleRenameFrame(frame)}>
                    <Type size={15} />
                  </button>
                  <button
                    type="button"
                    title="Delete frame"
                    onClick={() => void handleDeleteFrame(frame)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
        </aside>
      ) : null}

      {error ? <div className="toast" role="alert">{error}</div> : null}

      {componentDrawerOpen ? (
        <aside className="component-drawer" aria-label="Components">
          <div className="component-search">
            <Search size={18} />
            <input
              type="search"
              value={componentSearch}
              onChange={(event) => setComponentSearch(event.target.value)}
              placeholder="Search components"
              aria-label="Search components"
              autoFocus
            />
          </div>
          <div className="component-layout">
            <section className="component-browser" aria-label="Component library">
              {normalizedComponentSearch ? (
                hasComponentSearchResults ? (
                  <ComponentSection title="Results">
                    {matchesComponentSearch("Sticky note") ? (
                      <ComponentTile icon={StickyNote} title="Sticky note" onClick={() => handleComponentCreate("sticky")} />
                    ) : null}
                    {matchesComponentSearch("Text") ? (
                      <ComponentTile icon={Type} title="Text" onClick={() => handleComponentCreate("text")} />
                    ) : null}
                    {matchesComponentSearch("Connector mode") ? (
                      <ComponentTile icon={ArrowRight} title="Connector mode" onClick={() => handleSetTool("connector")} />
                    ) : null}
                    {shapeOptions
                      .filter((option) => matchesComponentSearch(option.label, "shape"))
                      .map((option) => (
                        <ComponentTile
                          key={option.type}
                          icon={option.icon}
                          title={option.label}
                          onClick={() => handleComponentCreate("shape", option.type)}
                        />
                      ))}
                    {flowchartOptions
                      .filter((option) => matchesComponentSearch(option.label, "flowchart"))
                      .map((option) => (
                        <ComponentTile
                          key={option.type}
                          icon={option.icon}
                          title={option.label}
                          onClick={() => handleComponentCreate("shape", option.type)}
                        />
                      ))}
                    {boardIconOptions
                      .filter((option) => matchesComponentSearch(option.label, "icon"))
                      .map((option) => (
                        <IconTile
                          key={option.key}
                          iconKey={option.key}
                          title={option.label}
                          onClick={() => handleCreateIcon(option.key)}
                        />
                      ))}
                    {numberedIconKeys
                      .filter((_, index) => matchesComponentSearch(`Number ${index + 1}`, "icon marker"))
                      .map((iconKey, index) => (
                        <IconTile
                          key={iconKey}
                          iconKey={iconKey}
                          title={`Number ${index + 1}`}
                          onClick={() => handleCreateIcon(iconKey)}
                        />
                      ))}
                    {matchesComponentSearch("Frame", "workshop") ? (
                      <ComponentTile icon={Frame} title="Frame" onClick={() => void handleCreateFrame()} />
                    ) : null}
                    {matchesComponentSearch("Prompt card", "workshop") ? (
                      <ComponentTile icon={Sparkles} title="Prompt card" onClick={handleCreatePromptCard} />
                    ) : null}
                    {matchesComponentSearch("Image upload", "asset") ? (
                      <ComponentTile icon={Image} title="Image upload" onClick={() => handleComponentCreate("image")} />
                    ) : null}
                  </ComponentSection>
                ) : (
                  <p className="component-search-empty">No components match &quot;{componentSearch.trim()}&quot;.</p>
                )
              ) : componentCategory === "basics" ? (
                <ComponentSection title="Basics">
                  <ComponentTile icon={StickyNote} title="Sticky note" onClick={() => handleComponentCreate("sticky")} />
                  <ComponentTile icon={Type} title="Text" onClick={() => handleComponentCreate("text")} />
                </ComponentSection>
              ) : null}
              {componentCategory === "diagramming" ? (
                <>
                  <ComponentSection title="Connectors">
                    <ComponentTile icon={ArrowRight} title="Connector mode" onClick={() => handleSetTool("connector")} />
                  </ComponentSection>
                  <ComponentSection title="Connector points">
                    <ComponentToggle
                      label="Always show connector points"
                      checked={alwaysShowConnectorPoints}
                      onChange={setAlwaysShowConnectorPoints}
                    />
                  </ComponentSection>
                  <ComponentSection title="Basic shapes">
                    {shapeOptions.map((option) => (
                      <ComponentTile
                        key={option.type}
                        icon={option.icon}
                        title={option.label}
                        onClick={() => handleComponentCreate("shape", option.type)}
                      />
                    ))}
                  </ComponentSection>
                  <ComponentSection title="Flowchart">
                    {flowchartOptions.map((option) => (
                      <ComponentTile
                        key={option.type}
                        icon={option.icon}
                        title={option.label}
                        onClick={() => handleComponentCreate("shape", option.type)}
                      />
                    ))}
                  </ComponentSection>
                </>
              ) : null}
              {componentCategory === "icons" ? (
                <>
                  <ComponentSection title="Placement">
                    <IconPlacementControl placement={iconPlacement} onChange={setIconPlacement} />
                  </ComponentSection>
                  <ComponentSection title="Common icons">
                    {boardIconOptions.map((option) => (
                      <IconTile
                        key={option.key}
                        iconKey={option.key}
                        title={option.label}
                        onClick={() => handleCreateIcon(option.key)}
                      />
                    ))}
                  </ComponentSection>
                  <ComponentSection title="Numbered markers">
                    {numberedIconKeys.map((iconKey, index) => (
                      <IconTile
                        key={iconKey}
                        iconKey={iconKey}
                        title={`Number ${index + 1}`}
                        onClick={() => handleCreateIcon(iconKey)}
                      />
                    ))}
                  </ComponentSection>
                </>
              ) : null}
              {componentCategory === "workshop" ? (
                <ComponentSection title="Workshop">
                  <ComponentTile icon={Frame} title="Frame" onClick={() => void handleCreateFrame()} />
                  <ComponentTile icon={Sparkles} title="Prompt card" onClick={handleCreatePromptCard} />
                </ComponentSection>
              ) : null}
              {componentCategory === "assets" ? (
                <ComponentSection title="Assets">
                  <ComponentTile icon={Image} title="Image upload" onClick={() => handleComponentCreate("image")} />
                </ComponentSection>
              ) : null}
            </section>
            <nav className="component-categories" aria-label="Component categories">
              {componentCategories.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  className={componentCategory === id ? "active" : ""}
                  aria-pressed={componentCategory === id}
                  onClick={() => setComponentCategory(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>
      ) : null}

      {selectedObject ? (
        <StyleInspector
          object={selectedObject}
          onChange={handleUpdateSelectedStyle}
          onConnectionChange={handleUpdateSelectedConnection}
        />
      ) : null}

      {pendingCanvasIcon ? (
        <div className="canvas-placement-indicator" role="status">
          <BoardIcon iconKey={pendingCanvasIcon} />
          <button type="button" title="Cancel canvas icon placement" aria-label="Cancel canvas icon placement" onClick={() => setPendingCanvasIcon(null)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => void handleImageSelected(event)}
      />

      <section
        className={`canvas-stage ${canvasViewport.canPan ? "pan-ready" : ""} ${canvasViewport.isPanning ? "is-panning" : ""} ${isExporting ? "is-exporting" : ""}`}
        aria-label="Whiteboard canvas preview"
        ref={canvasViewport.setStageRef}
        {...canvasViewport.stageHandlers}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={(event) => {
          handleCanvasPointerMove(event);
          handleCollaborationPointerMove(event);
        }}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onDoubleClick={handleCanvasDoubleClick}
      >
        {selectedBoard ? (
          <div
            className="canvas-world"
            style={{
              transform: `translate3d(${canvasViewport.viewport.x}px, ${canvasViewport.viewport.y}px, 0) scale(${canvasViewport.viewport.scale})`
            }}
          >
            {boardDetail?.frames.map((frame) => (
              <section
                key={frame.id}
                className={`frame-outline ${frame.id === selectedFrameId ? "selected" : ""}`}
                style={{
                  width: frame.width,
                  height: frame.height,
                  transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`
                }}
                onPointerDown={(event) => handleFramePointerDown(event, frame)}
                onPointerMove={handleFramePointerMove}
                onPointerUp={handleFramePointerUp}
                onPointerCancel={handleFramePointerUp}
              >
                <div className="frame-title">{frame.name}</div>
                <div className="frame-actions" onPointerDown={(event) => event.stopPropagation()}>
                  <button type="button" title="Fit to frame" onClick={() => canvasViewport.fitToFrame(frame)}>
                    <Crosshair size={16} />
                  </button>
                  <button type="button" title="Rename frame" onClick={() => void handleRenameFrame(frame)}>
                    <Type size={16} />
                  </button>
                  <button type="button" title="Delete frame" onClick={() => void handleDeleteFrame(frame)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {frame.id === selectedFrameId && !selectedObjectIds.length ? (
                  <FrameResizeHandles
                    frame={frame}
                    onPointerDown={handleFrameResizePointerDown}
                    onPointerMove={handleFrameResizePointerMove}
                    onPointerUp={handleFrameResizePointerUp}
                  />
                ) : null}
              </section>
            ))}
            {boardDetail?.objects
              .slice()
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((object) => (
                <CanvasObjectView
                  key={object.id}
                  object={object}
                  selected={selectedObjectIds.includes(object.id)}
                  resizable={!object.groupId}
                  connecting={object.id === connectorSourceId}
                  linkTargetSide={linkDraft?.targetObjectId === object.id ? linkDraft.targetSide : null}
                  showLinkHandles={
                    isConnectableObject(object) &&
                    (alwaysShowConnectorPoints || selectedObjectIds.includes(object.id) || object.id === linkDraft?.targetObjectId)
                  }
                  onLinkHandlePointerDown={handleLinkHandlePointerDown}
                  onLinkHandlePointerMove={handleLinkHandlePointerMove}
                  onLinkHandlePointerUp={handleLinkHandlePointerUp}
                  onResizeHandlePointerDown={handleResizeHandlePointerDown}
                  onResizeHandlePointerMove={handleResizeHandlePointerMove}
                  onResizeHandlePointerUp={handleResizeHandlePointerUp}
                  editing={object.id === editingObjectId}
                  editingContent={object.id === editingObjectId ? editingContent : ""}
                  onStartEditing={handleStartEditingObject}
                  onEditingContentChange={setEditingContent}
                  onCommitEditing={handleCommitEditingObject}
                  onCancelEditing={handleCancelEditingObject}
                  onPointerDown={handleObjectPointerDown}
                  onPointerMove={handleObjectPointerMove}
                  onPointerUp={handleObjectPointerUp}
                  assetUrl={assetUrlForObject(object, boardDetail)}
                  objects={boardDetail.objects}
                />
              ))}
            {collaborators
              .filter((collaborator) => collaborator.sessionId !== getCollaborationSessionId() && collaborator.cursor)
              .map((collaborator) => (
                <div
                  className="collaborator-cursor"
                  key={collaborator.sessionId}
                  style={{
                    left: collaborator.cursor!.x,
                    top: collaborator.cursor!.y,
                    "--collaborator-color": collaborator.color
                  } as CSSProperties}
                >
                  <MousePointer2 size={20} fill="currentColor" />
                  <span>{collaborator.userId}</span>
                </div>
              ))}
            {linkDraft ? <ConnectorPreview draft={linkDraft} /> : null}
            {inkDraft ? <InkPreview draft={inkDraft} color={inkColor} width={inkWidth} /> : null}
            {selectionDraft ? <SelectionMarquee draft={selectionDraft} /> : null}
          </div>
        ) : (
          <div className="empty-board-state">
            <h2>Create your first board</h2>
            <p>Start with a named workshop board, then add frames, imported assets, notes, and diagrams.</p>
            <button type="button" onClick={() => void handleCreateBoard()}>
              <Plus size={18} />
              <span>Create board</span>
            </button>
          </div>
        )}
      </section>

      <nav className="viewport-controls" aria-label="Viewport controls">
        <button
          type="button"
          title="Create object from active tool"
          disabled={!objectTypeForTool(activeTool, activeShape)}
          onClick={() => void handleCreateObject(activeTool)}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          title={selectedObjectIds.length ? "Delete selected objects" : "Delete selected frame"}
          disabled={!selectedObjectIds.length && !selectedFrame}
          onClick={handleDeleteSelection}
        >
          <Trash2 size={18} />
        </button>
        <button
          type="button"
          title="Group selected objects"
          aria-label="Group selected objects"
          disabled={!canGroupSelection}
          onClick={handleGroupSelectedObjects}
        >
          <Group size={18} />
        </button>
        <button
          type="button"
          title="Ungroup selected objects"
          aria-label="Ungroup selected objects"
          disabled={!canUngroupSelection}
          onClick={handleUngroupSelectedObjects}
        >
          <Ungroup size={18} />
        </button>
        <button type="button" title="Zoom out" onClick={canvasViewport.zoomOut}>
          <ZoomOut size={18} />
        </button>
        <span>{Math.round(canvasViewport.viewport.scale * 100)}%</span>
        <button type="button" title="Zoom in" onClick={canvasViewport.zoomIn}>
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          title="Fit to frame"
          onClick={() => selectedFrame && canvasViewport.fitToFrame(selectedFrame)}
          disabled={!selectedFrame}
        >
          <Scan size={18} />
        </button>
        <button type="button" title="Reset view" onClick={canvasViewport.resetView}>
          <RotateCcw size={18} />
        </button>
      </nav>

      <footer className="statusbar">
        <span>
          Tool: {activeTool === "shape" ? `shape (${activeShape})` : activeTool === "eraser" ? "erase drawn strokes" : activeTool}
        </span>
        <span>{saveState}</span>
        <span>{selectedBoard ? `Updated ${new Date(selectedBoard.updatedAt).toLocaleString()}` : "No board selected"}</span>
        <span>{Math.round(canvasViewport.viewport.scale * 100)}%</span>
      </footer>
    </main>
  );
}

function ComponentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="component-section">
      <h2>{title}</h2>
      <div className="component-grid">{children}</div>
    </section>
  );
}

function ComponentToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="component-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="component-toggle-track" aria-hidden="true" />
    </label>
  );
}

function IconPlacementControl({
  placement,
  onChange
}: {
  placement: "frame" | "canvas";
  onChange: (placement: "frame" | "canvas") => void;
}) {
  return (
    <div className="icon-placement-control" aria-label="Icon placement">
      <button
        type="button"
        className={placement === "frame" ? "active" : ""}
        aria-pressed={placement === "frame"}
        onClick={() => onChange("frame")}
      >
        <Frame size={18} />
        <span>Frame</span>
      </button>
      <button
        type="button"
        className={placement === "canvas" ? "active" : ""}
        aria-pressed={placement === "canvas"}
        onClick={() => onChange("canvas")}
      >
        <MousePointer2 size={18} />
        <span>Canvas</span>
      </button>
    </div>
  );
}

function DryEraseMark() {
  return (
    <svg className="brand-mark-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path
        className="brand-mark-stroke"
        d="M32.5 10.8A15.2 15.2 0 1 0 36.4 29"
        fill="none"
        strokeLinecap="round"
      />
      <circle className="brand-mark-dot" cx="36.8" cy="33.3" r="2.4" />
      <circle className="brand-mark-dot accent" cx="32.8" cy="38.4" r="2" />
      <g transform="translate(32.5 12.5) rotate(-42)">
        <rect className="brand-marker-body" x="0" y="0" width="8.2" height="13.5" rx="2.2" />
        <rect className="brand-marker-band" x="0" y="8.2" width="8.2" height="2.6" />
        <path className="brand-marker-tip" d="M1.7 13.5h4.8L4.1 18z" />
      </g>
    </svg>
  );
}

function ComponentTile({
  icon: Icon,
  title,
  onClick
}: {
  icon: typeof Square;
  title: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="component-tile" onClick={onClick}>
      <span className="component-preview">
        <Icon size={42} />
      </span>
      <span>{title}</span>
    </button>
  );
}

function IconTile({
  iconKey,
  title,
  onClick
}: {
  iconKey: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="component-tile icon-tile" title={title} onClick={onClick}>
      <span className="component-preview">
        <BoardIcon iconKey={iconKey} />
      </span>
      <span>{title}</span>
    </button>
  );
}

function BoardIcon({ iconKey }: { iconKey: string }) {
  const number = /^number-(10|[1-9])$/.exec(iconKey)?.[1];
  if (number) {
    return (
      <svg className="board-icon" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="27" fill="currentColor" />
        <text x="32" y="41" fill="#ffffff" fontSize={number === "10" ? "25" : "30"} fontWeight="800" textAnchor="middle">
          {number}
        </text>
      </svg>
    );
  }

  const icon = boardIconOptions.find((option) => option.key === iconKey);
  const Icon = icon?.icon ?? CircleHelp;
  return <Icon className="board-icon" strokeWidth={2.4} aria-hidden="true" />;
}

const styleSwatches = ["#f9e85f", "#e0f2fe", "#fce7f3", "#eef2ff", "#ffffff", "#1c2430"];

function StyleInspector({
  object,
  onChange,
  onConnectionChange
}: {
  object: CanvasObject;
  onChange: (style: Partial<CanvasObject["style"]>) => void;
  onConnectionChange: (connection: Partial<NonNullable<CanvasObject["connection"]>>) => void;
}) {
  const rows = styleRowsForObject(object);
  const connectorVariant = connectorVariantForObject(object);
  const connectorRoute = connectorRouteForObject(object);

  return (
    <aside className="style-inspector" aria-label="Element style">
      <div className="panel-heading">
        <span>Style</span>
        <span className="object-kind">{object.type}</span>
      </div>
      {rows.map((row) => (
        <div className="style-row" key={row.key}>
          <label htmlFor={`style-${row.key}`}>{row.label}</label>
          <div className="style-color-controls">
            <input
              id={`style-${row.key}`}
              type="color"
              value={colorInputValue(object.style[row.key])}
              aria-label={row.label}
              onChange={(event) => onChange({ [row.key]: event.target.value })}
            />
            {row.key === "stroke" && object.type !== "connector" && object.type !== "stroke" ? (
              <label className="border-toggle">
                <input
                  type="checkbox"
                  checked={object.style.strokeVisible === false}
                  aria-label="Hide border"
                  onChange={(event) => onChange({ strokeVisible: !event.target.checked })}
                />
                <span>No border</span>
              </label>
            ) : null}
          </div>
          <div className="style-swatches" aria-label={`${row.label} presets`}>
            {styleSwatches.map((color) => (
              <button
                type="button"
                key={`${row.key}-${color}`}
                title={`${row.label} ${color}`}
                aria-label={`${row.label} ${color}`}
                style={{ background: color }}
                onClick={() => onChange({ [row.key]: color })}
              />
            ))}
          </div>
        </div>
      ))}
      {connectorVariant ? (
        <>
          <div className="style-row connector-option-row">
            <span>Ends</span>
            <div className="connector-button-options" aria-label="Connector type">
              {connectorVariantOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={connectorVariant === option.value ? "active" : ""}
                  aria-pressed={connectorVariant === option.value}
                  onClick={() => onConnectionChange(connectionMarkersForVariant(option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="style-row connector-option-row">
            <span>Route</span>
            <div className="connector-button-options" aria-label="Connector route">
              {connectorRouteOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={connectorRoute === option.value ? "active" : ""}
                  aria-pressed={connectorRoute === option.value}
                  onClick={() => onConnectionChange({ route: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="style-row connector-option-row">
            <span>Thickness</span>
            <div className="connector-button-options" aria-label="Connector thickness">
              {connectorThicknessOptions.map((width) => (
                <button
                  type="button"
                  key={width}
                  className={connectorStrokeWidth(object) === width ? "active" : ""}
                  aria-pressed={connectorStrokeWidth(object) === width}
                  onClick={() => onChange({ strokeWidth: width })}
                >
                  {width}px
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

const connectorVariantOptions: Array<{ value: ConnectorVariant; label: string }> = [
  { value: "line", label: "Line" },
  { value: "arrow", label: "Arrow" },
  { value: "double-arrow", label: "Double" }
];
const connectorRouteOptions: Array<{ value: CanvasConnectorRoute; label: string }> = [
  { value: "straight", label: "Straight" },
  { value: "elbow", label: "Elbow" },
  { value: "curved", label: "Curved" }
];
const connectorThicknessOptions = [2, 4, 5, 8, 12];

function styleRowsForObject(object: CanvasObject): Array<{ key: StyleColorKey; label: string }> {
  if (object.type === "connector") {
    return [{ key: "stroke", label: "Line" }];
  }

  if (object.type === "image") {
    return [{ key: "stroke", label: "Border" }];
  }
  if (object.type === "icon") {
    return [{ key: "textColor", label: "Color" }];
  }
  if (object.type === "text") {
    return [{ key: "textColor", label: "Text" }];
  }
  return [
    { key: "fill", label: "Fill" },
    { key: "stroke", label: "Border" },
    { key: "textColor", label: "Text" }
  ];
}

function colorInputValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
}

function connectorStrokeWidth(object: CanvasObject): number {
  return object.style.strokeWidth ?? 5;
}

function connectorVariantForObject(object: CanvasObject): ConnectorVariant | null {
  if (object.type !== "connector") {
    return null;
  }

  const markerStart = connectionMarkerOrDefault(object.connection?.markerStart, "none");
  const markerEnd = connectionMarkerOrDefault(object.connection?.markerEnd, "arrow");
  if (markerStart === "arrow" && markerEnd === "arrow") {
    return "double-arrow";
  }
  if (markerEnd === "arrow") {
    return "arrow";
  }
  return "line";
}

function connectorRouteForObject(object: CanvasObject): CanvasConnectorRoute | null {
  if (object.type !== "connector") {
    return null;
  }

  return object.connection?.route ?? "straight";
}

function connectionMarkersForVariant(
  variant: ConnectorVariant
): Pick<NonNullable<CanvasObject["connection"]>, "markerStart" | "markerEnd"> {
  switch (variant) {
    case "line":
      return { markerStart: "none", markerEnd: "none" };
    case "arrow":
      return { markerStart: "none", markerEnd: "arrow" };
    case "double-arrow":
      return { markerStart: "arrow", markerEnd: "arrow" };
  }
}

function connectionMarkerOrDefault(
  marker: CanvasConnectorMarker | undefined,
  fallback: CanvasConnectorMarker
): CanvasConnectorMarker {
  return marker ?? fallback;
}

function connectorMarkerClass(object: CanvasObject): string {
  const markerStart = connectionMarkerOrDefault(object.connection?.markerStart, "none");
  const markerEnd = connectionMarkerOrDefault(object.connection?.markerEnd, "arrow");
  return [
    markerStart === "arrow" ? "connector-start-arrow" : "",
    markerEnd === "arrow" ? "connector-end-arrow" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function nudgeDeltaForKey(key: string, distance: number): Point | null {
  switch (key) {
    case "ArrowUp":
      return { x: 0, y: -distance };
    case "ArrowRight":
      return { x: distance, y: 0 };
    case "ArrowDown":
      return { x: 0, y: distance };
    case "ArrowLeft":
      return { x: -distance, y: 0 };
    default:
      return null;
  }
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isBlankCanvasTarget(target: EventTarget | null, canvas: HTMLElement): boolean {
  return (
    target instanceof HTMLElement &&
    (target === canvas || target.classList.contains("canvas-world") || target.classList.contains("frame-outline"))
  );
}

function objectTypeForTool(tool: CanvasTool, activeShape: ShapeToolType): CanvasObjectType | null {
  switch (tool) {
    case "sticky":
      return "sticky";
    case "text":
      return "text";
    case "shape":
      return activeShape;
    case "connector":
      return "connector";
    case "image":
      return "image";
    default:
      return null;
  }
}

function assetUrlForObject(object: CanvasObject, board: BoardDetail): string | null {
  if (!object.assetId) {
    return null;
  }
  const asset = board.assets.find((item) => item.id === object.assetId);
  return asset ? resolveApiUrl(asset.url) : null;
}

function isConnectableObject(object: CanvasObject): boolean {
  return object.type !== "connector" && object.type !== "stroke";
}

function isGroupableObject(object: CanvasObject): boolean {
  return object.type !== "connector" && object.type !== "stroke";
}

function groupMemberIds(objects: CanvasObject[], object: CanvasObject): string[] {
  if (!object.groupId) {
    return [object.id];
  }
  return objects.filter((item) => item.groupId === object.groupId).map((item) => item.id);
}

function expandGroupedObjectIds(objects: CanvasObject[], objectIds: string[]): string[] {
  const selectedIds = new Set(objectIds);
  const groupIds = new Set(
    objects
      .filter((object) => selectedIds.has(object.id) && object.groupId)
      .map((object) => object.groupId)
  );
  return objects
    .filter((object) => selectedIds.has(object.id) || Boolean(object.groupId && groupIds.has(object.groupId)))
    .map((object) => object.id);
}

function isAnnotatableObject(object: CanvasObject): boolean {
  return [
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
    "octagon"
  ].includes(object.type);
}

function isFlowchartObject(type: CanvasObjectType): boolean {
  return ["terminator", "parallelogram", "document", "database"].includes(type);
}


function objectCenter(object: CanvasObject) {
  return {
    x: object.x + object.width / 2,
    y: object.y + object.height / 2
  };
}

function linkPoint(object: CanvasObject, side: CanvasLinkSide): Point {
  if (object.type === "diamond") {
    return diamondLinkPoint(object, side);
  }

  switch (side) {
    case "top":
      return { x: object.x + object.width / 2, y: object.y };
    case "right":
      return { x: object.x + object.width, y: object.y + object.height / 2 };
    case "bottom":
      return { x: object.x + object.width / 2, y: object.y + object.height };
    case "left":
      return { x: object.x, y: object.y + object.height / 2 };
  }
}

function diamondLinkPoint(object: CanvasObject, side: CanvasLinkSide): Point {
  const corner = (() => {
    switch (side) {
      case "top":
        return { x: object.x, y: object.y };
      case "right":
        return { x: object.x + object.width, y: object.y };
      case "bottom":
        return { x: object.x + object.width, y: object.y + object.height };
      case "left":
        return { x: object.x, y: object.y + object.height };
    }
  })();
  return rotatePoint(corner, objectCenter(object), 45);
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;
  return {
    x: Math.round(center.x + deltaX * cos - deltaY * sin),
    y: Math.round(center.y + deltaX * sin + deltaY * cos)
  };
}

function nearestLinkSide(object: CanvasObject, point: Point): CanvasLinkSide {
  const sides: CanvasLinkSide[] = ["top", "right", "bottom", "left"];
  return sides.reduce((closestSide, side) => {
    const closestPoint = linkPoint(object, closestSide);
    const sidePoint = linkPoint(object, side);
    return distance(point, sidePoint) < distance(point, closestPoint) ? side : closestSide;
  }, "right" as CanvasLinkSide);
}

function bestSideForTarget(object: CanvasObject, target: CanvasObject): CanvasLinkSide {
  return nearestLinkSide(object, objectCenter(target));
}

function linkSideFromElement(element: HTMLElement | null): CanvasLinkSide | null {
  if (!element) {
    return null;
  }

  const sides: CanvasLinkSide[] = ["top", "right", "bottom", "left"];
  return sides.find((side) => element.classList.contains(side)) ?? null;
}

function clientPointToWorld(
  clientX: number,
  clientY: number,
  viewport: { x: number; y: number; scale: number }
): Point {
  const world = document.querySelector(".canvas-world");
  const rect = world?.getBoundingClientRect();
  return {
    x: Math.round((clientX - (rect?.left ?? 0)) / viewport.scale),
    y: Math.round((clientY - (rect?.top ?? 0)) / viewport.scale)
  };
}

function linkDraftFromPointer(
  draft: LinkDraft,
  clientX: number,
  clientY: number,
  objects: CanvasObject[],
  viewport: { x: number; y: number; scale: number }
): LinkDraft {
  const pointer = clientPointToWorld(clientX, clientY, viewport);
  const target = linkTargetFromPoint(clientX, clientY, pointer, objects, draft.sourceObjectId);
  const current = target ? sideBoundaryPoint(target.object, target.side) : pointer;
  return {
    ...draft,
    current,
    targetObjectId: target?.object.id ?? null,
    targetSide: target?.side ?? null
  };
}

function linkTargetFromPoint(
  clientX: number,
  clientY: number,
  current: Point,
  objects: CanvasObject[],
  sourceObjectId: string | null
): LinkTarget | null {
  if (!sourceObjectId) {
    return null;
  }

  const element = document.elementFromPoint(clientX, clientY);
  const handle = element instanceof HTMLElement ? element.closest<HTMLElement>(".link-handle") : null;
  const objectId =
    element instanceof HTMLElement ? element.closest<HTMLElement>("[data-object-id]")?.dataset.objectId : null;
  const object = objects.find((item) => item.id === objectId) ?? null;
  if (!object || object.id === sourceObjectId || !isConnectableObject(object)) {
    return null;
  }

  return {
    object,
    side: linkSideFromElement(handle) ?? nearestLinkSide(object, current)
  };
}

function connectorGeometry(
  source: CanvasObject,
  target: CanvasObject,
  sourceSide: CanvasLinkSide = bestSideForTarget(source, target),
  targetSide: CanvasLinkSide = bestSideForTarget(target, source),
  route: CanvasConnectorRoute = "straight"
) {
  const points = connectorLinkPoints(source, target, sourceSide, targetSide);
  return connectorPathGeometryFromPoints(points.source, points.target, route, sourceSide, targetSide).bounds;
}

function connectorLinkPoints(
  source: CanvasObject,
  target: CanvasObject,
  sourceSide: CanvasLinkSide,
  targetSide: CanvasLinkSide
) {
  return {
    source: sideBoundaryPoint(source, sourceSide),
    target: sideBoundaryPoint(target, targetSide)
  };
}

function sideBoundaryPoint(object: CanvasObject, side: CanvasLinkSide): Point {
  const center = objectCenter(object);
  const reach = Math.max(object.width, object.height);
  return shapeBoundaryPoint(object, offsetPointForSide(center, side, reach));
}

function shapeBoundaryPoint(object: CanvasObject, toward: Point): Point {
  if (object.type === "ellipse") {
    return ellipseBoundaryPoint(object, toward);
  }
  if (object.type === "diamond") {
    return diamondBoundaryPoint(object, toward);
  }
  return rectangleBoundaryPoint(object, toward);
}

function rectangleBoundaryPoint(object: CanvasObject, toward: Point): Point {
  const center = objectCenter(object);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  if (deltaX === 0 && deltaY === 0) {
    return center;
  }

  const halfWidth = object.width / 2;
  const halfHeight = object.height / 2;
  const scale = Math.min(
    deltaX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(deltaX),
    deltaY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(deltaY)
  );
  return {
    x: Math.round(center.x + deltaX * scale),
    y: Math.round(center.y + deltaY * scale)
  };
}

function ellipseBoundaryPoint(object: CanvasObject, toward: Point): Point {
  const center = objectCenter(object);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  if (deltaX === 0 && deltaY === 0) {
    return center;
  }

  const radiusX = object.width / 2;
  const radiusY = object.height / 2;
  const scale = 1 / Math.sqrt((deltaX * deltaX) / (radiusX * radiusX) + (deltaY * deltaY) / (radiusY * radiusY));
  return {
    x: Math.round(center.x + deltaX * scale),
    y: Math.round(center.y + deltaY * scale)
  };
}

function diamondBoundaryPoint(object: CanvasObject, toward: Point): Point {
  const center = objectCenter(object);
  const localToward = rotatePoint(toward, center, -45);
  const localDeltaX = localToward.x - center.x;
  const localDeltaY = localToward.y - center.y;
  if (localDeltaX === 0 && localDeltaY === 0) {
    return center;
  }

  const halfWidth = object.width / 2;
  const halfHeight = object.height / 2;
  const scale = Math.min(
    localDeltaX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(localDeltaX),
    localDeltaY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(localDeltaY)
  );
  const localBoundary = {
    x: center.x + localDeltaX * scale,
    y: center.y + localDeltaY * scale
  };
  return rotatePoint(localBoundary, center, 45);
}

function connectorPathGeometryFromPoints(
  sourcePoint: Point,
  targetPoint: Point,
  route: CanvasConnectorRoute,
  sourceSide: CanvasLinkSide = "right",
  targetSide: CanvasLinkSide = "left"
) {
  const padding = route === "elbow" ? 72 : 36;
  const minX = Math.min(sourcePoint.x, targetPoint.x) - padding;
  const minY = Math.min(sourcePoint.y, targetPoint.y) - padding;
  const maxX = Math.max(sourcePoint.x, targetPoint.x) + padding;
  const maxY = Math.max(sourcePoint.y, targetPoint.y) + padding;
  const bounds = {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(56, Math.round(maxX - minX)),
    height: Math.max(56, Math.round(maxY - minY)),
    rotation: 0
  };
  const source = { x: sourcePoint.x - bounds.x, y: sourcePoint.y - bounds.y };
  const target = { x: targetPoint.x - bounds.x, y: targetPoint.y - bounds.y };

  return {
    bounds,
    path: connectorPathData(source, target, route, sourceSide, targetSide)
  };
}

function connectorPathData(
  source: Point,
  target: Point,
  route: CanvasConnectorRoute,
  sourceSide: CanvasLinkSide,
  targetSide: CanvasLinkSide
): string {
  if (route === "elbow") {
    const stubLength = 48;
    const sourceStub = offsetPointForSide(source, sourceSide, stubLength);
    const targetStub = offsetPointForSide(target, targetSide, stubLength);
    if (sourceSide === "top" || sourceSide === "bottom") {
      const midY = Math.round((sourceStub.y + targetStub.y) / 2);
      return [
        `M ${source.x} ${source.y}`,
        `L ${sourceStub.x} ${sourceStub.y}`,
        `L ${sourceStub.x} ${midY}`,
        `L ${targetStub.x} ${midY}`,
        `L ${targetStub.x} ${targetStub.y}`,
        `L ${target.x} ${target.y}`
      ].join(" ");
    }
    const midX = Math.round((sourceStub.x + targetStub.x) / 2);
    return [
      `M ${source.x} ${source.y}`,
      `L ${sourceStub.x} ${sourceStub.y}`,
      `L ${midX} ${sourceStub.y}`,
      `L ${midX} ${targetStub.y}`,
      `L ${targetStub.x} ${targetStub.y}`,
      `L ${target.x} ${target.y}`
    ].join(" ");
  }

  if (route === "curved") {
    const controlDistance = Math.max(56, Math.min(180, distance(source, target) / 2));
    const sourceControl = controlPointForSide(source, sourceSide, controlDistance);
    const targetControl = controlPointForSide(target, targetSide, controlDistance);
    return `M ${source.x} ${source.y} C ${sourceControl.x} ${sourceControl.y}, ${targetControl.x} ${targetControl.y}, ${target.x} ${target.y}`;
  }

  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function controlPointForSide(point: Point, side: CanvasLinkSide, distanceValue: number): Point {
  return offsetPointForSide(point, side, distanceValue);
}

function offsetPointForSide(point: Point, side: CanvasLinkSide, distanceValue: number): Point {
  switch (side) {
    case "top":
      return { x: point.x, y: point.y - distanceValue };
    case "right":
      return { x: point.x + distanceValue, y: point.y };
    case "bottom":
      return { x: point.x, y: point.y + distanceValue };
    case "left":
      return { x: point.x - distanceValue, y: point.y };
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function strokeBounds(points: Point[], width: number) {
  const padding = width + 4;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.floor(Math.min(...xs) - padding);
  const y = Math.floor(Math.min(...ys) - padding);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs) + padding * 2)),
    height: Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys) + padding * 2))
  };
}

function normalizedSelectionBounds(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function objectIntersectsBounds(object: CanvasObject, bounds: { x: number; y: number; width: number; height: number }) {
  return (
    object.x < bounds.x + bounds.width &&
    object.x + object.width > bounds.x &&
    object.y < bounds.y + bounds.height &&
    object.y + object.height > bounds.y
  );
}

function waitForCanvasPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function cropFrameExport(
  dataUrl: string,
  stage: HTMLElement,
  frame: BoardFrame,
  viewport: { x: number; y: number; scale: number }
): Promise<string> {
  const image = await loadImage(dataUrl);
  const pixelRatio = image.width / stage.clientWidth;
  const world = stage.querySelector<HTMLElement>(".canvas-world");
  const worldOffsetX = world?.offsetLeft ?? 0;
  const worldOffsetY = world?.offsetTop ?? 0;
  const titleMargin = 42;
  const edgeMargin = 18;
  const left = worldOffsetX + viewport.x + frame.x * viewport.scale - edgeMargin;
  const top = worldOffsetY + viewport.y + frame.y * viewport.scale - titleMargin;
  const width = frame.width * viewport.scale + edgeMargin * 2;
  const height = frame.height * viewport.scale + titleMargin + edgeMargin;
  const sourceX = Math.max(0, Math.round(left * pixelRatio));
  const sourceY = Math.max(0, Math.round(top * pixelRatio));
  const sourceWidth = Math.min(image.width - sourceX, Math.round(width * pixelRatio));
  const sourceHeight = Math.min(image.height - sourceY, Math.round(height * pixelRatio));
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare the frame export.");
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  return canvas.toDataURL("image/png");
}

async function drawExportConnectors(
  dataUrl: string,
  stage: HTMLElement,
  objects: CanvasObject[],
  viewport: { x: number; y: number; scale: number }
): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to draw export connectors.");
  }

  context.drawImage(image, 0, 0);
  const pixelRatio = image.width / stage.clientWidth;
  const world = stage.querySelector<HTMLElement>(".canvas-world");
  const worldOffset = { x: world?.offsetLeft ?? 0, y: world?.offsetTop ?? 0 };
  for (const connector of objects) {
    if (connector.type === "connector" && connector.connection) {
      drawExportConnector(context, connector, objects, viewport, worldOffset, pixelRatio);
    }
  }
  return canvas.toDataURL("image/png");
}

function drawExportConnector(
  context: CanvasRenderingContext2D,
  connector: CanvasObject,
  objects: CanvasObject[],
  viewport: { x: number; y: number; scale: number },
  worldOffset: Point,
  pixelRatio: number
) {
  const connection = connector.connection;
  if (!connection) {
    return;
  }
  const source = objects.find((object) => object.id === connection.sourceObjectId);
  const target = objects.find((object) => object.id === connection.targetObjectId);
  if (!source || !target) {
    return;
  }

  const sourceSide = connection.sourceSide ?? bestSideForTarget(source, target);
  const targetSide = connection.targetSide ?? bestSideForTarget(target, source);
  const route = connection.route ?? "straight";
  const points = connectorLinkPoints(source, target, sourceSide, targetSide);
  const project = (point: Point): Point => ({
    x: (worldOffset.x + viewport.x + point.x * viewport.scale) * pixelRatio,
    y: (worldOffset.y + viewport.y + point.y * viewport.scale) * pixelRatio
  });
  const start = project(points.source);
  const end = project(points.target);
  const strokeWidth = connectorStrokeWidth(connector) * viewport.scale * pixelRatio;
  const markerSize = Math.max(8, strokeWidth * 2.8);

  context.save();
  context.strokeStyle = connector.style.stroke;
  context.fillStyle = connector.style.stroke;
  context.lineWidth = strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);

  let startTangent = { x: end.x - start.x, y: end.y - start.y };
  let endTangent = { ...startTangent };
  if (route === "elbow") {
    const stubLength = 48;
    const sourceStub = project(offsetPointForSide(points.source, sourceSide, stubLength));
    const targetStub = project(offsetPointForSide(points.target, targetSide, stubLength));
    context.lineTo(sourceStub.x, sourceStub.y);
    if (sourceSide === "top" || sourceSide === "bottom") {
      const midY = Math.round((sourceStub.y + targetStub.y) / 2);
      context.lineTo(sourceStub.x, midY);
      context.lineTo(targetStub.x, midY);
    } else {
      const midX = Math.round((sourceStub.x + targetStub.x) / 2);
      context.lineTo(midX, sourceStub.y);
      context.lineTo(midX, targetStub.y);
    }
    context.lineTo(targetStub.x, targetStub.y);
    context.lineTo(end.x, end.y);
    startTangent = { x: sourceStub.x - start.x, y: sourceStub.y - start.y };
    endTangent = { x: end.x - targetStub.x, y: end.y - targetStub.y };
  } else if (route === "curved") {
    const controlDistance = Math.max(56, Math.min(180, distance(points.source, points.target) / 2));
    const sourceControl = project(controlPointForSide(points.source, sourceSide, controlDistance));
    const targetControl = project(controlPointForSide(points.target, targetSide, controlDistance));
    context.bezierCurveTo(sourceControl.x, sourceControl.y, targetControl.x, targetControl.y, end.x, end.y);
    startTangent = { x: sourceControl.x - start.x, y: sourceControl.y - start.y };
    endTangent = { x: end.x - targetControl.x, y: end.y - targetControl.y };
  } else {
    context.lineTo(end.x, end.y);
  }
  context.stroke();

  if (connectionMarkerOrDefault(connection.markerStart, "none") === "arrow") {
    drawExportArrowhead(context, start, { x: -startTangent.x, y: -startTangent.y }, markerSize);
  }
  if (connectionMarkerOrDefault(connection.markerEnd, "arrow") === "arrow") {
    drawExportArrowhead(context, end, endTangent, markerSize);
  }
  context.restore();
}

function drawExportArrowhead(context: CanvasRenderingContext2D, tip: Point, direction: Point, size: number) {
  const angle = Math.atan2(direction.y, direction.x);
  const backLeft = {
    x: tip.x - size * Math.cos(angle - Math.PI / 6),
    y: tip.y - size * Math.sin(angle - Math.PI / 6)
  };
  const backRight = {
    x: tip.x - size * Math.cos(angle + Math.PI / 6),
    y: tip.y - size * Math.sin(angle + Math.PI / 6)
  };
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(backLeft.x, backLeft.y);
  context.lineTo(backRight.x, backRight.y);
  context.closePath();
  context.fill();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to prepare the frame export."));
    image.src = src;
  });
}

function exportFilename(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "dryerase-export";
}

function capturePointer(element: HTMLElement, pointerId: number) {
  try {
    if (!element.hasPointerCapture(pointerId)) {
      element.setPointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can fail if the browser has already retired the pointer.
  }
}

function releasePointer(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Losing capture during a drag should not bring down the whiteboard.
  }
}

function resizeObjectBounds(
  resize: {
    corner: ResizeCorner;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
    aspectRatio: number;
  },
  deltaX: number,
  deltaY: number,
  preserveAspectRatio: boolean,
  minimum = preserveAspectRatio ? 80 : 160
) {
  const opposite = oppositeCornerPoint(resize);
  let width = resize.originWidth;
  let height = resize.originHeight;

  if (resize.corner.includes("e")) {
    width = resize.originWidth + deltaX;
  }
  if (resize.corner.includes("w")) {
    width = resize.originWidth - deltaX;
  }
  if (resize.corner.includes("s")) {
    height = resize.originHeight + deltaY;
  }
  if (resize.corner.includes("n")) {
    height = resize.originHeight - deltaY;
  }

  width = Math.max(minimum, width);
  height = Math.max(minimum, height);

  if (preserveAspectRatio && Number.isFinite(resize.aspectRatio) && resize.aspectRatio > 0) {
    const widthDelta = Math.abs(width - resize.originWidth);
    const heightDelta = Math.abs(height - resize.originHeight);
    if (widthDelta >= heightDelta) {
      height = width / resize.aspectRatio;
    } else {
      width = height * resize.aspectRatio;
    }
  }

  return boundsFromOppositeCorner(resize.corner, opposite, Math.round(width), Math.round(height));
}

function oppositeCornerPoint(resize: {
  corner: ResizeCorner;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
}): Point {
  switch (resize.corner) {
    case "nw":
      return { x: resize.originX + resize.originWidth, y: resize.originY + resize.originHeight };
    case "ne":
      return { x: resize.originX, y: resize.originY + resize.originHeight };
    case "se":
      return { x: resize.originX, y: resize.originY };
    case "sw":
      return { x: resize.originX + resize.originWidth, y: resize.originY };
  }
}

function boundsFromOppositeCorner(corner: ResizeCorner, opposite: Point, width: number, height: number) {
  switch (corner) {
    case "nw":
      return { x: opposite.x - width, y: opposite.y - height, width, height };
    case "ne":
      return { x: opposite.x, y: opposite.y - height, width, height };
    case "se":
      return { x: opposite.x, y: opposite.y, width, height };
    case "sw":
      return { x: opposite.x - width, y: opposite.y, width, height };
  }
}

function resizeFrameBounds(
  resize: {
    corner: ResizeCorner;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
  },
  deltaX: number,
  deltaY: number
) {
  const opposite = oppositeCornerPoint(resize);
  let width = resize.originWidth;
  let height = resize.originHeight;

  if (resize.corner.includes("e")) {
    width = resize.originWidth + deltaX;
  }
  if (resize.corner.includes("w")) {
    width = resize.originWidth - deltaX;
  }
  if (resize.corner.includes("s")) {
    height = resize.originHeight + deltaY;
  }
  if (resize.corner.includes("n")) {
    height = resize.originHeight - deltaY;
  }

  return boundsFromOppositeCorner(
    resize.corner,
    opposite,
    Math.max(MIN_FRAME_WIDTH, Math.round(width)),
    Math.max(MIN_FRAME_HEIGHT, Math.round(height))
  );
}

function updateObjectBoundsAndLinkedConnectors(
  objects: CanvasObject[],
  objectId: string,
  bounds: { x: number; y: number; width: number; height: number }
): CanvasObject[] {
  const resizedObjects = objects.map((object) => (object.id === objectId ? { ...object, ...bounds } : object));
  return recomputeLinkedConnectors(resizedObjects, objectId);
}

function moveObjectsAndLinkedConnectors(
  objects: CanvasObject[],
  origins: Array<{ id: string; x: number; y: number }>,
  deltaX: number,
  deltaY: number
): CanvasObject[] {
  const originById = new Map(origins.map((origin) => [origin.id, origin]));
  const movedObjects = objects.map((object) => {
    const origin = originById.get(object.id);
    return origin ? { ...object, x: origin.x + deltaX, y: origin.y + deltaY } : object;
  });
  return recomputeLinkedConnectorsForObjects(movedObjects, new Set(originById.keys()));
}

function recomputeLinkedConnectors(objects: CanvasObject[], objectId: string): CanvasObject[] {
  return recomputeLinkedConnectorsForObjects(objects, new Set([objectId]));
}

function recomputeLinkedConnectorsForObjects(objects: CanvasObject[], objectIds: Set<string>): CanvasObject[] {
  return objects.map((object) => {
    if (
      object.type !== "connector" ||
      !object.connection ||
      (!objectIds.has(object.connection.sourceObjectId) && !objectIds.has(object.connection.targetObjectId))
    ) {
      return object;
    }

    const source = objects.find((item) => item.id === object.connection?.sourceObjectId);
    const target = objects.find((item) => item.id === object.connection?.targetObjectId);
    if (!source || !target) {
      return object;
    }

    return {
      ...object,
      ...connectorGeometry(source, target, object.connection.sourceSide, object.connection.targetSide, object.connection.route)
    };
  });
}

function connectorPathForObject(object: CanvasObject, objects: CanvasObject[]) {
  if (object.type !== "connector" || !object.connection) {
    return null;
  }

  const source = objects.find((item) => item.id === object.connection?.sourceObjectId);
  const target = objects.find((item) => item.id === object.connection?.targetObjectId);
  if (!source || !target) {
    return null;
  }

  const sourceSide = object.connection.sourceSide ?? bestSideForTarget(source, target);
  const targetSide = object.connection.targetSide ?? bestSideForTarget(target, source);
  const route = object.connection.route ?? "straight";
  const points = connectorLinkPoints(source, target, sourceSide, targetSide);
  return connectorPathGeometryFromPoints(
    points.source,
    points.target,
    route,
    sourceSide,
    targetSide
  );
}

function ConnectorPreview({ draft }: { draft: LinkDraft }) {
  const geometry = connectorPathGeometryFromPoints(draft.start, draft.current, "straight");
  const style = {
    left: geometry.bounds.x,
    top: geometry.bounds.y,
    width: geometry.bounds.width,
    height: geometry.bounds.height,
    "--object-stroke": "#0ea5e9",
    "--connector-stroke-width": "5px",
    "--connector-arrow-length": "17px",
    "--connector-arrow-half": "11px"
  } as CSSProperties;

  return (
    <article
      className="canvas-object connector-object connector-preview connector-end-arrow"
      style={style}
      aria-hidden="true"
    >
      <ConnectorSvg
        path={geometry.path}
        width={geometry.bounds.width}
        height={geometry.bounds.height}
        markerEnd="arrow"
        markerStart="none"
      />
    </article>
  );
}

function InkPreview({ draft, color, width }: { draft: InkDraft; color: string; width: number }) {
  const bounds = strokeBounds(draft.points, width);
  return (
    <article
      className="canvas-object stroke-object ink-preview"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      aria-hidden="true"
    >
      <StrokeSvg points={draft.points} origin={bounds} color={color} width={width} />
    </article>
  );
}

function SelectionMarquee({ draft }: { draft: SelectionDraft }) {
  const bounds = normalizedSelectionBounds(draft.start, draft.end);
  return (
    <div
      className="selection-marquee"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
    />
  );
}

function StrokeSvg({
  points,
  origin,
  color,
  width
}: {
  points: Point[];
  origin: { x: number; y: number; width: number; height: number };
  color: string;
  width: number;
}) {
  const path = points.map((point) => `${point.x - origin.x},${point.y - origin.y}`).join(" ");
  return (
    <svg className="stroke-svg" viewBox={`0 0 ${origin.width} ${origin.height}`} aria-hidden="true">
      <polyline points={path} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConnectorSvg({
  object,
  path,
  width,
  height,
  markerStart,
  markerEnd
}: {
  object?: CanvasObject;
  path: string;
  width: number;
  height: number;
  markerStart?: CanvasConnectorMarker;
  markerEnd?: CanvasConnectorMarker;
}) {
  const markerId = object?.id ?? "preview";
  const startMarker = markerStart ?? connectionMarkerOrDefault(object?.connection?.markerStart, "none");
  const endMarker = markerEnd ?? connectionMarkerOrDefault(object?.connection?.markerEnd, "arrow");
  const stroke = object?.style.stroke ?? "#0ea5e9";
  const strokeWidth = object ? connectorStrokeWidth(object) : 5;
  const markerSize = Math.max(8, strokeWidth * 2.8);

  return (
    <svg
      className="connector-svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id={`connector-arrow-start-${markerId}`}
          viewBox="0 0 10 10"
          refX="1.5"
          refY="5"
          markerWidth={markerSize}
          markerHeight={markerSize}
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 10 0 L 0 5 L 10 10 z" fill={stroke} />
        </marker>
        <marker
          id={`connector-arrow-end-${markerId}`}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth={markerSize}
          markerHeight={markerSize}
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>
      <path
        className="connector-path"
        d={path}
        stroke={stroke}
        strokeWidth={strokeWidth}
        markerStart={startMarker === "arrow" ? `url(#connector-arrow-start-${markerId})` : undefined}
        markerEnd={endMarker === "arrow" ? `url(#connector-arrow-end-${markerId})` : undefined}
      />
    </svg>
  );
}

function CanvasObjectView({
  object,
  selected,
  resizable,
  connecting,
  linkTargetSide,
  showLinkHandles,
  onLinkHandlePointerDown,
  onLinkHandlePointerMove,
  onLinkHandlePointerUp,
  onResizeHandlePointerDown,
  onResizeHandlePointerMove,
  onResizeHandlePointerUp,
  editing,
  editingContent,
  onStartEditing,
  onEditingContentChange,
  onCommitEditing,
  onCancelEditing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  assetUrl,
  objects
}: {
  object: CanvasObject;
  selected: boolean;
  resizable: boolean;
  connecting: boolean;
  linkTargetSide: CanvasLinkSide | null;
  showLinkHandles: boolean;
  onLinkHandlePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    object: CanvasObject,
    side: CanvasLinkSide
  ) => void;
  onLinkHandlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onLinkHandlePointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeHandlePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    object: CanvasObject,
    corner: ResizeCorner
  ) => void;
  onResizeHandlePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeHandlePointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  editing: boolean;
  editingContent: string;
  onStartEditing: (object: CanvasObject) => void;
  onEditingContentChange: (content: string) => void;
  onCommitEditing: () => void;
  onCancelEditing: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, object: CanvasObject) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  assetUrl: string | null;
  objects: CanvasObject[];
}) {
  const connectorPath = connectorPathForObject(object, objects);
  const renderBounds = connectorPath?.bounds ?? object;
  const style = {
    left: renderBounds.x,
    top: renderBounds.y,
    width: renderBounds.width,
    height: renderBounds.height,
    zIndex: selected ? 1000 : 20 + object.zIndex,
    "--object-fill": object.style.fill,
    "--object-stroke": object.style.stroke,
    "--object-border-width": object.style.strokeVisible === false ? "0px" : "2px",
    "--object-text": object.style.textColor,
    "--connector-stroke-width": `${connectorStrokeWidth(object)}px`,
    "--connector-arrow-length": `${Math.max(12, connectorStrokeWidth(object) * 3.4)}px`,
    "--connector-arrow-half": `${Math.max(7, connectorStrokeWidth(object) * 2.2)}px`,
    transform: object.type === "connector" ? "none" : `rotate(${object.rotation}deg)`
  } as CSSProperties;

  if (object.type === "connector") {
    return (
      <article
        className={["canvas-object", "connector-object", connectorMarkerClass(object), selected ? "selected" : ""]
          .filter(Boolean)
          .join(" ")}
        data-object-id={object.id}
        style={style}
        onPointerDown={(event) => onPointerDown(event, object)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {connectorPath ? (
          <ConnectorSvg
            object={object}
            path={connectorPath.path}
            width={connectorPath.bounds.width}
            height={connectorPath.bounds.height}
          />
        ) : (
          <span />
        )}
      </article>
    );
  }

  if (object.type === "stroke") {
    return (
      <article
        className={`canvas-object stroke-object ${selected ? "selected" : ""}`}
        data-object-id={object.id}
        style={style}
        onPointerDown={(event) => onPointerDown(event, object)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <StrokeSvg
          points={object.strokePoints}
          origin={object}
          color={object.style.stroke}
          width={connectorStrokeWidth(object)}
        />
      </article>
    );
  }

  if (object.type === "image") {
    return (
      <article
        className={`canvas-object image-object ${selected ? "selected" : ""} ${connecting ? "connecting" : ""}`}
        data-object-id={object.id}
        style={style}
        onPointerDown={(event) => onPointerDown(event, object)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {assetUrl ? <img src={assetUrl} alt={object.content || "Imported image"} draggable={false} /> : null}
        {showLinkHandles ? (
          <LinkHandles
            object={object}
            activeSide={linkTargetSide}
            onPointerDown={onLinkHandlePointerDown}
            onPointerMove={onLinkHandlePointerMove}
            onPointerUp={onLinkHandlePointerUp}
          />
        ) : null}
        {selected && resizable ? (
          <ResizeHandles
            object={object}
            onPointerDown={onResizeHandlePointerDown}
            onPointerMove={onResizeHandlePointerMove}
            onPointerUp={onResizeHandlePointerUp}
          />
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={`canvas-object ${object.type}-object ${selected ? "selected" : ""} ${connecting ? "connecting" : ""}`}
      data-object-id={object.id}
      style={style}
      onPointerDown={(event) => onPointerDown(event, object)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onStartEditing(object)}
    >
      {object.type === "icon" ? <BoardIcon iconKey={object.content} /> : object.type === "prompt" ? (
        <>
          <div className="prompt-card-header">
            <Sparkles size={16} aria-hidden="true" />
            <span>Prompt</span>
          </div>
          {editing ? (
            <ObjectEditor
              object={object}
              value={editingContent}
              onChange={onEditingContentChange}
              onCommit={onCommitEditing}
              onCancel={onCancelEditing}
            />
          ) : object.content ? (
            <p>{object.content}</p>
          ) : null}
        </>
      ) : editing && object.type === "diamond" ? (
        <div className="diamond-content">
          <ObjectEditor
            object={object}
            value={editingContent}
            onChange={onEditingContentChange}
            onCommit={onCommitEditing}
            onCancel={onCancelEditing}
          />
        </div>
      ) : editing ? (
        <ObjectEditor
          object={object}
          value={editingContent}
          onChange={onEditingContentChange}
          onCommit={onCommitEditing}
          onCancel={onCancelEditing}
        />
      ) : object.type === "diamond" ? (
        <div className="diamond-content">{object.content ? <p>{object.content}</p> : null}</div>
      ) : object.content ? (
        <p>{object.content}</p>
      ) : null}
      {showLinkHandles ? (
        <LinkHandles
          object={object}
          activeSide={linkTargetSide}
          onPointerDown={onLinkHandlePointerDown}
          onPointerMove={onLinkHandlePointerMove}
          onPointerUp={onLinkHandlePointerUp}
        />
      ) : null}
      {selected && resizable ? (
        <ResizeHandles
          object={object}
          onPointerDown={onResizeHandlePointerDown}
          onPointerMove={onResizeHandlePointerMove}
          onPointerUp={onResizeHandlePointerUp}
        />
      ) : null}
    </article>
  );
}

function ObjectEditor({
  object,
  value,
  onChange,
  onCommit,
  onCancel
}: {
  object: CanvasObject;
  value: string;
  onChange: (content: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <textarea
      className="object-editor"
      value={value}
      autoFocus
      aria-label={`${object.type} annotation`}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit();
        }
      }}
    />
  );
}

function LinkHandles({
  object,
  activeSide,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  object: CanvasObject;
  activeSide: CanvasLinkSide | null;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, object: CanvasObject, side: CanvasLinkSide) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const sides: CanvasLinkSide[] = ["top", "right", "bottom", "left"];
  return (
    <div className="link-handles">
      {sides.map((side) => (
        <button
          type="button"
          key={side}
          className={`link-handle ${side} ${side === activeSide ? "active" : ""}`}
          title={`Link from ${side}`}
          aria-label={`Link from ${side}`}
          onPointerDown={(event) => onPointerDown(event, object, side)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ))}
    </div>
  );
}

function ResizeHandles({
  object,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  object: CanvasObject;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, object: CanvasObject, corner: ResizeCorner) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const corners: ResizeCorner[] = ["nw", "ne", "se", "sw"];
  return (
    <div className="resize-handles">
      {corners.map((corner) => (
        <button
          type="button"
          key={corner}
          className={`resize-handle ${corner}`}
          title={`Resize ${corner}`}
          aria-label={`Resize ${corner}`}
          onPointerDown={(event) => onPointerDown(event, object, corner)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ))}
    </div>
  );
}

function FrameResizeHandles({
  frame,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  frame: BoardFrame;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, frame: BoardFrame, corner: ResizeCorner) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const corners: ResizeCorner[] = ["nw", "ne", "se", "sw"];
  return (
    <div className="frame-resize-handles">
      {corners.map((corner) => (
        <button
          type="button"
          key={corner}
          className={`resize-handle ${corner}`}
          title={`Resize frame ${corner}`}
          aria-label={`Resize frame ${corner}`}
          onPointerDown={(event) => onPointerDown(event, frame, corner)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ))}
    </div>
  );
}
