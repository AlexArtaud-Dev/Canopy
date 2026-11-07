import { z } from 'zod';

import { defineSettings } from '@/shared/modules/settings.types';

export const smtpSecurityModes = ['starttls', 'tls', 'none'] as const;

export const mailSettings = defineSettings({
  schema: z.object({
    /** Off until an administrator configures SMTP: flows fall back to copyable links. */
    enabled: z.boolean().default(false),
    host: z.string().trim().max(255).default(''),
    port: z.number().int().min(1).max(65535).default(587),
    security: z.enum(smtpSecurityModes).default('starttls'),
    username: z.string().max(255).default(''),
    password: z.string().max(1024).default(''),
    fromAddress: z.union([z.literal(''), z.email()]).default(''),
    fromName: z.string().trim().max(100).default('Canopy'),
  }),
  fields: {
    enabled: { group: 'smtp', env: 'CANOPY_SMTP_ENABLED' },
    host: { group: 'smtp', env: 'CANOPY_SMTP_HOST' },
    port: { group: 'smtp', env: 'CANOPY_SMTP_PORT' },
    security: { group: 'smtp', env: 'CANOPY_SMTP_SECURITY' },
    username: { group: 'smtp', env: 'CANOPY_SMTP_USERNAME' },
    password: { group: 'smtp', sensitive: true, env: 'CANOPY_SMTP_PASSWORD' },
    fromAddress: { group: 'sender', env: 'CANOPY_SMTP_FROM' },
    fromName: { group: 'sender', env: 'CANOPY_SMTP_FROM_NAME' },
  },
});

export type MailSettings = z.infer<typeof mailSettings.schema>;
