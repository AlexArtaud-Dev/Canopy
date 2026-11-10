'use server';

import { randomUUID } from 'node:crypto';

import {
  inspectPlugin,
  listPlugins,
  uninstallPlugin as uninstallEnginePlugin,
  updatePlugin as updateEnginePlugin,
  type Plugin,
  type PluginList,
} from '@canopy/contracts';
import { createClient } from '@canopy/contracts/client';
import { zError, zPlugin } from '@canopy/contracts/zod';

import { parseServerEnv } from '@/shared/config/env';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError, isErrorCode } from '@/shared/lib/errors';
import { adminPermission } from '@/features/access/access.utils';
import { authorize } from '@/features/auth';
import { engineTokenFor } from '@/features/files/server/engine-client';
import { getSettings, updateSetting } from '@/features/settings/server/settings-store';

import { pluginsSettings } from '../plugins.settings';
import {
  findAsset,
  flagsSchema,
  formatRepos,
  installSchema,
  manifestAssetName,
  multipartFrame,
  parseRepos,
  pluginIdSchema,
  repoFromInput,
  sameRepo,
  sourceInputSchema,
  toReleaseView,
  type GithubRelease,
  type RepoView,
} from '../plugins.utils';
import { downloadBinary, downloadText, latestRelease } from './github';

/** Plugins are administrators' business; the engine checks it again on every call. */
async function adminEngine() {
  const session = await authorize(adminPermission);
  const token = await engineTokenFor(session);
  const baseUrl = parseServerEnv(process.env).CANOPY_ENGINE_URL;
  return { session, token, baseUrl, client: createClient({ baseUrl, auth: () => token }) };
}

function refused(response: Response | undefined, error: { code: string } | undefined): never {
  if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  throw new AppBaseError(error?.code ?? 'system.unexpected', 'engine refused the plugin change');
}

async function allowedRepos(): Promise<string[]> {
  const { values } = await getSettings('plugins', pluginsSettings);
  return parseRepos(values.allowedRepos);
}

export async function loadPlugins(): Promise<ActionResult<PluginList>> {
  return runAction(async () => {
    const { client } = await adminEngine();
    const { data, error, response } = await listPlugins({ client });
    if (!data) refused(response, error);
    return data;
  });
}

function codeOf(error: unknown): string {
  return error instanceof AppBaseError && isErrorCode(error.code)
    ? error.code
    : 'plugins.github_unavailable';
}

/** The latest release of every allowlisted repository, read from GitHub in parallel. */
export async function loadReleases(): Promise<ActionResult<RepoView[]>> {
  return runAction(async () => {
    await authorize(adminPermission);
    const repos = await allowedRepos();
    return Promise.all(
      repos.map(async (repo): Promise<RepoView> => {
        try {
          return { repo, release: toReleaseView(await latestRelease(repo)), error: null };
        } catch (error) {
          return { repo, release: null, error: codeOf(error) };
        }
      }),
    );
  });
}

function requiredAsset(release: GithubRelease, name: string) {
  const asset = findAsset(release, name);
  if (!asset) throw new AppBaseError('plugins.incomplete_release', `release lacks ${name}`);
  return asset;
}

/** The manifest and checksum texts, then the binary bytes, as one streamed multipart body. */
function installBody(
  boundary: string,
  manifest: string,
  checksums: string,
  binary: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { head, tail } = multipartFrame(
    boundary,
    [
      ['manifest', manifest],
      ['checksums', checksums],
    ],
    'binary',
  );
  const reader = binary.getReader();
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(head));
        return;
      }
      const { done, value } = await reader.read();
      if (!done) {
        controller.enqueue(value);
        return;
      }
      controller.enqueue(encoder.encode(tail));
      controller.close();
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

/**
 * Installs (or updates to) the latest release of an allowlisted repository: the engine checks the
 * manifest first, so no binary is downloaded for a release it would refuse, then verifies the
 * binary's checksum before activating anything.
 */
export async function installPlugin(input: unknown): Promise<ActionResult<Plugin>> {
  return runAction(async () => {
    const parsed = installSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid repository');
    const { client, token, baseUrl } = await adminEngine();
    const repo = (await allowedRepos()).find((allowed) => sameRepo(allowed, parsed.data.repo));
    if (!repo) throw new AppBaseError('plugins.repo_not_allowed', 'repository not allowlisted');

    const release = await latestRelease(repo);
    const manifest = await downloadText(
      requiredAsset(release, manifestAssetName).browser_download_url,
      repo,
    );
    const inspected = await inspectPlugin({ client, body: { manifest } });
    if (!inspected.data) refused(inspected.response, inspected.error);
    if (!sameRepo(inspected.data.repo, repo)) {
      throw new AppBaseError('plugins.invalid_manifest', 'manifest names another repository');
    }
    const checksums = await downloadText(
      requiredAsset(release, inspected.data.checksumsAsset).browser_download_url,
      repo,
    );
    const binary = await downloadBinary(
      requiredAsset(release, inspected.data.binaryAsset).browser_download_url,
      repo,
    );

    const boundary = `canopy-${randomUUID()}`;
    // Streams the request body; Node needs `duplex` for that.
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: installBody(boundary, manifest, checksums, binary),
      duplex: 'half',
    };
    const response = await fetch(`${baseUrl}/v1/plugins`, init);
    const body: unknown = await response.json().catch(() => undefined);
    const installed = zPlugin.safeParse(body);
    if (response.status !== 201 || !installed.success) {
      const error = zError.safeParse(body);
      refused(response, error.success ? error.data : undefined);
    }
    return installed.data;
  });
}

export async function updatePlugin(input: unknown): Promise<ActionResult<Plugin>> {
  return runAction(async () => {
    const parsed = flagsSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid flags');
    const { client } = await adminEngine();
    const { id, ...flags } = parsed.data;
    const { data, error, response } = await updateEnginePlugin({
      client,
      path: { pluginId: id },
      body: flags,
    });
    if (!data) refused(response, error);
    return data;
  });
}

export async function uninstallPlugin(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = pluginIdSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid plugin');
    const { client } = await adminEngine();
    const { error, response } = await uninstallEnginePlugin({
      client,
      path: { pluginId: parsed.data.id },
    });
    if (!response?.ok) refused(response, error);
    return null;
  });
}

/** Saves the allowlist (audited as `settings.update`, like an edit on the settings page). */
async function saveRepos(repos: readonly string[], actorId: string): Promise<void> {
  await updateSetting('plugins', pluginsSettings, 'allowedRepos', formatRepos(repos), actorId);
}

/**
 * Adds a repository to the allowlist once its latest release is checked: it must carry a plugin
 * manifest the engine accepts, naming this very repository. Nothing is installed.
 */
export async function addSource(input: unknown): Promise<ActionResult<RepoView>> {
  return runAction(async () => {
    const parsed = sourceInputSchema.safeParse(input);
    const repo = parsed.success ? repoFromInput(parsed.data.repo) : null;
    if (!repo) throw new AppBaseError('plugins.invalid_repo', 'not a GitHub repository');
    const { client, session } = await adminEngine();
    const repos = await allowedRepos();
    if (repos.some((allowed) => sameRepo(allowed, repo))) {
      throw new AppBaseError('plugins.repo_already_allowed', 'already in the list');
    }
    const release = await latestRelease(repo);
    const manifest = await downloadText(
      requiredAsset(release, manifestAssetName).browser_download_url,
      repo,
    );
    const inspected = await inspectPlugin({ client, body: { manifest } });
    if (!inspected.data) refused(inspected.response, inspected.error);
    if (!sameRepo(inspected.data.repo, repo)) {
      throw new AppBaseError('plugins.invalid_manifest', 'manifest names another repository');
    }
    await saveRepos([...repos, repo], session.user.id);
    return { repo, release: toReleaseView(release), error: null };
  });
}

/** Removes a repository from the allowlist; plugins installed from it stay installed. */
export async function removeSource(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = sourceInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid repository');
    const { session } = await adminEngine();
    const repos = await allowedRepos();
    const kept = repos.filter((allowed) => !sameRepo(allowed, parsed.data.repo));
    if (kept.length !== repos.length) await saveRepos(kept, session.user.id);
    return null;
  });
}
