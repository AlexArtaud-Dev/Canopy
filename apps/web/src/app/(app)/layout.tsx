import type { ReactNode } from 'react';

import { JobsDockContainer } from '@/features/jobs';
import { initialsOf, permissionsOf, requireSession, signOut } from '@/features/auth';
import { AccountContainer, AppSidebar } from '@/features/shell';
import { PermissionsProvider } from '@/shared/permissions/can';
import { QueryProvider } from '@/shared/query/query-provider';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';
import { loadWhatsNew } from '@/features/whats-new/server/changelog';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [{ user }, whatsNew] = await Promise.all([requireSession(), loadWhatsNew()]);

  return (
    <PermissionsProvider permissions={user.permissions}>
      <QueryProvider>
        <SidebarProvider>
          <AppSidebar
            grantedPermissions={permissionsOf(user)}
            footer={
              <AccountContainer
                account={{
                  name: user.name,
                  username: user.username,
                  initials: initialsOf(user.name),
                  isAdmin: user.isAdmin,
                }}
                signOutAction={signOut}
                latestRelease={whatsNew.latest}
              />
            }
          />
          <SidebarInset>{children}</SidebarInset>
          <JobsDockContainer />
        </SidebarProvider>
      </QueryProvider>
    </PermissionsProvider>
  );
}
