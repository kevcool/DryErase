import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type FrameBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const minScale = 0.25;
const maxScale = 2.5;
const defaultViewport: Viewport = {
  x: 0,
  y: 0,
  scale: 0.82
};

function clampScale(scale: number): number {
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function useCanvasViewport(activeTool: string) {
  const stageRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );
  const [viewport, setViewport] = useState<Viewport>(defaultViewport);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const canPan = activeTool === "pan" || isSpacePanning;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" && !isEditableTarget(event.target)) {
        event.preventDefault();
        setIsSpacePanning(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        resetView();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "+") {
        event.preventDefault();
        zoomBy(1.15);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        zoomBy(1 / 1.15);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const setStageRef = useCallback((node: HTMLElement | null) => {
    stageRef.current = node;
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setViewport((current) => ({
      ...current,
      scale: clampScale(current.scale * factor)
    }));
  }, []);

  const resetView = useCallback(() => {
    setViewport(defaultViewport);
  }, []);

  const viewportForFrame = useCallback((frame: FrameBounds = { x: 0, y: 0, width: 1180, height: 820 }): Viewport => {
    const stage = stageRef.current;
    if (!stage) {
      return defaultViewport;
    }

    const rect = stage.getBoundingClientRect();
    const scale = clampScale(Math.min((rect.width - 96) / frame.width, (rect.height - 96) / frame.height));
    const world = stage.querySelector<HTMLElement>(".canvas-world");
    return {
      scale,
      x: (rect.width - frame.width * scale) / 2 - frame.x * scale - (world?.offsetLeft ?? 0),
      y: (rect.height - frame.height * scale) / 2 - frame.y * scale - (world?.offsetTop ?? 0)
    };
  }, []);

  const fitToFrame = useCallback((frame: FrameBounds = { x: 0, y: 0, width: 1180, height: 820 }) => {
    setViewport(viewportForFrame(frame));
  }, [viewportForFrame]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      setViewport((current) => ({
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY
      }));
      return;
    }

    const rect = stage.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;

    setViewport((current) => {
      const nextScale = clampScale(current.scale * zoomFactor);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale
      };
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const touchPanningWithPenActive = activeTool === "pen" && event.pointerType === "touch";
      const middleMousePanning = event.button === 1;
      if (
        (!canPan && !touchPanningWithPenActive && !middleMousePanning) ||
        (!middleMousePanning && event.button !== 0) ||
        (!canPan && !touchPanningWithPenActive && !middleMousePanning && !isEmptyCanvasPointerTarget(event))
      ) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewport.x,
        originY: viewport.y
      };
      setIsPanning(true);
    },
    [activeTool, canPan, viewport.x, viewport.y]
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setViewport((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }));
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    viewport,
    setViewport,
    viewportForFrame,
    canPan,
    isPanning,
    setStageRef,
    zoomIn: () => zoomBy(1.15),
    zoomOut: () => zoomBy(1 / 1.15),
    resetView,
    fitToFrame,
    stageHandlers: {
      onWheel: handleWheel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    }
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isEmptyCanvasPointerTarget(event: ReactPointerEvent<HTMLElement>): boolean {
  const target = event.target;
  return target instanceof HTMLElement && (target === event.currentTarget || target.classList.contains("canvas-world"));
}
