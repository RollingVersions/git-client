const {spawnSync} = require('child_process');
const {createHash} = require('crypto');
const {
  mkdirSync,
  rmdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} = require('fs');
const {startChain, param, parse} = require('parameter-reducers');
const ask = require('interrogator');

async function run() {
  const {
    memory = '300mb',
    storeMode = 'compressed',
    filename = await ask.input(`filename`),
  } = parse(
    startChain()
      .addParam(param.string(['--memory'], 'memory'))
      .addParam(param.string(['--mode'], 'storeMode'))
      .addParam(param.positionalString('filename')),
    process.argv.slice(2),
  ).extract();

  if (!['raw', 'compressed'].includes(storeMode)) {
    throw new Error(`Expected store mode to be raw or compressed`);
  }

  try {
    rmdirSync(`temp`, {recursive: true, force: true});
  } catch (ex) {}
  mkdirSync(`temp`, {recursive: true});

  const hash = createHash(`sha1`);
  function writeWithHash(filename, contents) {
    writeFileSync(filename, contents);
    hash.update(contents);
  }
  writeWithHash(`temp/package.json`, readFileSync(`package.json`));
  writeWithHash(`temp/yarn.lock`, readFileSync(`yarn.lock`));

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
    writeWithHash(`temp/packages/${pkg}/package.json`, pkgSrc);
  }

  writeWithHash(
    `temp/Dockerfile`,
    Buffer.from(
      [
        `FROM node:16-alpine`,
        `WORKDIR /app`,
        `ADD . /app`,
        `RUN yarn install && yarn cache clean`,
      ].join(`\n`),
    ),
  );

  const depsId = hash.digest(`hex`);

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

  function evaluateSync(...args) {
    const result = spawnSync(...args);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(result.stderr.toString('utf-8'));
      throw new Error(`${cmd} exited with code ${result.status}`);
    }
    return result.stdout.toString('utf8');
  }

  function getLocalImages() {
    return evaluateSync('docker', ['image', 'ls', '--format', '{{json .}}'])
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((v) => {
        try {
          return JSON.parse(v);
        } catch (ex) {
          return null;
        }
      })
      .filter(Boolean)
      .map((v) => [
        v.Repository,
        v.Tag,
        new Date(`${v.CreatedAt.split(' ')[0]}T${v.CreatedAt.split(' ')[1]}`),
      ]);
  }
  if (
    !getLocalImages().some(
      ([name, tag]) => name === `git-client-deps` && tag === depsId,
    )
  ) {
    run(`docker`, [`build`, `-t`, `git-client-deps:${depsId}`, `.`], {
      cwd: `temp`,
      stdio: `inherit`,
    });
  }
  run(`docker`, [`tag`, `git-client-deps:${depsId}`, `git-client-deps:latest`]);

  run(`docker`, [`build`, `-t`, `git-client`, `.`], {
    stdio: `inherit`,
  });

  console.log(
    `$ test-limited-memory-parse --memory ${memory} --mode ${storeMode} ${filename}`,
  );
  run(
    `docker`,
    [
      `run`,
      `--rm`,
      ...(process.env.CI ? [] : [`-it`]),
      `--memory`,
      memory,
      `--memory-swap`,
      memory,
      `--name`,
      `git-client`,
      `git-client`,
      `time`,
      `node`,
      `scripts/test-parse.js`,
      `--mode`,
      storeMode,
      filename,
    ],
    {
      stdio: `inherit`,
    },
  );
}
run().catch((ex) => {
  console.error(ex.stack);
  process.exit(1);
});
