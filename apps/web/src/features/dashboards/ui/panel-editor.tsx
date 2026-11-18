'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import {
  aggregations,
  alignments,
  panelTypes,
  ruleColors,
  type ColorRule,
  type Panel,
} from '../dashboards.utils';
import { cssColor } from '../panels.utils';
import { variableFamilies, type TimeRange, type VariableDefinition } from '../variables.utils';
import { PanelView } from './panel-views';
import { editorFeatures, panelSizes } from './panel-editor.utils';

interface PanelEditorProps {
  /** The panel being edited, or the new one's starting point. */
  initial: Panel;
  mode: 'add' | 'edit';
  variables: readonly VariableDefinition[];
  range: TimeRange;
  pending: boolean;
  onClose: () => void;
  onSave: (panel: Panel) => void;
}

/** Icons of each placement: left, centre, right; top, middle, bottom. */
const alignIcons = {
  alignX: {
    start: AlignStartVertical,
    center: AlignCenterVertical,
    end: AlignEndVertical,
  },
  alignY: {
    start: AlignStartHorizontal,
    center: AlignCenterHorizontal,
    end: AlignEndHorizontal,
  },
} as const;

/**
 * Builds a panel with its live preview beside the settings (above them on a phone): type,
 * variables, how values become one number, display options, colour rules and size. Cancel leaves
 * the dashboard as it was.
 */
export function PanelEditor({
  initial,
  mode,
  variables,
  range,
  pending,
  onClose,
  onSave,
}: PanelEditorProps) {
  const t = useTranslations('dashboards');
  const formId = useId();
  const [panel, setPanel] = useState<Panel>(initial);
  const features = editorFeatures(panel.type);
  const update = (change: Partial<Panel>) => {
    setPanel((current) => ({ ...current, ...change }));
  };
  const setOption = <K extends keyof Panel['options']>(key: K, value: Panel['options'][K]) => {
    setPanel((current) => ({ ...current, options: { ...current.options, [key]: value } }));
  };
  const setRules = (rules: ColorRule[]) => {
    update({ rules });
  };
  // i18n-dynamic: dashboards.variables
  const label = (id: string) => t(`variables.${id}` as 'variables.system.cpu');
  const offered = variables.filter((variable) => features.kinds.includes(variable.kind));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? t('editor.addTitle') : t('editor.editTitle')}</DialogTitle>
          <DialogDescription>{t('editor.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card
            className="order-first gap-3 py-4 lg:order-last lg:sticky lg:top-0 lg:self-start"
            aria-label={t('editor.preview')}
          >
            <CardHeader className="px-4">
              <CardTitle className="truncate text-sm">
                {panel.title || t('editor.untitled')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-64 min-h-0 flex-col px-4">
              <PanelView panel={panel} range={range} refreshSeconds={0} />
            </CardContent>
          </Card>
          <form
            id={formId}
            className="grid content-start gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(panel);
            }}
          >
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${formId}-title`}>{t('editor.title')}</FieldLabel>
                <Input
                  id={`${formId}-title`}
                  value={panel.title}
                  maxLength={80}
                  onChange={(event) => {
                    update({ title: event.target.value });
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-type`}>{t('editor.type')}</FieldLabel>
                <Select
                  value={panel.type}
                  onValueChange={(value) => {
                    const type = panelTypes.find((candidate) => candidate === value);
                    if (!type) return;
                    // Variables of another kind (log lines, values) do not carry over.
                    const kinds = editorFeatures(type).kinds;
                    const kept = panel.variables.filter((id) =>
                      variables.some(
                        (variable) => variable.id === id && kinds.includes(variable.kind),
                      ),
                    );
                    update({ type, variables: kept });
                  }}
                >
                  <SelectTrigger id={`${formId}-type`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {panelTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {/* i18n-dynamic: dashboards.editor.types */}
                        {t(`editor.types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            {features.kinds.length > 0 && (
              <FieldSet>
                <FieldLegend variant="label">{t('editor.variables')}</FieldLegend>
                <FieldDescription>
                  {t('editor.variablesHint', { count: features.maxVariables })}
                </FieldDescription>
                {offered.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('editor.noVariables')}</p>
                ) : (
                  <div className="grid max-h-56 gap-3 overflow-y-auto rounded-lg border p-3">
                    {variableFamilies.map((family) => {
                      const inFamily = offered.filter((variable) => variable.family === family);
                      if (inFamily.length === 0) return null;
                      return (
                        <div key={family} className="grid gap-1">
                          <p className="text-muted-foreground text-xs font-medium">
                            {/* i18n-dynamic: dashboards.families */}
                            {t(`families.${family}`)}
                          </p>
                          {inFamily.map((variable) => {
                            const checked = panel.variables.includes(variable.id);
                            const full =
                              !checked && panel.variables.length >= features.maxVariables;
                            const id = `${formId}-${variable.id}`;
                            return (
                              <Field
                                key={variable.id}
                                orientation="horizontal"
                                data-disabled={full}
                              >
                                <Checkbox
                                  id={id}
                                  checked={checked}
                                  disabled={full}
                                  onCheckedChange={(value) => {
                                    update({
                                      variables:
                                        value === true
                                          ? [...panel.variables, variable.id]
                                          : panel.variables.filter((one) => one !== variable.id),
                                    });
                                  }}
                                />
                                <FieldLabel htmlFor={id} className="font-normal">
                                  {label(variable.id)}
                                </FieldLabel>
                              </Field>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </FieldSet>
            )}

            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              {features.aggregation && (
                <Field>
                  <FieldLabel htmlFor={`${formId}-aggregation`}>
                    {t('editor.aggregation')}
                  </FieldLabel>
                  <Select
                    value={panel.options.aggregation}
                    onValueChange={(value) => {
                      const aggregation = aggregations.find((candidate) => candidate === value);
                      if (aggregation) setOption('aggregation', aggregation);
                    }}
                  >
                    <SelectTrigger id={`${formId}-aggregation`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {aggregations.map((aggregation) => (
                        <SelectItem key={aggregation} value={aggregation}>
                          {/* i18n-dynamic: dashboards.editor.aggregations */}
                          {t(`editor.aggregations.${aggregation}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {features.values && (
                <Field>
                  <FieldLabel htmlFor={`${formId}-decimals`}>{t('editor.decimals')}</FieldLabel>
                  <Select
                    value={
                      panel.options.decimals === null ? 'auto' : String(panel.options.decimals)
                    }
                    onValueChange={(value) => {
                      setOption('decimals', value === 'auto' ? null : Number(value));
                    }}
                  >
                    <SelectTrigger id={`${formId}-decimals`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('editor.decimalsAuto')}</SelectItem>
                      {[0, 1, 2, 3].map((digits) => (
                        <SelectItem key={digits} value={String(digits)}>
                          {String(digits)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {features.gauge && (
                <>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-min`}>{t('editor.min')}</FieldLabel>
                    <Input
                      id={`${formId}-min`}
                      type="number"
                      value={panel.options.min}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) setOption('min', value);
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-max`}>{t('editor.max')}</FieldLabel>
                    <Input
                      id={`${formId}-max`}
                      type="number"
                      value={panel.options.max ?? ''}
                      placeholder={t('editor.maxAuto')}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const value = Number(raw);
                        setOption('max', raw === '' || !Number.isFinite(value) ? null : value);
                      }}
                    />
                  </Field>
                </>
              )}
            </FieldGroup>

            {features.align && (
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                {(['alignX', 'alignY'] as const).map((axis) => (
                  <Field key={axis}>
                    <FieldLabel>{t(`editor.${axis}`)}</FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={panel.options[axis]}
                      onValueChange={(value) => {
                        const alignment = alignments.find((candidate) => candidate === value);
                        if (alignment) setOption(axis, alignment);
                      }}
                    >
                      {alignments.map((alignment) => {
                        const Icon = alignIcons[axis][alignment];
                        return (
                          <ToggleGroupItem
                            key={alignment}
                            value={alignment}
                            // i18n-dynamic: dashboards.editor.aligns
                            aria-label={t(`editor.aligns.${axis}.${alignment}`)}
                            className="flex-1"
                          >
                            <Icon aria-hidden />
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>
                  </Field>
                ))}
              </FieldGroup>
            )}

            {(features.legend || features.stacked) && (
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                {features.legend && (
                  <Field orientation="horizontal">
                    <Switch
                      id={`${formId}-legend`}
                      checked={panel.options.legend}
                      onCheckedChange={(value) => {
                        setOption('legend', value);
                      }}
                    />
                    <FieldLabel htmlFor={`${formId}-legend`} className="font-normal">
                      {t('editor.legend')}
                    </FieldLabel>
                  </Field>
                )}
                {features.stacked && (
                  <Field orientation="horizontal">
                    <Switch
                      id={`${formId}-stacked`}
                      checked={panel.options.stacked}
                      onCheckedChange={(value) => {
                        setOption('stacked', value);
                      }}
                    />
                    <FieldLabel htmlFor={`${formId}-stacked`} className="font-normal">
                      {t('editor.stacked')}
                    </FieldLabel>
                  </Field>
                )}
              </FieldGroup>
            )}

            {features.rules && (
              <FieldSet>
                <FieldLegend variant="label">{t('editor.rules')}</FieldLegend>
                <FieldDescription>{t('editor.rulesHint')}</FieldDescription>
                <ul className="grid gap-2">
                  {panel.rules.map((rule, index) => (
                    <li key={String(index)} className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-28"
                        aria-label={t('editor.ruleFrom', { position: index + 1 })}
                        value={rule.from}
                        onChange={(event) => {
                          const from = Number(event.target.value);
                          if (!Number.isFinite(from)) return;
                          setRules(
                            panel.rules.map((one, at) => (at === index ? { ...one, from } : one)),
                          );
                        }}
                      />
                      <Select
                        value={rule.color}
                        onValueChange={(value) => {
                          const color = ruleColors.find((candidate) => candidate === value);
                          if (color)
                            setRules(
                              panel.rules.map((one, at) =>
                                at === index ? { ...one, color } : one,
                              ),
                            );
                        }}
                      >
                        <SelectTrigger
                          className="flex-1"
                          aria-label={t('editor.ruleColor', { position: index + 1 })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ruleColors.map((color) => (
                            <SelectItem key={color} value={color}>
                              <span
                                aria-hidden
                                className="size-3 rounded-full"
                                style={{ background: cssColor(color) }}
                              />
                              {/* i18n-dynamic: dashboards.editor.colors */}
                              {t(`editor.colors.${color}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('editor.removeRule', { position: index + 1 })}
                        onClick={() => {
                          setRules(panel.rules.filter((_, at) => at !== index));
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={panel.rules.length >= 8}
                  onClick={() => {
                    const last = panel.rules.at(-1);
                    setRules([
                      ...panel.rules,
                      { from: last ? last.from + 10 : 0, color: 'destructive' },
                    ]);
                  }}
                >
                  <Plus aria-hidden />
                  {t('editor.addRule')}
                </Button>
              </FieldSet>
            )}

            <Field>
              <FieldLabel htmlFor={`${formId}-size`}>{t('editor.size')}</FieldLabel>
              <Select
                value={`${String(panel.layout.w)}x${String(panel.layout.h)}`}
                onValueChange={(value) => {
                  const size = panelSizes.find((candidate) => candidate.id === value);
                  if (size)
                    update({
                      layout: {
                        ...panel.layout,
                        w: size.w,
                        h: size.h,
                        x: Math.min(panel.layout.x, 12 - size.w),
                      },
                    });
                }}
              >
                <SelectTrigger id={`${formId}-size`} className="w-full">
                  <SelectValue placeholder={t('editor.sizeCustom')} />
                </SelectTrigger>
                <SelectContent>
                  {panelSizes.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {/* i18n-dynamic: dashboards.editor.sizes */}
                      {t(`editor.sizes.${size.name}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldContent>
                <FieldDescription>{t('editor.sizeHint')}</FieldDescription>
              </FieldContent>
            </Field>
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('page.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending} aria-busy={pending}>
            {mode === 'add' ? t('editor.add') : t('page.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
