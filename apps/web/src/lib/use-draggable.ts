"use client";

// Small draggable-widget hook shared by the floating helpers (AI Copilot +
// Support). Remembers the parked position in localStorage and always re-clamps
// into the current viewport so a bubble can never end up off-screen.
import { useCallback, useEffect, useRef, useState } from "react";

export type Pos = { x: number; y: number };

export function useDraggable(storageKey: string, computeDefault: () => Pos) {
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const drag = useRef({ active: false, moved: false, px: 0, py: 0, ox: 0, oy: 0, w: 0, h: 0 });

  const apply = useCallback((p: Pos) => { posRef.current = p; setPos(p); }, []);
  const clamp = (x: number, y: number, w: number, h: number): Pos => ({
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - w)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
  });

  useEffect(() => {
    let initial: Pos | null = null;
    try { const s = localStorage.getItem(storageKey); if (s) initial = JSON.parse(s); } catch {}
    const start = initial ?? computeDefault();
    const el = targetRef.current;
    apply(clamp(start.x, start.y, el?.offsetWidth || 56, el?.offsetHeight || 56));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => {
      const p = posRef.current;
      if (!p) return;
      const el = targetRef.current;
      const w = el?.offsetWidth || drag.current.w || 56;
      const h = el?.offsetHeight || drag.current.h || 56;
      apply(clamp(p.x, p.y, w, h));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const box = targetRef.current ?? (e.currentTarget as HTMLElement);
    const r = box.getBoundingClientRect();
    drag.current = { active: true, moved: false, px: e.clientX, py: e.clientY, ox: r.left, oy: r.top, w: r.width, h: r.height };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    apply(clamp(d.ox + dx, d.oy + dy, d.w, d.h));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d.moved && posRef.current) {
      try { localStorage.setItem(storageKey, JSON.stringify(posRef.current)); } catch {}
    }
  };

  return {
    pos,
    targetRef,
    justDragged: () => drag.current.moved,
    handleProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}
