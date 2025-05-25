import { program } from 'commander';
import logUpdate from 'log-update';
import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { esExtReg, ignoreDirs, vueExtReg } from './config';
import { handleEsFile } from './es';
import { addMap, hasZh, normalizePath, traverseDirectory } from './utils';
import { handleVueFile } from './vue';
import process from 'node:process';

const cliOpts = program
  .requiredOption('-d,--dir <dir>', 'project directory')
  .option('-o,--output <output>', 'output file name', 'zh-CN.json')
  .option('-t <t>', 't import', `import $t from '@/i18n';`)
  .parse()
  .opts<InputCliOptions>();

const dir = normalizePath(cliOpts.dir);
const output = normalizePath(cliOpts.output);
const errorList: HandleError[] = [];
let visitCount = 0;
let doneCount = 0;
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
        `done: ${pc.green(doneCount)}`,
        errorList.length ? `error: ${pc.red(errorList.length)}` : '',
        `word: ${pc.green(zhMap.size)}`,
      ]
        .filter(Boolean)
        .join(', '),
      p ? `${getFrameChar()} ${pc.dim(p)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
};
const zhMap = new Map<string, string>();
for await (const filePath of traverseDirectory(dir, (p) => {
  return ignoreDirs.includes(path.basename(p));
})) {
  if (!filePath.match(esExtReg) && !filePath.match(vueExtReg)) continue;
  const content = await fs.readFile(filePath, 'utf-8');
  if (!hasZh(content)) continue;
  visitCount++;
  const relativePath = filePath.substring(dir.length + 1);
  logStatus(relativePath);
  const result = await (async () => {
    if (filePath.match(esExtReg)) {
      return handleEsFile(filePath, content, cliOpts);
    } else if (filePath.match(vueExtReg)) {
      return handleVueFile(filePath, content, cliOpts);
    }
  })().catch((error) => {
    errorList.push({ filePath, error });
  });
  if (!result) continue;
  addMap(result.zhMap, zhMap);
  await fs.writeFile(filePath, result.code, 'utf-8');
  doneCount++;
}
logStatus();

if (errorList.length) {
  const errorFileName = 'error.log';
  await fs.writeFile(
    path.join(dir, errorFileName),
    [
      errorList
        .map((v) => {
          return [v.filePath, v.error.stack].join('\n');
        })
        .join('\n\n'),
      '\n',
    ],
    'utf-8'
  );
  console.log('error output: ' + pc.red(errorFileName));
}

if (zhMap.size === 0) {
  console.log(pc.yellow('no word found'));
  console.log();
  process.exit();
}

await fs.writeFile(
  path.join(dir, output),
  JSON.stringify(Object.fromEntries(zhMap), undefined, 2),
  'utf-8'
);
console.log('word output:', pc.green(output));
console.log();
