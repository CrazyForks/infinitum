"use client";

import { useEffect, useState } from "react";

type AdminSessionPayload = {
  isAdmin?: boolean;
};

type ClientAdminSessionState = {
  isAdmin: boolean;
  isResolving: boolean;
};

export function useClientAdminSessionState(
  initialIsAdmin: boolean,
  enabled = false,
): ClientAdminSessionState {
  const shouldResolveClientSession = enabled && !initialIsAdmin;
  const requestKey = `${enabled}:${initialIsAdmin}`;
  const [clientSession, setClientSession] = useState<{
    key: string;
    isAdmin: boolean | null;
  }>({
    key: requestKey,
    isAdmin: shouldResolveClientSession ? null : initialIsAdmin,
  });
  const resolvedClientAdmin = clientSession.key === requestKey ? clientSession.isAdmin : null;

  useEffect(() => {
    if (!shouldResolveClientSession) {
      return;
    }

    let active = true;

    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<AdminSessionPayload> : null))
      .then((session) => {
        if (!active) {
          return;
        }

        setClientSession({
          key: requestKey,
          isAdmin: Boolean(session?.isAdmin),
        });
      })
      .catch(() => {
        if (active) {
          setClientSession({
            key: requestKey,
            isAdmin: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [requestKey, shouldResolveClientSession]);

  if (!shouldResolveClientSession) {
    return {
      isAdmin: initialIsAdmin,
      isResolving: false,
    };
  }

  return {
    isAdmin: Boolean(resolvedClientAdmin),
    isResolving: resolvedClientAdmin == null,
  };
}

export function useClientAdminSession(initialIsAdmin: boolean, enabled = false) {
  return useClientAdminSessionState(initialIsAdmin, enabled).isAdmin;
}
