import { defineModule } from '@/shared/modules/module.types';

import { authSettings } from './auth.settings';

export const authModule = defineModule({
  id: 'auth',
  settings: authSettings,
  auditActions: [
    'auth.sign_in',
    'auth.sign_out',
    'auth.setup',
    'auth.two_factor',
    'auth.totp_enable',
    'auth.totp_disable',
    'auth.recovery_codes_regenerate',
    'auth.profile_update',
    'auth.password_change',
    'auth.session_revoke',
    'auth.access_denied',
    'auth.ip_block',
  ],
});
