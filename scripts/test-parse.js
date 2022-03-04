const fs = require('fs');
const {parsePackfile} = require('../packages/packfile');
const gitObj = require('../packages/objects');

const START = Date.now();
async function parse() {
  const filename = process.argv[2] ?? (await ask.input(`filename`));
  let count = 0;
  let i = 0;
  let j = 0;
  let line = 0;
  console.info(`each . is 1000 entries, each line is 10,000 entries`);
  await parsePackfile(fs.readFileSync(filename), (entry) => {
    count++;
    i++;
    if (i === 1000) {
      i = 0;
      process.stdout.write(`.`);
      j++;
      if (j === 10) {
        j = 0;
        process.stdout.write(
          ` ${(line++).toString().padStart(6, ` `)} ${(Date.now() - START)
            .toString()
            .padStart(6, ` `)}ms\n`,
        );
      }
    }
    gitObj.decodeObject(entry.body);
  });

  process.stdout.write(`\n\n`);
  console.warn(`Parsed ${count} entries`);
}

parse().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
