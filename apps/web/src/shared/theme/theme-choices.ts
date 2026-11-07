import { Monitor, Moon, Sun } from 'lucide-react';

export const themeChoices = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof themeChoices)[number];

export const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export function toThemeChoice(value: string | undefined): ThemeChoice {
  return themeChoices.find((choice) => choice === value) ?? 'system';
}
