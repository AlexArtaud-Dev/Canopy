// The one place features are registered. It imports each slice's `*.module.ts` directly (not its
// index) because module declarations must stay client-safe for the navigation.
import { filesModule } from '@/features/files/files.module';
import { systemModule } from '@/features/system/system.module';
import { createRegistry } from '@/shared/modules/registry';

export const appRegistry = createRegistry([filesModule, systemModule]);
