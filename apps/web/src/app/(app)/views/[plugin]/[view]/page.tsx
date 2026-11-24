import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

import { localized } from '@/features/commands/commands.utils';
import { listPluginViews, PluginViewContainer } from '@/features/plugin-views';
import { AccessDenied, PageHeader } from '@/features/shell';

interface ViewPageProps {
  params: Promise<{ plugin: string; view: string }>;
}

/** The view if the person may open it (the engine lists only those). */
async function findView({ params }: ViewPageProps) {
  const { plugin, view } = await params;
  const views = await listPluginViews();
  return views.ok
    ? views.data.find((ref) => ref.pluginId === plugin && ref.view.id === view)
    : undefined;
}

export async function generateMetadata(props: ViewPageProps): Promise<Metadata> {
  const [ref, locale] = await Promise.all([findView(props), getLocale()]);
  return ref ? { title: localized(ref.view.name, locale) } : {};
}

export default async function PluginViewPage(props: ViewPageProps) {
  const [ref, locale] = await Promise.all([findView(props), getLocale()]);
  if (!ref) return <AccessDenied />;
  return (
    <>
      <PageHeader title={localized(ref.view.name, locale)} />
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 p-4 md:p-6">
        <PluginViewContainer viewRef={ref} />
      </main>
    </>
  );
}
