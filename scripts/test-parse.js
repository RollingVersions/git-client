const fs = require('fs');
const {PackfileParserStreamV2} = require('../packages/packfile');
const gitObj = require('../packages/objects');
const {Transform} = require('stream');

const START = Date.now();
async function parse() {
  const filename = process.argv[2] ?? (await ask.input(`filename`));
  let count = 0;
  let i = 0;
  let j = 0;
  let line = 0;
  console.info(`each . is 1000 entries, each line is 10,000 entries`);
  const entries = new PackfileParserStreamV2(fs.readFileSync(filename));
  await new Promise((resolve, reject) => {
    entries
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

            gitObj.decodeObject(entry.body);
            cb(null, Buffer.concat([Buffer.from(entry.type), entry.body]));
          },
        }),
      )
      .on('error', reject)
      .pipe(fs.createWriteStream(`temp/raw-data-stream.dat`))
      .on('error', reject)
      .on('close', resolve);
  });

  process.stdout.write(`\n\n`);
  console.warn(`Parsed ${count} entries`);
}

parse().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
