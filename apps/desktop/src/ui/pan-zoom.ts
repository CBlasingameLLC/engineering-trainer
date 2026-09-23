import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Wheel-zoom and drag-pan over an SVG viewBox.
 *
 * Both the skill tree and the Circuit Lab want the interaction a game map has:
 * the wheel zooms about the cursor, dragging moves the world, and nothing ever
 * grows a scrollbar. A scrolled canvas is the wrong model for a graph — it
 * couples how much you can see to the size of the window, and it cannot zoom
 * out to show the shape of the thing, which for a prerequisite DAG is the only
 * view that answers "what is blocking what".
 *
 * The viewBox is the whole state. Panning changes its origin, zooming changes
 * its extent, and the SVG's own coordinate system does the rest — so hit
 * testing, edge routing and text all stay in world units and no code outside
 * this hook has to know the view has moved.
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanZoomOptions {
  /** World-space extent of the content, used by `fit` and to bound zoom. */
  content: Bounds;
  /** World units of margin left around the content when fitting. */
  padding?: number;
  /** How far in and out of the fitted view zooming may go. */
  minScale?: number;
  maxScale?: number;
}

export interface PanZoom {
  viewBox: string;
  view: ViewBox;
  scale: number;
  isPanning: boolean;
  /** Attach to the element that owns the viewBox. */
  ref: React.RefObject<SVGSVGElement | null>;
  /** Start a drag-pan from a pointer event; the caller decides which button pans. */
  beginPan: (event: React.PointerEvent) => void;
  /** Client coordinates to world coordinates, for hit testing and placement. */
  toWorld: (event: { clientX: number; clientY: number }) => { x: number; y: number };
  zoomBy: (factor: number, about?: { clientX: number; clientY: number }) => void;
  fit: () => void;
}

const fitView = (content: Bounds, padding: number): ViewBox => ({
  x: content.minX - padding,
  y: content.minY - padding,
  w: Math.max(1, content.maxX - content.minX + padding * 2),
  h: Math.max(1, content.maxY - content.minY + padding * 2),
});

export function usePanZoom({
  content,
  padding = 40,
  minScale = 0.2,
  maxScale = 6,
}: PanZoomOptions): PanZoom {
  const ref = useRef<SVGSVGElement | null>(null);
  const base = useMemo(() => fitView(content, padding), [content, padding]);
  const [view, setView] = useState<ViewBox>(base);
  const [isPanning, setIsPanning] = useState(false);

  // A drag needs the view as it was when the pointer went down. Reading it
  // through `setView` would be a side effect inside a reducer, which StrictMode
  // runs twice; a mirror ref is the honest way to read current state.
  const viewRef = useRef(view);
  viewRef.current = view;

  // Re-fit when the content changes shape — a course filter that swaps 82 nodes
  // for 23 should not leave the camera pointed at empty space. Keyed on the
  // fitted box rather than on `base`, so a re-render that produces an equal box
  // does not yank the camera back from wherever the person panned it.
  const signature = `${base.x},${base.y},${base.w},${base.h}`;
  const fitted = useRef(signature);
  useEffect(() => {
    if (fitted.current === signature) return;
    fitted.current = signature;
    setView(base);
  }, [signature, base]);

  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: view.x + ((event.clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((event.clientY - rect.top) / rect.height) * view.h,
      };
    },
    [view],
  );

  const zoomBy = useCallback(
    (factor: number, about?: { clientX: number; clientY: number }) => {
      setView((current) => {
        const rect = ref.current?.getBoundingClientRect();
        // Clamp against the fitted width so the limits mean the same thing at
        // every content size, then re-derive the factor actually applied.
        const wanted = current.w / factor;
        const next = Math.min(base.w / minScale, Math.max(base.w / maxScale, wanted));
        const applied = current.w / next;
        const height = current.h / applied;

        const fx = rect && about ? (about.clientX - rect.left) / rect.width : 0.5;
        const fy = rect && about ? (about.clientY - rect.top) / rect.height : 0.5;
        const worldX = current.x + fx * current.w;
        const worldY = current.y + fy * current.h;

        return { x: worldX - fx * next, y: worldY - fy * height, w: next, h: height };
      });
    },
    [base.w, minScale, maxScale],
  );

  // React attaches `onWheel` passively at the root, so preventDefault there is
  // ignored and the page scrolls behind the canvas. The listener has to be
  // registered on the element with `passive: false`.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0016), event);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const beginPan = useCallback((event: React.PointerEvent) => {
    const element = ref.current;
    const rect = element?.getBoundingClientRect();
    if (!element || !rect || rect.width === 0) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const from = viewRef.current;

    // Deliberately no `setPointerCapture`. Capturing retargets the subsequent
    // `click` to the capture element, so every node in the graph became
    // unclickable the moment the SVG started a pan on pointerdown. Window
    // listeners give the same "keep dragging outside the element" behaviour
    // without touching event targeting.
    let panning = false;

    const move = (e: PointerEvent): void => {
      // A pan only begins once the pointer has actually travelled, so a click
      // that wobbles by a pixel still reaches whatever is under it.
      if (!panning && Math.hypot(e.clientX - startX, e.clientY - startY) <= 3) return;
      if (!panning) {
        panning = true;
        setIsPanning(true);
      }
      setView({
        x: from.x - ((e.clientX - startX) / rect.width) * from.w,
        y: from.y - ((e.clientY - startY) / rect.height) * from.h,
        w: from.w,
        h: from.h,
      });
    };
    const done = (): void => {
      setIsPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  }, []);

  const fit = useCallback(() => setView(base), [base]);

  return {
    ref,
    view,
    viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    scale: base.w / view.w,
    isPanning,
    beginPan,
    toWorld,
    zoomBy,
    fit,
  };
}
