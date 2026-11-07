// The one place features are registered. It imports each slice's `*.module.ts` directly (not its
// index) because module declarations must stay client-safe for the navigation.
import { auditModule } from '@/features/audit/audit.module';
import { filesModule } from '@/features/files/files.module';
import { settingsModule } from '@/features/settings/settings.module';
import { systemModule } from '@/features/system/system.module';
import { createRegistry } from '@/shared/modules/registry';

export const appRegistry = createRegistry([filesModule, settingsModule, auditModule, systemModule]);
