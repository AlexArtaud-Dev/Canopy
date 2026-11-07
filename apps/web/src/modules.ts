// The one place features are registered. It imports each slice's `*.module.ts` directly (not its
// index) because module declarations must stay client-safe for the navigation.
import { groupsModule, rolesModule } from '@/features/access/access.module';
import { appearanceModule } from '@/features/appearance/appearance.module';
import { auditModule } from '@/features/audit/audit.module';
import { authModule } from '@/features/auth/auth.module';
import { filesModule } from '@/features/files/files.module';
import { mailModule } from '@/features/mail/mail.module';
import { settingsModule } from '@/features/settings/settings.module';
import { systemModule } from '@/features/system/system.module';
import { usersModule } from '@/features/users/users.module';
import { createRegistry } from '@/shared/modules/registry';

export const appRegistry = createRegistry([
  filesModule,
  authModule,
  usersModule,
  groupsModule,
  rolesModule,
  mailModule,
  settingsModule,
  appearanceModule,
  auditModule,
  systemModule,
]);
