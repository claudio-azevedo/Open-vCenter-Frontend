import * as React from "react";
import { cn } from "./bevel";

/**
 * A scroll container that hides the native scrollbars and paints Win95 ones
 * (arrow buttons, dithered track, raised thumb) on top - so the chrome is
 * identical in every browser, not just Blink/WebKit.
 *
 * The global stylesheet already themes native `::-webkit-scrollbar`, so plain
 * `overflow-auto` is fine in this (Chromium) app. Reach for this component when
 * you want the exact look guaranteed cross-browser or an always-mounted bar.
 *
 * Give it a **definite or flex height** via `className` (e.g. `h-64`, or
 * `min-h-0 flex-1` inside a flex column) - the viewport fills the box
 * absolutely. The bars reserve their own gutter (viewport padding on the
 * occupied side) so content is never hidden behind a bar.
 */
const BAR = 16; // px - classic scrollbar thickness
const LINE = 32; // px per arrow-button click
const REPEAT_DELAY = 300;
const REPEAT_EVERY = 40;

type Axis = "x" | "y";

export function ScrollArea({
  children,
  className,
  viewportClassName,
  orientation = "both",
}: {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  /** Which bars may appear (each still only shows when its axis overflows). */
  orientation?: "vertical" | "horizontal" | "both";
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [m, setM] = React.useState({
    showY: false,
    showX: false,
    yThumb: 0,
    yPos: 0,
    xThumb: 0,
    xPos: 0,
  });

  const allowY = orientation !== "horizontal";
  const allowX = orientation !== "vertical";

  const sync = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const {
      scrollTop,
      scrollLeft,
      scrollHeight,
      scrollWidth,
      clientHeight,
      clientWidth,
    } = el;
    // padding on each side cancels out of (scroll − client), so overflow
    // detection is stable even though we toggle gutter padding below.
    const showY = allowY && scrollHeight - clientHeight > 1;
    const showX = allowX && scrollWidth - clientWidth > 1;
    const yTrack = clientHeight - (showX ? BAR : 0);
    const xTrack = clientWidth - (showY ? BAR : 0);
    const maxTop = scrollHeight - clientHeight;
    const maxLeft = scrollWidth - clientWidth;
    const yThumb = showY
      ? clamp((clientHeight / scrollHeight) * yTrack, 18, yTrack)
      : 0;
    const xThumb = showX
      ? clamp((clientWidth / scrollWidth) * xTrack, 18, xTrack)
      : 0;
    const yPos =
      showY && maxTop > 0 ? (scrollTop / maxTop) * (yTrack - yThumb) : 0;
    const xPos =
      showX && maxLeft > 0 ? (scrollLeft / maxLeft) * (xTrack - xThumb) : 0;
    // Only re-render on a real change - sync() is called from a MutationObserver
    // below, so a fresh object every time would loop.
    setM((prev) =>
      prev.showY === showY &&
      prev.showX === showX &&
      prev.yThumb === yThumb &&
      prev.yPos === yPos &&
      prev.xThumb === xThumb &&
      prev.xPos === xPos
        ? prev
        : { showY, showX, yThumb, yPos, xThumb, xPos },
    );
  }, [allowX, allowY]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const ro = new ResizeObserver(sync);
    // (Re-)observe the viewport and its current content. The content element
    // swaps out when a tab changes, so re-point the observer whenever the
    // subtree mutates - otherwise the bar keeps the previous tab's overflow.
    const observe = () => {
      ro.disconnect();
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
      sync();
    };
    observe();

    el.addEventListener("scroll", sync, { passive: true });
    const mo = new MutationObserver(observe);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, [sync]);

  const nudge = (axis: Axis, delta: number) => {
    const el = viewportRef.current;
    if (!el) return;
    if (axis === "y") el.scrollTop += delta;
    else el.scrollLeft += delta;
  };

  // press-and-hold repeat for the arrow buttons
  const holdRef = React.useRef<{ timeout: number; interval: number }>({
    timeout: 0,
    interval: 0,
  });
  const startHold = (axis: Axis, delta: number) => {
    nudge(axis, delta);
    holdRef.current.timeout = window.setTimeout(() => {
      holdRef.current.interval = window.setInterval(
        () => nudge(axis, delta),
        REPEAT_EVERY,
      );
    }, REPEAT_DELAY);
  };
  const endHold = () => {
    clearTimeout(holdRef.current.timeout);
    clearInterval(holdRef.current.interval);
    holdRef.current = { timeout: 0, interval: 0 };
  };
  React.useEffect(() => endHold, []);

  const dragThumb = (axis: Axis) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const startPointer = axis === "y" ? e.clientY : e.clientX;
    const startScroll = axis === "y" ? el.scrollTop : el.scrollLeft;
    const range =
      axis === "y"
        ? el.scrollHeight - el.clientHeight
        : el.scrollWidth - el.clientWidth;
    const trackLen =
      (axis === "y" ? el.clientHeight : el.clientWidth) -
      ((axis === "y" ? m.showX : m.showY) ? BAR : 0) -
      (axis === "y" ? m.yThumb : m.xThumb);

    const onMove = (ev: PointerEvent) => {
      const moved = (axis === "y" ? ev.clientY : ev.clientX) - startPointer;
      const next = startScroll + (moved / Math.max(1, trackLen)) * range;
      if (axis === "y") el.scrollTop = next;
      else el.scrollLeft = next;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const pageOnTrack =
    (axis: Axis) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const before =
        axis === "y"
          ? e.clientY - rect.top < m.yPos
          : e.clientX - rect.left < m.xPos;
      const page = (axis === "y" ? el.clientHeight : el.clientWidth) * 0.9;
      nudge(axis, before ? -page : page);
    };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={viewportRef}
        className={cn(
          "scrollbar-none absolute inset-0 overflow-auto",
          viewportClassName,
        )}
        style={{
          paddingRight: m.showY ? BAR : undefined,
          paddingBottom: m.showX ? BAR : undefined,
        }}
      >
        {children}
      </div>

      {m.showY ? (
        <div
          className="bevel-thin-sunken absolute top-0 right-0 flex flex-col bg-surface"
          style={{ width: BAR, bottom: m.showX ? BAR : 0 }}
        >
          <ArrowButton
            dir="up"
            onHold={() => startHold("y", -LINE)}
            onRelease={endHold}
          />
          <div
            className="scroll-track relative flex-1"
            onPointerDown={pageOnTrack("y")}
          >
            <div
              role="scrollbar"
              aria-orientation="vertical"
              onPointerDown={dragThumb("y")}
              className="bevel-raised absolute right-0 left-0 bg-surface"
              style={{ top: m.yPos, height: m.yThumb }}
            />
          </div>
          <ArrowButton
            dir="down"
            onHold={() => startHold("y", LINE)}
            onRelease={endHold}
          />
        </div>
      ) : null}

      {m.showX ? (
        <div
          className="bevel-thin-sunken absolute bottom-0 left-0 flex bg-surface"
          style={{ height: BAR, right: m.showY ? BAR : 0 }}
        >
          <ArrowButton
            dir="left"
            onHold={() => startHold("x", -LINE)}
            onRelease={endHold}
          />
          <div
            className="scroll-track relative flex-1"
            onPointerDown={pageOnTrack("x")}
          >
            <div
              role="scrollbar"
              aria-orientation="horizontal"
              onPointerDown={dragThumb("x")}
              className="bevel-raised absolute top-0 bottom-0 bg-surface"
              style={{ left: m.xPos, width: m.xThumb }}
            />
          </div>
          <ArrowButton
            dir="right"
            onHold={() => startHold("x", LINE)}
            onRelease={endHold}
          />
        </div>
      ) : null}

      {m.showY && m.showX ? (
        <div
          className="bevel-thin-sunken absolute right-0 bottom-0 bg-surface"
          style={{ width: BAR, height: BAR }}
        />
      ) : null}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// CSS-triangle arrows (crisper than glyphs at this size)
const ARROW: Record<"up" | "down" | "left" | "right", string> = {
  up: "border-x-[3px] border-b-[4px] border-x-transparent border-b-black",
  down: "border-x-[3px] border-t-[4px] border-x-transparent border-t-black",
  left: "border-y-[3px] border-r-[4px] border-y-transparent border-r-black",
  right: "border-y-[3px] border-l-[4px] border-y-transparent border-l-black",
};

function ArrowButton({
  dir,
  onHold,
  onRelease,
}: {
  dir: "up" | "down" | "left" | "right";
  onHold: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Scroll ${dir}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onHold();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      className="bevel-raised active:bevel-pressed grid shrink-0 place-items-center bg-surface"
      style={{ width: BAR, height: BAR }}
    >
      <span className={cn("block h-0 w-0", ARROW[dir])} />
    </button>
  );
}
