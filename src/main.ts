import { program } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { esExtReg, ignoreDirs, vueExtReg } from './config';
import { handleEsFile } from './es';
import { addMap, normalizeDir, traverseDirectory } from './utils';
import { handleVueFile } from './vue';
import pc from 'picocolors';

const cliOpts = program
  .requiredOption('-d, --dir <dir>', 'project directory')
  .parse()
  .opts<InputCliOptions>();

const dir = normalizeDir(cliOpts.dir);
console.log(pc.yellow(`start`));
console.log(`dir: ` + pc.green(dir));

const i18nMap = new Map<string, string>();
for await (const filePath of traverseDirectory(dir, (p) => {
  return ignoreDirs.includes(path.basename(p));
})) {
  if (!filePath.match(esExtReg) && !filePath.match(vueExtReg)) continue;
  const relativePath = filePath.substring(dir.length + 1);
  console.log(`-> ` + relativePath);
  const result = await (async () => {
    if (filePath.match(esExtReg)) {
      return await handleEsFile(filePath);
    } else if (filePath.match(vueExtReg)) {
      return await handleVueFile(filePath);
    }
  })();
  if (!result) continue;
  addMap(result.i18nMap, i18nMap);
  await fs.writeFile(filePath, result.code, 'utf-8');
}

await fs.writeFile(
  path.join(dir, 'i18n.json'),
  JSON.stringify(Object.fromEntries(i18nMap), undefined, 2),
  'utf-8'
);
console.log('file:', pc.green('i18n.json'));
console.log('size:', pc.gray(i18nMap.size));
console.log(pc.yellow('done'));
