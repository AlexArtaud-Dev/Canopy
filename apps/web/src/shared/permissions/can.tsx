'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { GlobalPermission } from '@/shared/modules/module.types';

const PermissionsContext = createContext<ReadonlySet<GlobalPermission>>(new Set());

/** Makes the signed-in user's permissions available to client components (UX only). */
export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: readonly GlobalPermission[];
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={new Set(permissions)}>
      {children}
    </PermissionsContext.Provider>
  );
}

/** Hides or disables controls; never a security check: the server authorizes every action. */
export function useCan(permission: GlobalPermission): boolean {
  return useContext(PermissionsContext).has(permission);
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: GlobalPermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(permission) ? children : fallback;
}
