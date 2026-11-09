'use client';

import { Info, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useFormError } from '@/shared/errors/use-error-message';
import { useCan } from '@/shared/permissions/can';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { groupByCategory, matchesSearch, selectedTab, type FieldView } from './settings-form.utils';
import { resetSettingToDefault, saveSetting } from './server/settings-page';
import { SettingField } from './ui/setting-field';

export interface ModuleSettings {
  module: string;
  fields: FieldView[];
}

/**
 * Generated from the modules' settings schemas: no screen is written by hand per module. One
 * module per vertical tab, grouped by category; the open tab is in the URL (`?tab=`), so other
 * pages can link to it. A search shows every matching field at once.
 */
export function SettingsContainer({
  modules,
  local,
}: {
  modules: readonly ModuleSettings[];
  local: boolean;
}) {
  const t = useTranslations('settings');
  const router = useRouter();
  const searchParams = useSearchParams();
  const toFormError = useFormError();
  const canEdit = useCan('settings:update');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Keys come from module schemas:
  // i18n-dynamic: settings.fields
  // i18n-dynamic: settings.modules
  // i18n-dynamic: settings.groups
  // i18n-dynamic: settings.options
  // i18n-dynamic: settings.categories
  const label = (key: string) => t(key as Parameters<typeof t>[0]);

  const categories = groupByCategory(modules.map((module) => module.module));
  const current = selectedTab(
    searchParams.get('tab'),
    categories.flatMap((category) => category.modules),
  );
  const openTab = (tab: string) => {
    router.replace(`/admin/settings?tab=${encodeURIComponent(tab)}`, { scroll: false });
  };

  const run = (key: string, action: () => ReturnType<typeof saveSetting>, success: string) => {
    setBusyKey(key);
    startTransition(async () => {
      const result = await action();
      setBusyKey(null);
      if (!result.ok) {
        toast.error(toFormError(result.error).message);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  };

  const moduleCard = (module: ModuleSettings) => {
    const groups = [...new Set(module.fields.map((field) => field.group))];
    return (
      <Card key={module.module}>
        <CardHeader>
          <CardTitle>{label(`modules.${module.module}`)}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {groups.map((group) => (
            <section key={group} aria-labelledby={`group-${module.module}-${group}`}>
              <h3
                id={`group-${module.module}-${group}`}
                className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
              >
                {label(`groups.${group}`)}
              </h3>
              <div className="divide-y">
                {module.fields
                  .filter((field) => field.group === group)
                  .map((field) => {
                    const key = `${module.module}.${field.key}`;
                    return (
                      <SettingField
                        key={`${key}:${String(field.value)}`}
                        field={field}
                        label={label(`fields.${key}.label`)}
                        description={label(`fields.${key}.description`)}
                        editable={canEdit && !field.locked && (!field.localOnly || local)}
                        needsLocal={field.localOnly && !local}
                        pending={busyKey === key}
                        optionLabel={(option) => label(`options.${key}.${option}`)}
                        onSave={(value) => {
                          run(
                            key,
                            () => saveSetting({ module: module.module, key: field.key, value }),
                            t('saved'),
                          );
                        }}
                        onReset={() => {
                          run(
                            key,
                            () => resetSettingToDefault({ module: module.module, key: field.key }),
                            t('resetDone'),
                          );
                        }}
                      />
                    );
                  })}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    );
  };

  const searching = search.trim() !== '';
  const matches = modules
    .map((module) => ({
      ...module,
      fields: module.fields.filter((field) =>
        matchesSearch(
          search,
          field.key,
          label(`fields.${module.module}.${field.key}.label`),
          label(`fields.${module.module}.${field.key}.description`),
        ),
      ),
    }))
    .filter((module) => module.fields.length > 0);

  return (
    <div className="grid gap-6">
      <div className="relative sm:max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={t('search')}
          aria-label={t('search')}
          className="pl-8"
        />
      </div>

      <Alert>
        <Info aria-hidden />
        <AlertDescription>
          <Link href="/admin/email" className="underline underline-offset-4">
            {t('ownPage.mail')}
          </Link>
        </AlertDescription>
      </Alert>

      {searching ? (
        matches.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <div className="grid gap-6">{matches.map(moduleCard)}</div>
        )
      ) : (
        current && (
          <Tabs
            orientation="vertical"
            value={current}
            onValueChange={openTab}
            className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]"
          >
            {/* Phones: one list to pick from instead of a column of tabs. */}
            <Select value={current} onValueChange={openTab}>
              <SelectTrigger className="w-full md:hidden" aria-label={t('section')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectGroup key={category.id}>
                    <SelectLabel>{label(`categories.${category.id}`)}</SelectLabel>
                    {category.modules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {label(`modules.${module}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <nav className="hidden gap-5 md:sticky md:top-4 md:grid" aria-label={t('section')}>
              {categories.map((category) => (
                <div key={category.id} className="grid gap-1">
                  <p
                    id={`settings-category-${category.id}`}
                    className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase"
                  >
                    {label(`categories.${category.id}`)}
                  </p>
                  <TabsList
                    variant="line"
                    aria-labelledby={`settings-category-${category.id}`}
                    className="w-full items-stretch"
                  >
                    {category.modules.map((module) => (
                      <TabsTrigger key={module} value={module} className="px-2 py-1.5">
                        {label(`modules.${module}`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              ))}
            </nav>
            {modules.map((module) => (
              <TabsContent key={module.module} value={module.module} className="min-w-0">
                {moduleCard(module)}
              </TabsContent>
            ))}
          </Tabs>
        )
      )}
    </div>
  );
}
