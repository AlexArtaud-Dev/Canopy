import type { ReactNode } from 'react';

import { AppSidebar, PreferencesContainer } from '@/features/shell';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar footer={<PreferencesContainer />} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
