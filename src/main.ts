import { program } from 'commander';
import logUpdate from 'log-update';
import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { esExtReg, ignoreDirs, vueExtReg } from './config';
import { handleEsFile } from './es';
import { addMap, normalizePath, traverseDirectory } from './utils';
import { handleVueFile } from './vue';
import process from 'node:process';

const cliOpts = program
  .requiredOption('-d, --dir <dir>', 'project directory')
  .option('-o, --output <output>', 'output file name', 'zh-CN.json')
  .parse()
  .opts<InputCliOptions>();

const dir = normalizePath(cliOpts.dir);
const output = normalizePath(cliOpts.output);
console.log('dir: ' + pc.green(dir));
const getFrameChar = (() => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  return () => frames[i++ % frames.length];
})();
const logStatus = (p?: string) => {
  logUpdate(
    [
      [
        `visit: ${pc.green(visitCount)}`,
        `success: ${pc.green(successCount)}`,
        `word: ${pc.green(i18nMap.size)}`,
      ].join(', '),
      p ? `${getFrameChar()} ${pc.dim(p)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
};
let visitCount = 0;
let successCount = 0;
const i18nMap = new Map<string, string>();
for await (const filePath of traverseDirectory(dir, (p) => {
  return ignoreDirs.includes(path.basename(p));
})) {
  if (!filePath.match(esExtReg) && !filePath.match(vueExtReg)) continue;
  visitCount++;
  const relativePath = filePath.substring(dir.length + 1);
  logStatus(relativePath);
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
  successCount++;
}
logStatus();

if (i18nMap.size === 0) {
  console.log(pc.yellow('no word found'));
  console.log();
  process.exit();
}

await fs.writeFile(
  path.join(dir, output),
  JSON.stringify(Object.fromEntries(i18nMap), undefined, 2),
  'utf-8'
);
console.log('output:', pc.green(output));
console.log();
