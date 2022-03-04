const fs = require('fs');
const {parsePackfile} = require('../packages/packfile');
const gitObj = require('../packages/objects');

async function parse() {
  const filename = process.argv[2] ?? (await ask.input(`filename`));
  let count = 0;
  let i = 0;
  await parsePackfile(fs.readFileSync(filename), (entry) => {
    count++;
    i++;
    process.stdout.write(`.`);
    if (i === 100) {
      process.stdout.write(`\n`);
      i = 0;
    }
    gitObj.decodeObject(entry.body);
  });
}

parse().catch((ex) => {
  console.error(`Request failed`);
  console.error(ex.stack);
  process.exit(1);
});
