"use client";

import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type ModalShellProps = {
  isOpen: boolean;
  onClose?: () => void;
  title: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  overlayClassName?: string;
  showCloseButton?: boolean;
};

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MODAL_BASE_Z_INDEX = 50;

let openModalCount = 0;
let nextModalZIndex = MODAL_BASE_Z_INDEX;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

export function ModalShell({
  isOpen,
  onClose,
  title,
  children,
  headerActions,
  footer,
  widthClassName = "max-w-lg",
  panelClassName,
  bodyClassName = "p-4",
  headerClassName = "border-b border-[color:var(--line)] p-4",
  footerClassName = "border-t border-[color:var(--line)] bg-[var(--surface-muted)] p-4",
  overlayClassName,
  showCloseButton = true,
}: ModalShellProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalZIndexRef = useRef<number | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    if (!isOpen) {
      modalZIndexRef.current = null;
      return;
    }

    if (modalZIndexRef.current === null) {
      modalZIndexRef.current = nextModalZIndex;
      nextModalZIndex += 1;
    }

    if (overlayRef.current) {
      overlayRef.current.style.zIndex = String(modalZIndexRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    return () => {
      modalZIndexRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const firstFocusable = panel.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? panel).focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const body = document.body;
    if (openModalCount === 0) {
      previousBodyOverflow = body.style.overflow;
      previousBodyPaddingRight = body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
      body.style.overflow = "hidden";
    }

    openModalCount += 1;

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        body.style.overflow = previousBodyOverflow;
        body.style.paddingRight = previousBodyPaddingRight;
      }
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose?.();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={cx("fixed inset-0 flex items-center justify-center bg-black/50 p-4", overlayClassName)}
      style={{ zIndex: MODAL_BASE_Z_INDEX }}
      onClick={() => onClose?.()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
        className={cx("w-full overflow-hidden rounded-lg bg-[var(--surface)] shadow-xl", widthClassName, panelClassName)}
      >
        <div className={cx("flex items-center justify-between gap-3", headerClassName)}>
          <h3 id={titleId} className="text-lg font-semibold text-[var(--foreground)]">
            {title}
          </h3>
          {(headerActions || (showCloseButton && onClose)) && (
            <div className="flex items-center gap-2">
              {headerActions}
              {showCloseButton && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭"
                  className="rounded-sm text-xl text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)]"
                >
                  ×
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className={bodyClassName}>{children}</div>
        {footer ? <div className={footerClassName}>{footer}</div> : null}
      </div>
    </div>
  );
}
