// The one place features are registered. It imports each slice's `*.module.ts` directly (not its
// index) because module declarations must stay client-safe for the navigation.
import { groupsModule, rolesModule } from '@/features/access/access.module';
import { appearanceModule } from '@/features/appearance/appearance.module';
import { auditModule } from '@/features/audit/audit.module';
import { authModule } from '@/features/auth/auth.module';
import { commandsModule } from '@/features/commands/commands.module';
import { filesModule } from '@/features/files/files.module';
import { thumbnailsModule } from '@/features/files/thumbnails.module';
import { jobsModule } from '@/features/jobs/jobs.module';
import { mailModule } from '@/features/mail/mail.module';
import { settingsModule } from '@/features/settings/settings.module';
import { sharesModule } from '@/features/shares/shares.module';
import { systemModule } from '@/features/system/system.module';
import { trashModule } from '@/features/trash/trash.module';
import { uploadsModule } from '@/features/uploads/uploads.module';
import { usersModule } from '@/features/users/users.module';
import { createRegistry } from '@/shared/modules/registry';

export const appRegistry = createRegistry([
  filesModule,
  jobsModule,
  uploadsModule,
  trashModule,
  thumbnailsModule,
  sharesModule,
  commandsModule,
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
