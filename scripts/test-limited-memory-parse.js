const {spawnSync} = require('child_process');
const {
  mkdirSync,
  rmdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} = require('fs');

rmdirSync(`temp`, {recursive: true, force: true});
mkdirSync(`temp`, {recursive: true});

writeFileSync(`temp/package.json`, readFileSync(`package.json`));
writeFileSync(`temp/yarn.lock`, readFileSync(`yarn.lock`));

for (const pkg of readdirSync(`packages`)) {
  mkdirSync(`temp/packages/${pkg}`, {recursive: true});
  let pkgSrc;
  try {
    pkgSrc = readFileSync(`packages/${pkg}/package.json`);
  } catch (ex) {
    if (ex.code === 'ENOENT') {
      continue;
    }
    throw ex;
  }
  writeFileSync(`temp/packages/${pkg}/package.json`, pkgSrc);
}

writeFileSync(
  `temp/Dockerfile`,
  [
    `FROM node:16-alpine`,
    `WORKDIR /app`,
    `ADD . /app`,
    `RUN yarn install && yarn cache clean`,
  ].join(`\n`),
);

function run(...args) {
  const proc = spawnSync(...args);
  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    console.error(`🚨🚨🚨 Process Exited With Code ${proc.status} 🚨🚨🚨`);
    process.exit(proc.status);
  }
}

run(`docker`, [`build`, `-t`, `git-client-deps`, `.`], {
  cwd: `temp`,
  stdio: `inherit`,
});

run(`docker`, [`build`, `-t`, `git-client`, `.`], {
  stdio: `inherit`,
});

run(
  `docker`,
  [
    `run`,
    `--rm`,
    `-it`,
    `--memory`,
    `256mb`,
    `--memory-swap`,
    `256mb`,
    `--name`,
    `git-client`,
    `git-client`,
    `node`,
    `scripts/test-parse.js`,
    process.argv.slice(2),
  ],
  {
    stdio: `inherit`,
  },
);
