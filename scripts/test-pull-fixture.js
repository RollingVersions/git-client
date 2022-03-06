const fs = require('fs');
const {URL} = require('url');
const ask = require('interrogator');
const chalk = require('chalk');
const git = require('../packages/http');
const gitObj = require('../packages/objects');

async function getHttpHandler() {
  // const accessToken = await getAppTokenForRepo(repo, secrets);
  // const headerValue = `Basic ${Buffer.from(
  //   `x-access-token:${accessToken}`,
  // ).toString(`base64`)}`;
  return {
    ...git.DEFAULT_HTTP_HANDLER,
    createHeaders(url) {
      const headers = git.DEFAULT_HTTP_HANDLER.createHeaders(url);

      // https://docs.github.com/en/developers/apps/authenticating-with-github-apps#http-based-git-access-by-an-installation
      // x-access-token:<token>
      // headers.set('Authorization', headerValue);

      return headers;
    },
  };
}

async function pullRepo() {
  const owner = process.argv[2] ?? (await ask.input(`owner`));
  const name = process.argv[3] ?? (await ask.input(`name`));

  const repo = {owner, name};

  const http = await getHttpHandler();
  const repoURL = new URL(`https://github.com/${repo.owner}/${repo.name}.git`);

  const start = Date.now();
  console.warn(chalk.cyan(`git_init`), `Git init request ${repoURL.href}`);
  const {capabilities: serverCapabilities} = await git.initialRequest(repoURL, {
    http,
    agent: 'rollingversions.com',
  });

  console.warn(chalk.cyan(`git_lsrefs`), `Git ls refs request ${repoURL.href}`);
  const remoteRefs = await git.lsRefs(
    repoURL,
    {
      refPrefix: ['refs/heads/', 'refs/tags/', 'refs/pull/'],
    },
    {
      http,
      agent: 'rollingversions.com',
      serverCapabilities,
    },
  );
  for (const ref of remoteRefs) {
    console.warn(`${ref.refName} ${ref.objectID}`);
  }

  console.warn(
    chalk.cyan(`git_fetch_objects`),
    `Git fetch request ${repoURL.href}`,
  );
  const fetchResponse = await git.fetchObjects(
    repoURL,
    {
      want: [...new Set(remoteRefs.map((ref) => ref.objectID))],
      filter: [git.treeDepth(0)],
    },
    {
      http,
      agent: 'rollingversions.com',
      serverCapabilities,
      raw: true,
    },
  );

  await new Promise((resolve, reject) => {
    fetchResponse
      .on('progress', (progress) => console.warn(progress))
      .on('error', reject)
      .pipe(fs.createWriteStream(`scripts/packfiles/${owner}-${name}.dat`))
      .on('error', reject)
      .on('close', resolve);
  });

  const end = Date.now();
  console.log(chalk.green(`Pull duration: ${end - start}`));
  console.log(`Packfile written to "scripts/packfiles/${owner}-${name}.dat"`);
}

pullRepo().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
