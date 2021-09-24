const fs = require('fs');
const {URL} = require('url');
const {default: GitHubClient, auth} = require('@github-graph/api');
const ask = require('interrogator');
const git = require('../packages/http');
const gitObj = require('../packages/objects');

function getAppClient({APP_ID, PRIVATE_KEY}) {
  return new GitHubClient({
    auth: auth.createAppAuth({
      appId: APP_ID,
      privateKey: PRIVATE_KEY,
    }),
  });
}

async function getAppTokenForRepo({owner, name}, {APP_ID, PRIVATE_KEY}) {
  const installation = await getAppClient({
    APP_ID,
    PRIVATE_KEY,
  }).rest.apps.getRepoInstallation({
    owner,
    repo: name,
  });
  if (installation.status !== 200) {
    throw new Error(
      `Rolling Versions does not seem to be installed for ${owner}`,
    );
  }
  const installationId = installation.data.id;
  const appAuth = auth.createAppAuth({
    appId: APP_ID,
    privateKey: PRIVATE_KEY,
    installationId,
  });
  const authResult = await appAuth({type: `installation`, installationId});
  return authResult.token;
}

async function getHttpHandler(repo, secrets) {
  const accessToken = await getAppTokenForRepo(repo, secrets);
  const headerValue = `Basic ${Buffer.from(
    `x-access-token:${accessToken}`,
  ).toString(`base64`)}`;
  return {
    ...git.DEFAULT_HTTP_HANDLER,
    createHeaders(url) {
      const headers = git.DEFAULT_HTTP_HANDLER.createHeaders(url);

      // https://docs.github.com/en/developers/apps/authenticating-with-github-apps#http-based-git-access-by-an-installation
      // x-access-token:<token>
      headers.set('Authorization', headerValue);

      return headers;
    },
  };
}

async function pullRepo() {
  const APP_ID = fs.readFileSync(`secrets/app_id`, `utf8`);
  const PRIVATE_KEY = fs.readFileSync(`secrets/private_key`, `utf8`);
  const secrets = {APP_ID, PRIVATE_KEY};

  const owner = process.argv[2] ?? (await ask.input(`owner`));
  const name = process.argv[3] ?? (await ask.input(`name`));
  const mode =
    process.argv[4] ?? (await ask.list(`mode?`, [`commits`, `tree`]));
  if (![`commits`, `tree`].includes(mode)) {
    console.error(`Invalid mode`);
    return process.exit(1);
  }
  const headCommit = process.argv[5];

  const repo = {owner, name};

  const http = await getHttpHandler(repo, secrets);
  const repoURL = new URL(`https://github.com/${repo.owner}/${repo.name}.git`);

  const start = Date.now();
  console.warn(`git_init`, `Git init request ${repoURL.href}`);
  const {capabilities: serverCapabilities} = await git.initialRequest(repoURL, {
    http,
    agent: 'rollingversions.com',
  });

  console.warn(`git_lsrefs`, `Git ls refs request ${repoURL.href}`);
  const remoteRefs = headCommit
    ? [{objectID: headCommit}]
    : await git.lsRefs(
        repoURL,
        {
          // TODO: what do we need here?
          // symrefs: true,
          refPrefix:
            mode === 'tree'
              ? ['refs/heads/master', 'refs/heads/main']
              : ['refs/heads/', 'refs/tags/', 'refs/pull/'],
        },
        {
          http,
          agent: 'rollingversions.com',
          serverCapabilities,
        },
      );
  for (const ref of remoteRefs) {
    console.warn(`ref:`, ref);
  }

  console.warn(`git_fetch_objects`, `Git fetch request ${repoURL.href}`);
  const fetchResponse = await git.fetchObjects(
    repoURL,

    mode === 'tree'
      ? {
          want: [...new Set(remoteRefs.map((ref) => ref.objectID))],
          have: [],
          filter: [git.blobNone(0)],
          deepen: 1,
        }
      : {
          want: [...new Set(remoteRefs.map((ref) => ref.objectID))],
          have: [],
          filter: [git.treeDepth(0)],
        },
    {
      http,
      agent: 'rollingversions.com',
      serverCapabilities,
    },
  );
  const trees = new Map();
  let rootHash = ``;
  await new Promise((resolve, reject) => {
    fetchResponse
      .on(`data`, (entry) => {
        if (gitObj.objectIsCommit(entry.body)) {
          const commit = gitObj.decodeObject(entry.body);
          console.warn(`${entry.hash} ${commit.body.message}`);
          headTreeSha = commit.body.tree;
          rootHash = commit.body.tree;
        }
        if (gitObj.objectIsTree(entry.body)) {
          const tree = gitObj.decodeObject(entry.body);
          trees.set(entry.hash, tree.body);
        }
      })
      .on(`error`, reject)
      .on(`end`, () => resolve());
  });
  if (mode === `tree`) {
    const printTree = (hash, path) => {
      const tree = trees.get(hash);
      for (const [name, {mode, hash}] of Object.entries(tree)) {
        console.log(`${path}/${name} ${gitObj.Mode[mode]} ${hash}`);

        if (mode === gitObj.Mode.tree) {
          printTree(hash, `${path}/${name}`);
        }
      }
    };
    printTree(rootHash, ``);
  }
  const end = Date.now();
  console.log(`Pull duration: ${end - start}`);
}

pullRepo().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
