const {spawnSync} = require('child_process');
const {
  mkdirSync,
  rmdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} = require('fs');

// try {
//   rmdirSync(`temp`, {recursive: true, force: true});
// } catch (ex) {}
mkdirSync(`temp`, {recursive: true});

function writeIfChanged(filename, contents) {
  try {
    if (readFileSync(filename, `utf8`) === contents) {
      return;
    }
  } catch (ex) {
    if (ex.code !== 'ENOENT') {
      throw ex;
    }
  }
  console.info(`Writing ${filename}`);
  writeFileSync(filename, contents);
}
writeIfChanged(`temp/package.json`, readFileSync(`package.json`, `utf8`));
writeIfChanged(`temp/yarn.lock`, readFileSync(`yarn.lock`, `utf8`));

for (const pkg of readdirSync(`packages`)) {
  mkdirSync(`temp/packages/${pkg}`, {recursive: true});
  let pkgSrc;
  try {
    pkgSrc = readFileSync(`packages/${pkg}/package.json`, `utf8`);
  } catch (ex) {
    if (ex.code === 'ENOENT') {
      continue;
    }
    throw ex;
  }
  writeIfChanged(`temp/packages/${pkg}/package.json`, pkgSrc);
}

writeIfChanged(
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
    ...(process.env.CI ? [] : [`-it`]),
    `--memory`,
    `256mb`,
    `--memory-swap`,
    `256mb`,
    `--name`,
    `git-client`,
    `git-client`,
    `time`,
    `node`,
    `scripts/test-parse.js`,
    process.argv.slice(2),
  ],
  {
    stdio: `inherit`,
  },
);
