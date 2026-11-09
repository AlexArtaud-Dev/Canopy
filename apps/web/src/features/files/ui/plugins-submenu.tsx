'use client';

import type { CommandEntry } from '@canopy/contracts';
import { Puzzle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/shared/ui/context-menu';
import { localized, type PluginMenu } from '@/features/commands';

interface PluginsSubmenuProps {
  plugins: readonly PluginMenu[];
  onSelect: (command: CommandEntry) => void;
}

/** Plugins › <plugin> › <command>: runs a plugin command on a folder, in a dialog. */
export function PluginsSubmenu({ plugins, onSelect }: PluginsSubmenuProps) {
  const t = useTranslations('files.browser.menu');
  const locale = useLocale();
  if (plugins.length === 0) return null;
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Puzzle aria-hidden />
        {t('plugins')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {plugins.map(({ plugin, entries }) => (
          <ContextMenuSub key={plugin.id}>
            <ContextMenuSubTrigger>{localized(plugin.name, locale)}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {entries.map((command) => (
                <ContextMenuItem
                  key={command.id}
                  onSelect={() => {
                    onSelect(command);
                  }}
                >
                  {localized(command.name, locale)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
