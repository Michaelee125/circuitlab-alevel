import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { componentAt, componentTerminals, getDesignators, moveWireSegment, terminalAt, wireAt, wirePolyline, wireSegmentsForEditing } from '@circuitlab/circuit-core';
import type { Point } from '@circuitlab/circuit-core';
import { CircuitRenderer } from '@circuitlab/circuit-renderer';
import { Button, IconButton, Segmented } from '@circuitlab/ui';
import { componentName, t } from '@circuitlab/i18n';
import { getExperiment } from '@circuitlab/teaching-engine';
import { getReducedMotion, useCircuitStore, useSolution } from '../store';

interface Props {
  compact?: boolean;
  dockOpen?: boolean;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const length2 = vx * vx + vy * vy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / length2)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export function CircuitCanvas({ compact = false, dockOpen = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CircuitRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const dragRef = useRef<{ id: string; offset: Point; moved: boolean; start: Point } | null>(null);
  const wireDragRef = useRef<{ id: string; points: Point[]; segmentIndex: number; start: Point; moved: boolean } | null>(null);
  const panRef = useRef<{ start: Point; view: { x: number; y: number } } | null>(null);
  const pinchRef = useRef<{ distance: number; mid: Point } | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());

  const doc = useCircuitStore((s) => s.doc);
  const solution = useSolution();
  const view = useCircuitStore((s) => s.view);
  const viewport = useCircuitStore((s) => s.viewport);
  const viewMode = useCircuitStore((s) => s.viewMode);
  const theme = useCircuitStore((s) => s.theme);
  const quality = useCircuitStore((s) => s.quality);
  const language = useCircuitStore((s) => s.language);
  const selectionId = useCircuitStore((s) => s.selectionId);
  const selectedWireId = useCircuitStore((s) => s.selectedWireId);
  const wiringFrom = useCircuitStore((s) => s.wiringFrom);
  const highlightIds = useCircuitStore((s) => s.highlightIds);
  const showGrid = useCircuitStore((s) => s.showGrid);
  const showValues = useCircuitStore((s) => s.showValues);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const canUndo = useCircuitStore((s) => s.past.length > 0);
  const canRedo = useCircuitStore((s) => s.future.length > 0);

  const labels = useMemo(() => getDesignators(doc), [doc]);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const canvasInsets = useCircuitStore((s) => s.canvasInsets);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // ---- content insets -----------------------------------------------------
  // The canvas is full-bleed on phones; fit and value cards avoid the real
  // toolbar and tab-bar geometry (including notch safe areas and wrapping).
  const applyInsets = useCallback(() => {
    const host = hostRef.current?.getBoundingClientRect();
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    const tabbar = document.querySelector('.mobile-tabbar')?.getBoundingClientRect();
    const top = host && toolbar ? Math.max(0, toolbar.bottom - host.top + 12) : compact ? 118 : 0;
    const bottom =
      compact && host && tabbar ? Math.max(0, host.bottom - tabbar.top + 12) : 0;
    useCircuitStore.getState().setCanvasInsets({ top, bottom });
  }, [compact]);

  useEffect(() => {
    applyInsets();
    const raf = requestAnimationFrame(applyInsets);
    window.addEventListener('resize', applyInsets);
    const observer = toolbarRef.current ? new ResizeObserver(applyInsets) : null;
    if (observer && toolbarRef.current) observer.observe(toolbarRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', applyInsets);
      observer?.disconnect();
    };
  }, [applyInsets]);

  // ---- renderer lifecycle -------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const renderer = new CircuitRenderer();
    rendererRef.current = renderer;
    const rect = host.getBoundingClientRect();
    const initial = useCircuitStore.getState();
    renderer
      .init(canvas, Math.max(1, rect.width), Math.max(1, rect.height), initial.quality)
      .then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        renderer.setView(useCircuitStore.getState().view);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      renderer.resize(width, height);
      useCircuitStore.getState().setViewport(width, height);
    });
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !ready) return;
    renderer.setState({
      doc,
      solution,
      viewMode,
      theme,
      quality,
      selectedId: selectionId,
      selectedWireId,
      wiringFrom,
      highlightIds,
      showGrid,
      showValues,
      labels,
      reduceMotion: getReducedMotion(),
      contentInsets: canvasInsets,
    });
  }, [ready, doc, solution, viewMode, theme, quality, selectionId, selectedWireId, wiringFrom, highlightIds, showGrid, showValues, labels, canvasInsets]);

  useEffect(() => {
    rendererRef.current?.setView(view);
  }, [view, ready]);

  useEffect(() => {
    rendererRef.current?.setQuality(quality);
  }, [quality, ready]);

  // ---- pointer helpers ----------------------------------------------------
  const toLocal = useCallback((clientX: number, clientY: number): Point => {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const toWorld = useCallback((local: Point): Point => {
    const renderer = rendererRef.current;
    if (!renderer) return local;
    return renderer.screenToWorld(local.x, local.y);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rendererRef.current || !hostRef.current) return;
    hostRef.current.setPointerCapture(event.pointerId);
    const local = toLocal(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, local);

    if (pointersRef.current.size === 2) {
      const state = useCircuitStore.getState();
      if (dragRef.current) {
        state.endDrag();
        dragRef.current = null;
      }
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (pointersRef.current.size > 2) return;

    const world = toWorld(local);
    const state = useCircuitStore.getState();
    const terminal = terminalAt(doc, world, 20);
    if (terminal) {
      if (state.wiringFrom) {
        if (
          state.wiringFrom.componentId === terminal.componentId &&
          state.wiringFrom.terminalId === terminal.terminalId
        ) {
          state.setWiringFrom(null);
        } else {
          state.connect(state.wiringFrom, {
            componentId: terminal.componentId,
            terminalId: terminal.terminalId,
          });
        }
      } else {
        state.setWiringFrom({ componentId: terminal.componentId, terminalId: terminal.terminalId });
        state.select(terminal.componentId);
      }
      return;
    }

    const comp = componentAt(doc, world);
    if (comp) {
      if (state.wiringFrom) state.setWiringFrom(null);
      state.select(comp.id);
      state.beginDrag();
      dragRef.current = {
        id: comp.id,
        offset: { x: world.x - comp.x, y: world.y - comp.y },
        moved: false,
        start: world,
      };
      return;
    }

    if (state.wiringFrom) {
      state.setWiringFrom(null);
      return;
    }
    const wire = wireAt(doc, world, 12);
    if (wire) {
      state.selectWire(wire.id);
      const segments = wireSegmentsForEditing(doc, wire).filter((segment) => segment.movable);
      let nearest: { segmentIndex: number; distance: number } | null = null;
      for (const segment of segments) {
        const distance = distanceToSegment(world, segment.a, segment.b);
        if (!nearest || distance < nearest.distance) {
          nearest = { segmentIndex: segment.segmentIndex, distance };
        }
      }
      // A drag on a movable segment reshapes the route; a simple tap only
      // selects the wire.
      if (nearest && nearest.distance <= 16) {
        state.beginDrag();
        wireDragRef.current = {
          id: wire.id,
          points: wirePolyline(doc, wire),
          segmentIndex: nearest.segmentIndex,
          start: world,
          moved: false,
        };
      }
      return;
    }
    state.select(null);
    state.selectWire(null);
    panRef.current = { start: local, view: { x: view.x, y: view.y } };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const local = toLocal(event.clientX, event.clientY);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, local);

    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = distance / Math.max(1, pinchRef.current.distance);
      const state = useCircuitStore.getState();
      state.zoomAt(mid.x, mid.y, factor);
      state.panBy(mid.x - pinchRef.current.mid.x, mid.y - pinchRef.current.mid.y);
      pinchRef.current = { distance, mid };
      return;
    }

    const world = toWorld(local);
    if (dragRef.current) {
      const drag = dragRef.current;
      if (Math.hypot(world.x - drag.start.x, world.y - drag.start.y) > 3) drag.moved = true;
      useCircuitStore.getState().dragTo(drag.id, world.x - drag.offset.x, world.y - drag.offset.y);
      return;
    }
    if (wireDragRef.current) {
      const drag = wireDragRef.current;
      const delta = { x: world.x - drag.start.x, y: world.y - drag.start.y };
      if (Math.hypot(delta.x, delta.y) > 2) drag.moved = true;
      if (drag.moved) {
        // Snap to a fine 4 px grid so routes stay tidy during the drag.
        const snapped = { x: Math.round(delta.x / 4) * 4, y: Math.round(delta.y / 4) * 4 };
        const next = moveWireSegment(drag.points, drag.segmentIndex, snapped);
        if (next) useCircuitStore.getState().updateWireRoute(drag.id, next);
      }
      return;
    }
    if (panRef.current) {
      const dx = local.x - panRef.current.start.x;
      const dy = local.y - panRef.current.start.y;
      useCircuitStore.getState().setView({
        ...useCircuitStore.getState().view,
        x: panRef.current.view.x + dx,
        y: panRef.current.view.y + dy,
      });
      return;
    }

    const wiring = useCircuitStore.getState().wiringFrom;
    let pointer: Point | null = null;
    if (wiring) {
      const source = doc.components.find((c) => c.id === wiring.componentId);
      const start = source ? componentTerminals(source).find((t) => t.id === wiring.terminalId) : undefined;
      // Do not flash a guide line on a simple tap; only show it once the
      // finger has actually moved away from the terminal.
      if (start && Math.hypot(world.x - start.x, world.y - start.y) > 8) pointer = world;
    }
    renderer.setPointer(pointer);
    const hover = terminalAt(doc, world, 20);
    renderer.setHoverTerminal(
      hover ? { componentId: hover.componentId, terminalId: hover.terminalId } : null,
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (hostRef.current?.hasPointerCapture(event.pointerId)) {
      hostRef.current.releasePointerCapture(event.pointerId);
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const state = useCircuitStore.getState();
    if (dragRef.current) {
      const { moved, id } = dragRef.current;
      state.endDrag();
      dragRef.current = null;
      if (!moved && compact) {
        state.select(id);
        // Defer the sheet: the browser dispatches a synthetic click after a
        // touch tap, and opening the sheet synchronously would let that click
        // land on the new backdrop and close it again.
        window.setTimeout(() => {
          const current = useCircuitStore.getState();
          if (current.selectionId === id) {
            current.setRightTab('inspector');
            current.setSheet('inspector');
          }
        }, 90);
      }
    }
    if (wireDragRef.current) {
      useCircuitStore.getState().endDrag();
      wireDragRef.current = null;
    }
    panRef.current = null;
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setPointer(null);
      if (!state.wiringFrom) renderer.setHoverTerminal(null);
    }
  };

  // ---- wheel + keyboard ----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      useCircuitStore
        .getState()
        .zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0016));
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const state = useCircuitStore.getState();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectionId || state.selectedWireId) {
          event.preventDefault();
          state.deleteSelected();
        }
        return;
      }
      if (event.key.toLowerCase() === 'r' && !mod) {
        if (state.selectionId) state.rotateSelected();
        return;
      }
      if (event.key === 'Escape') {
        state.setWiringFrom(null);
        state.select(null);
        return;
      }
      if (event.key.toLowerCase() === 'f' && !mod) state.fitView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const empty = doc.components.length === 0;

  if (failed) {
    return (
      <div className="canvas-host" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="canvas-empty-card" style={{ pointerEvents: 'auto' }}>
          <h3>WebGL is not available</h3>
          <p>
            CircuitLab renders the canvas with WebGL. Enable hardware acceleration or try a recent
            Chrome, Edge, Safari or Firefox. The physics engine and explanations still work.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={hostRef}
        className="canvas-host"
        style={{ top: 0, bottom: compact ? 0 : dockOpen ? 346 : 0 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label="Circuit canvas"
      >
        <canvas ref={canvasRef} />
      </div>

      <div className="stage-overlay-top" ref={toolbarRef}>
        <div className="tool-strip">
          <Segmented
            value={viewMode}
            ariaLabel={t(language, 'view.schematic')}
            onChange={(value) => useCircuitStore.getState().setViewMode(value)}
            options={[
              { id: 'schematic', label: t(language, 'view.schematic'), title: t(language, 'view.schematic') },
              { id: 'realistic', label: t(language, 'view.realistic'), title: t(language, 'view.realistic') },
            ]}
          />
          <div style={{ width: 3 }} />
          <Button
            size="sm"
            variant="subtle"
            icon="tag"
            aria-label={t(language, 'settings.values')}
            aria-pressed={showValues}
            title={t(language, 'settings.valuesHint')}
            className={`values-btn ${showValues ? 'is-active' : ''}`}
            onClick={() => useCircuitStore.getState().toggleValues()}
          >
            <span className="canvas-values-label">{t(language, 'settings.valuesShort')}</span>
          </Button>
        </div>

        <div className="toolbar-spacer" style={{ flex: 1 }} />

        <div className="tool-strip">
          <IconButton
            icon="undo"
            label={t(language, 'action.undo')}
            onClick={() => useCircuitStore.getState().undo()}
            disabled={!canUndo}
          />
          <IconButton
            icon="redo"
            label={t(language, 'action.redo')}
            onClick={() => useCircuitStore.getState().redo()}
            disabled={!canRedo}
          />
          {!compact && (
            <IconButton
              icon="rotate"
              label={t(language, 'action.rotate')}
              onClick={() => useCircuitStore.getState().rotateSelected()}
              disabled={!selectionId}
            />
          )}
          <IconButton
            icon="trash"
            label={t(language, 'action.delete')}
            tone="danger"
            onClick={() => useCircuitStore.getState().deleteSelected()}
            disabled={!selectionId && !selectedWireId}
          />
          <IconButton
            icon="grid"
            label={t(language, 'action.autoLayout')}
            onClick={() => useCircuitStore.getState().autoArrange()}
          />
          <IconButton
            icon="fit"
            label={t(language, 'action.fit')}
            onClick={() => useCircuitStore.getState().fitView()}
          />
        </div>
      </div>

      {wiringFrom && (
        <div style={{ position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)', zIndex: 6 }}>
          <div className="tool-strip" style={{ padding: '6px 8px 6px 12px', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--accent)' }}>
              {t(language, 'canvas.connectHint')}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon="x"
              onClick={() => useCircuitStore.getState().setWiringFrom(null)}
            >
              {t(language, 'action.cancel')}
            </Button>
          </div>
        </div>
      )}

      {empty && (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <div className="empty-icon" style={{ margin: '0 auto 10px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h4l2 4h4l2-4h4" />
                <path d="M4 18h4l2-4h4l2 4h4" />
              </svg>
            </div>
            <h3>{t(language, 'canvas.emptyTitle')}</h3>
            <p>{t(language, 'canvas.emptyHint')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" icon="zap" onClick={() => useCircuitStore.getState().addComponent('cell')}>
                {componentName(language, 'cell')}
              </Button>
              <Button size="sm" icon="plus" onClick={() => useCircuitStore.getState().addComponent('resistor')}>
                {componentName(language, 'resistor')}
              </Button>
              <Button size="sm" icon="plus" onClick={() => useCircuitStore.getState().addComponent('ldr')}>
                {componentName(language, 'ldr')}
              </Button>
              <Button size="sm" variant="ghost" icon="flask" onClick={() => useCircuitStore.getState().setSheet('experiments')}>
                {t(language, 'experiments.library')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!compact && (
        <div className="stage-overlay-bottom" style={{ bottom: dockOpen ? 346 : 12 }}>
          <div className="canvas-hint">
            {experiment
              ? `${experiment.title.en} — ${experiment.subtitle.en}`
              : t(language, 'canvas.hint')}
          </div>
          <div className="tool-strip zoom-pill">
            <IconButton
              icon="minus"
              label={t(language, 'action.zoomOut')}
              size={15}
              onClick={() => useCircuitStore.getState().zoomAt(viewport.width / 2, viewport.height / 2, 0.85)}
            />
            <span className="zoom-value">{Math.round(view.zoom * 100)}%</span>
            <IconButton
              icon="plus"
              label={t(language, 'action.zoomIn')}
              size={15}
              onClick={() => useCircuitStore.getState().zoomAt(viewport.width / 2, viewport.height / 2, 1.18)}
            />
          </div>
        </div>
      )}
    </>
  );
}
