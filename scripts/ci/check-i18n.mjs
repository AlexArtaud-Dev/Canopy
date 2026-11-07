#!/usr/bin/env node
// Fails when locales drift from the English source: missing or extra files, missing or extra keys,
// or translations whose ICU placeholders/tags differ from the English message.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const messagesDir = path.resolve(import.meta.dirname, '../../apps/web/messages');
const sourceLocale = 'en';
const targetLocales = ['fr', 'es'];

/** Flattens nested messages into `namespace.key.sub` → string. */
function flatten(value, prefix, out = new Map()) {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** Placeholder and tag names a translation must keep: `{time}`, `{count, plural, …}`, `<b>`. */
function tokens(message) {
  const names = new Set();
  for (const match of message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)) names.add(`{${match[1]}}`);
  for (const match of message.matchAll(/<([A-Za-z0-9_]+)>/g)) names.add(`<${match[1]}>`);
  return [...names].sort().join(' ');
}

async function loadLocale(locale) {
  const dir = path.join(messagesDir, locale);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const messages = new Map();
  for (const file of files) {
    const namespace = file.replace(/\.json$/, '');
    const content = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    flatten(content, namespace, messages);
  }
  return { files, messages };
}

const problems = [];
const source = await loadLocale(sourceLocale);

for (const locale of targetLocales) {
  const target = await loadLocale(locale);
  for (const file of source.files) {
    if (!target.files.includes(file)) problems.push(`${locale}: missing file ${file}`);
  }
  for (const file of target.files) {
    if (!source.files.includes(file)) problems.push(`${locale}: extra file ${file}`);
  }
  for (const [key, message] of source.messages) {
    const translated = target.messages.get(key);
    if (translated === undefined) {
      problems.push(`${locale}: missing key ${key}`);
    } else if (tokens(translated) !== tokens(message)) {
      problems.push(
        `${locale}: placeholders differ in ${key} ("${tokens(translated)}" vs "${tokens(message)}")`,
      );
    }
  }
  for (const key of target.messages.keys()) {
    if (!source.messages.has(key)) problems.push(`${locale}: extra key ${key}`);
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `i18n check passed: ${source.messages.size} keys × ${targetLocales.length + 1} locales`,
);
