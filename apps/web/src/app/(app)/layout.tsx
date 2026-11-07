import type { ReactNode } from 'react';

import { initialsOf, permissionsOf, requireSession, signOut } from '@/features/auth';
import { AccountContainer, AppSidebar } from '@/features/shell';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();

  return (
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
          />
        }
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
