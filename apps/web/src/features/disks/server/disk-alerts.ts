import 'server-only';

import { claimDiskAlerts } from '@canopy/contracts';
import { createClient } from '@canopy/contracts/client';

import { parseServerEnv } from '@/shared/config/env';
import { signEngineToken } from '@/shared/engine/engine-token';
import { logger } from '@/shared/lib/logger';
import { usersHolding } from '@/features/access/server/permissions';
import { notify } from '@/features/notifications/server/notifications-store';

import { alertNotification, diskReadPermission } from '../disks.utils';

const log = logger.child({ module: 'disks' });

/**
 * Background sweep: takes the disk alerts the engine queued (each once, even with several web
 * instances) and notifies everyone who may read disk health. Nothing to do when disk health is
 * not set up: the engine answers an empty list.
 */
export async function deliverDiskAlerts(): Promise<void> {
  const token = await signEngineToken({
    userId: 'system',
    sessionId: 'disk-alerts',
    permissions: ['system:admin'],
    groups: [],
  });
  const client = createClient({
    baseUrl: parseServerEnv(process.env).CANOPY_ENGINE_URL,
    auth: () => token,
  });
  // The engine may be restarting: the alerts wait for the next sweep.
  const claimed = await claimDiskAlerts({ client }).catch(() => undefined);
  const alerts = claimed?.data?.alerts ?? [];
  if (alerts.length === 0) return;
  const recipients = await usersHolding([diskReadPermission]);
  await Promise.all(
    alerts.flatMap((alert) => {
      const notification = alertNotification(alert);
      return recipients.map((userId) => notify({ userId, ...notification }));
    }),
  );
  log.info('disk alerts delivered', { alerts: alerts.length, recipients: recipients.length });
}
