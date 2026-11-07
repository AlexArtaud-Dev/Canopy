import type { ReactNode } from 'react';

import { initialsOf, requireSession, signOut } from '@/features/auth';
import { AccountContainer, AppSidebar } from '@/features/shell';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();

  return (
    <SidebarProvider>
      <AppSidebar
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
