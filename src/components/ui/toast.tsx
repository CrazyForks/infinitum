"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { TOAST_DURATION_MS, TOAST_DEDUPE_MS } from "@/config/constants";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}

const toastToneClassNames: Record<ToastType, string> = {
  success: "bg-[var(--success-ink)] text-white",
  error: "bg-[var(--danger-ink)] text-white",
  info: "bg-[var(--accent-strong)] text-white",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastRef = useRef<Map<string, number>>(new Map());

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const now = Date.now();
    const key = `${type}:${message}`;
    const lastTimestamp = recentToastRef.current.get(key);

    if (lastTimestamp && now - lastTimestamp < TOAST_DEDUPE_MS) {
      return;
    }

    recentToastRef.current.set(key, now);
    recentToastRef.current.forEach((timestamp, toastKey) => {
      if (now - timestamp > TOAST_DURATION_MS) {
        recentToastRef.current.delete(toastKey);
      }
    });

    const id = now + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed right-4 top-4 z-50 space-y-2" aria-atomic="false" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-in flex min-w-[280px] items-center gap-3 rounded-sm px-4 py-3 shadow-md ${toastToneClassNames[toast.type]}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
            </span>
            <span className="flex-1 text-sm leading-6">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-white/80 transition hover:text-white"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
