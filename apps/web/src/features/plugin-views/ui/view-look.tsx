import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  Download,
  Eye,
  EyeOff,
  Flag,
  Folder,
  Link,
  List,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Trash2,
  Upload,
  X,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { createElement } from 'react';

import type { PluginViewState } from '@canopy/contracts';

/** The icons a plugin may name (the engine refuses any other). */
const icons: Record<string, LucideIcon> = {
  activity: Activity,
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  check: Check,
  cloud: Cloud,
  download: Download,
  eye: Eye,
  'eye-off': EyeOff,
  flag: Flag,
  folder: Folder,
  link: Link,
  list: List,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  power: Power,
  refresh: RefreshCw,
  'rotate-ccw': RotateCcw,
  server: Server,
  square: Square,
  trash: Trash2,
  upload: Upload,
  x: X,
  zap: Zap,
};

/** The icon a plugin names, drawn with the props given (a list for an unknown name). */
export function ViewIcon({ name, ...props }: { name: string } & LucideProps) {
  return createElement(icons[name] ?? List, props);
}

/** Theme colours for each tone (design tokens only). */
const tones: Record<PluginViewState['tone'], string> = {
  active: 'bg-primary/15 text-primary',
  success: 'bg-chart-1/15 text-chart-1',
  warning: 'bg-chart-3/20 text-foreground',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export function toneClass(tone: PluginViewState['tone'] | undefined): string {
  return tones[tone ?? 'muted'];
}
