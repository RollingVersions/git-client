const fs = require('fs');
const {Transform} = require('stream');
const ask = require('interrogator');
const {startChain, param, parse} = require('parameter-reducers');
const {PackfileParserStream} = require('../packages/packfile');
const gitObj = require('../packages/objects');

function startCheckingLiveness() {
  let lastPing = Date.now();
  const pinger = setInterval(() => {
    const now = Date.now();
    const delay = now - lastPing - 30;
    lastPing = now;
    if (delay > 30) {
      process.stdout.write(`🚨${delay}`);
    }
  }, 30);
  return () => clearInterval(pinger);
}
async function run() {
  const {
    storeMode = 'compressed',
    filename = await ask.input(`filename`),
  } = parse(
    startChain()
      .addParam(param.string(['--mode'], 'storeMode'))
      .addParam(param.positionalString('filename')),
    process.argv.slice(2),
  ).extract();

  if (!['raw', 'compressed'].includes(storeMode)) {
    throw new Error(`Expected store mode to be raw or compressed`);
  }

  const START = Date.now();
  let count = 0;
  let i = 0;
  let j = 0;
  let line = 0;
  console.info(`each . is 1000 entries, each line is 10,000 entries`);
  const stopCheckingLiveness = startCheckingLiveness();
  await new Promise((resolve, reject) => {
    fs.createReadStream(filename)
      .on(`error`, reject)
      .pipe(new PackfileParserStream({storeMode}))
      .on('error', reject)
      .pipe(
        new Transform({
          writableObjectMode: true,
          highWaterMark: 5,
          transform(entry, _, cb) {
            count++;
            i++;
            if (i === 1000) {
              i = 0;
              process.stdout.write(`.`);
              j++;
              if (j === 10) {
                j = 0;
                process.stdout.write(
                  ` ${(line++).toString().padStart(6, ` `)} ${(
                    Date.now() - START
                  )
                    .toString()
                    .padStart(6, ` `)}ms\n`,
                );
              }
            }

            // setTimeout(() => {
            gitObj.decodeObject(entry.body);
            cb(null, Buffer.concat([Buffer.from(entry.type), entry.body]));
            // }, 10);
          },
        }),
      )
      .on('error', reject)
      .pipe(fs.createWriteStream(`temp/raw-data-stream.dat`))
      .on('error', reject)
      .on('close', resolve);
  });

  stopCheckingLiveness();

  process.stdout.write(`\n\n`);
  console.warn(`Parsed ${count} entries`);
}

run().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
