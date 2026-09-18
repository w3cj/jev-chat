import type { KeyboardEvent, PointerEvent } from "react";

interface Props {
  /** Which edge of the panel the handle sits on */
  edge: "left" | "right";
  /** Accessible name, e.g. "Resize the sidebar" */
  label: string;
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  onResize: (width: number) => void;
}

function clamp(w: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, w)));
}

/** Drag handle on a panel's edge. Drag or arrow keys to resize, double-click to reset. */
export function ResizeHandle({ edge, label, width, min, max, defaultWidth, onResize }: Props) {
  const sign = edge === "right" ? 1 : -1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (ev: globalThis.PointerEvent) =>
      onResize(clamp(startWidth + sign * (ev.clientX - startX), min, max));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") onResize(clamp(width - sign * step, min, max));
    else if (e.key === "ArrowRight") onResize(clamp(width + sign * step, min, max));
    else return;
    e.preventDefault();
  };

  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none ${edge === "right" ? "-right-1" : "-left-1"}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(defaultWidth)}
    >
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
