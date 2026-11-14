'use client';

import { useEffect } from 'react';

import { startInstallSupport } from '../model/install-prompt';

/** Mounted once in the root layout: makes Canopy installable. Renders nothing. */
export function InstallSupport() {
  useEffect(() => {
    startInstallSupport();
  }, []);
  return null;
}
