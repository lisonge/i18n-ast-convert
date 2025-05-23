export const ignoreDirs = `
node_modules
dist
build
public
.vscode
.idea
.git
`
  .trim()
  .split('\n');

export const esExtReg = /\.(js|jsx|ts|tsx)$/;
export const vueExtReg = /\.vue$/;
export const zhReg = /[\u4e00-\u9fa5]/g;
