import { useEffect, useState } from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";

const SHEET_QUERY = "(max-width: 640px)";

function useIsSheet() {
  const [sheet, setSheet] = useState(() => window.matchMedia?.(SHEET_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(SHEET_QUERY);
    if (!mq) return;
    const on = () => setSheet(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return sheet;
}

/**
 * Peek card: opens on hover/focus with a pointer, on tap for touch, and becomes a
 * bottom sheet on phone-width screens.
 */
export function HoverCard({ renderTrigger, children, label, width = 380, placement = "top" }) {
  const [open, setOpen] = useState(false);
  const sheet = useIsSheet();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 16, fallbackAxisSideDirection: "end" }),
      shift({ padding: 16 }),
      size({
        padding: 16,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(220, Math.min(availableHeight, 520))}px`;
        },
      }),
    ],
  });

  const hover = useHover(context, {
    enabled: !sheet,
    mouseOnly: true,
    delay: { open: 220, close: 90 },
    handleClose: safePolygon({ buffer: 2 }),
  });
  const focus = useFocus(context, { enabled: !sheet, visibleOnly: true });
  const click = useClick(context, { ignoreMouse: !sheet });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  const { isMounted, styles } = useTransitionStyles(context, {
    duration: { open: 170, close: 110 },
    initial: sheet ? { transform: "translateY(24px)", opacity: 0 } : { opacity: 0, transform: "translateY(4px) scale(0.985)" },
  });

  const close = () => setOpen(false);

  return (
    <>
      {renderTrigger({ ref: refs.setReference, open, ...getReferenceProps() })}
      {isMounted && (
        <FloatingPortal>
          {sheet && <div className="sheet-backdrop" style={{ opacity: styles.opacity }} onClick={close} />}
          <div
            ref={refs.setFloating}
            className={sheet ? "peek peek--sheet" : "peek"}
            style={sheet ? undefined : { ...floatingStyles, width }}
            aria-label={label}
            {...getFloatingProps()}
          >
            <div className="peek__inner" style={styles}>
              {sheet && <div className="peek__grabber" aria-hidden="true" />}
              {typeof children === "function" ? children({ close }) : children}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
