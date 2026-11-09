#!/usr/bin/env node
// Commits files to a new branch through GitHub's API, so the commit is signed by GitHub (main
// requires signed commits and a workflow has no signing key).
// Usage: node scripts/release/push-commit.mjs <branch> <headline> <file>...
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo), BASE_SHA (the commit to branch from).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [branch, headline, ...files] = process.argv.slice(2);
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository, BASE_SHA: base } = process.env;
if (!branch || !headline || files.length === 0 || !token || !repository || !base) {
  console.error('Usage: node scripts/release/push-commit.mjs <branch> <headline> <file>...');
  console.error('Env: GITHUB_TOKEN, GITHUB_REPOSITORY, BASE_SHA');
  process.exit(2);
}

async function github(url, body) {
  const response = await fetch(`https://api.github.com${url}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'canopy-release',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.errors) {
    console.error(
      `GitHub refused ${url}: ${response.status} ${JSON.stringify(data.errors ?? data.message)}`,
    );
    process.exit(1);
  }
  return data;
}

await github(`/repos/${repository}/git/refs`, { ref: `refs/heads/${branch}`, sha: base });

const root = path.resolve(import.meta.dirname, '../..');
const additions = await Promise.all(
  files.map(async (file) => ({
    path: file,
    contents: (await readFile(path.resolve(root, file))).toString('base64'),
  })),
);
const result = await github('/graphql', {
  query: `mutation ($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) { commit { oid } }
  }`,
  variables: {
    input: {
      branch: { repositoryNameWithOwner: repository, branchName: branch },
      message: { headline },
      expectedHeadOid: base,
      fileChanges: { additions },
    },
  },
});
console.log(result.data.createCommitOnBranch.commit.oid);
