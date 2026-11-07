'use client';

import { Info, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useFormError } from '@/shared/errors/use-error-message';
import { useCan } from '@/shared/permissions/can';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';

import { matchesSearch, type FieldView } from './settings-form.utils';
import { resetSettingToDefault, saveSetting } from './server/settings-page';
import { SettingField } from './ui/setting-field';

export interface ModuleSettings {
  module: string;
  fields: FieldView[];
}

/** Generated from the modules' settings schemas: no screen is written by hand per module. */
export function SettingsContainer({
  modules,
  local,
}: {
  modules: readonly ModuleSettings[];
  local: boolean;
}) {
  const t = useTranslations('settings');
  const router = useRouter();
  const toFormError = useFormError();
  const canEdit = useCan('settings:update');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // i18n-dynamic: settings.fields settings.modules settings.groups — keys come from module schemas.
  const label = (key: string) => t(key as Parameters<typeof t>[0]);

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

  const visible = modules
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

      {visible.length === 0 && <p className="text-muted-foreground text-sm">{t('empty')}</p>}

      {visible.map((module) => {
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
                                () =>
                                  resetSettingToDefault({ module: module.module, key: field.key }),
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
      })}
    </div>
  );
}
