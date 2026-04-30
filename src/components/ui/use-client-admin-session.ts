"use client";

import { useEffect, useState } from "react";

type AdminSessionPayload = {
  isAdmin?: boolean;
};

export function useClientAdminSession(initialIsAdmin: boolean, enabled = false) {
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);

  useEffect(() => {
    setIsAdmin(initialIsAdmin);
  }, [initialIsAdmin]);

  useEffect(() => {
    if (!enabled || initialIsAdmin) {
      return;
    }

    let active = true;

    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<AdminSessionPayload> : null)
      .then((session) => {
        if (!active || !session) {
          return;
        }

        setIsAdmin(Boolean(session.isAdmin));
      })
      .catch(() => {
        if (active) {
          setIsAdmin(false);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, initialIsAdmin]);

  return isAdmin;
}
