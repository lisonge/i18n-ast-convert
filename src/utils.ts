import type parser from '@babel/parser';
import _traverse, { TraverseOptions } from '@babel/traverse';
import t from '@babel/types';
import type { ParentNode } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import MagicString from 'magic-string';
import fs from 'node:fs/promises';
import path from 'node:path';
import { htmlRegList, zhReg } from './config';
const traverse: typeof _traverse = Reflect.get(_traverse, 'default');

const spritReg = /\/{2,}/g;
export const posixPath = (str: string): string => {
  if (str.includes('\\')) {
    str = str.replaceAll('\\', '/');
  }
  if (str.includes('//')) {
    str = str.replaceAll(spritReg, '/');
  }
  return str;
};

export const normalizePath = (str: string): string => {
  str = posixPath(str);
  if (str.endsWith('/')) {
    str = str.slice(0, -1);
  }
  return str;
};

export async function* traverseDirectory(
  dir: string,
  skip?: (subDirectory: string) => boolean
) {
  const pathnames = (await fs.readdir(dir))
    .map((s) => posixPath(path.join(dir, s)))
    .reverse();
  while (pathnames.length > 0) {
    const pathname = pathnames.pop()!;
    const state = await fs.lstat(pathname);
    if (state.isFile()) {
      yield pathname;
    } else if (state.isDirectory() && !skip?.(pathname)) {
      pathnames.push(
        ...(await fs.readdir(pathname))
          .map((s) => posixPath(path.join(pathname, s)))
          .reverse()
      );
    }
  }
}

export const getBabelPlugins = (
  pathOrLang: string | undefined
): parser.ParserPlugin[] => {
  pathOrLang ||= 'js';
  const list: parser.ParserPlugin[] = ['decorators'];
  const ext = pathOrLang.includes('.')
    ? path.extname(pathOrLang).substring(1)
    : pathOrLang;
  if (ext === 'js') {
    // compatible with some js files
    list.push('jsx');
  } else if (ext === 'ts') {
    list.push('typescript');
  } else if (ext === 'jsx') {
    list.push('jsx');
  } else if (ext === 'tsx') {
    list.push('typescript', 'jsx');
  }
  return list;
};

export const hasZh = (
  content: string | undefined,
  start: number | undefined | null = 0,
  end: number | undefined | null = content?.length
): boolean => {
  if (!content) return false;
  start ??= 0;
  end ??= content.length;
  if (start === 0 && end === content.length) {
    return Boolean(content.match(zhReg));
  }
  for (let i = start; i < end; i++) {
    if (content[i].match(zhReg)) {
      return true;
    }
  }
  return false;
};

export const skipTraverseTsOpts: TraverseOptions = {
  TSModuleDeclaration(p) {
    p.skip();
  },
  InterfaceDeclaration(p) {
    p.skip();
  },
  TypeAlias(p) {
    p.skip();
  },
  TSTypeLiteral(p) {
    p.skip();
  },
  TSLiteralType(p) {
    p.skip();
  },
};

export const hasNodeZh = (node: t.Node | undefined | null | false): boolean => {
  if (!node) return false;
  let hasZh = Boolean(false);
  traverse(node, {
    noScope: true,
    StringLiteral(p) {
      if (p.node.value.match(zhReg)) {
        hasZh = true;
        p.stop();
      }
    },
    TemplateElement(p) {
      if (p.node.value.raw.match(zhReg)) {
        hasZh = true;
        p.stop();
      }
    },
    JSXText(p) {
      if (p.node.value.match(zhReg)) {
        hasZh = true;
        p.stop();
      }
    },
    ...skipTraverseTsOpts,
  });
  return hasZh;
};

export const hasChildNodeZh = (
  node: t.Node | undefined | null | false
): boolean => {
  if (!node) return false;
  if (!hasChildNode(node)) return false;
  if (t.isTemplateLiteral(node) && !node.expressions.length) return false;
  return hasNodeZh(node);
};

export const flatBinaryExpression = (
  node: t.Expression,
  collect: (node: t.BinaryExpression) => void
): t.Expression[] => {
  if (t.isBinaryExpression(node) && node.operator === '+' && hasNodeZh(node)) {
    collect(node);
    t.assertExpression(node.left);
    return flatBinaryExpression(node.left, collect).concat(
      flatBinaryExpression(node.right, collect)
    );
  }
  return [node];
};

export const countBy = <T>(arr: Iterable<T>, fn: (v: T) => boolean): number => {
  let count = 0;
  for (const v of arr) {
    if (fn(v)) {
      count++;
    }
  }
  return count;
};

export const hasChildNode = (
  node: t.Node | undefined | null | false
): boolean => {
  if (!node) return false;
  let hasChild = Boolean(false);
  traverse(node, {
    noScope: true,
    enter(p) {
      if (p.node !== node) {
        hasChild = true;
      }
      p.stop();
    },
  });
  return hasChild;
};

export const getTryNodeString = (node: t.Node): string | undefined => {
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0].value.raw;
  }
};

export const addMap = <K, V>(source: Map<K, V>, target: Map<K, V>) => {
  source.forEach((v, k) => {
    if (!target.has(k)) {
      target.set(k, v);
    }
  });
};

export const getI18nExp = (
  key: string,
  argsOrQuote?: string[] | boolean,
  quote = true
): string => {
  if (typeof argsOrQuote === 'boolean') {
    quote = argsOrQuote;
    argsOrQuote = undefined;
  }
  const q = quote ? "'" : '"';
  const literal = `${q}${key}${q}`;
  if (!argsOrQuote || argsOrQuote.length === 0) {
    return `$t(${literal})`;
  }
  return `$t(${literal}, [${argsOrQuote.join(', ')}])`;
};

export const addParentheses = (str: string): string => {
  str = str.trim();
  return `(${str})`;
};

export const removeParentheses = (str: string): string => {
  str = str.trim();
  if (str[0] !== '(' || str.at(-1) !== ')') {
    throw new Error(`Invalid parentheses: ${str}`);
  }
  return str.slice(1, -1);
};

export const getMiniWhitespaceText = (str: string): string => {
  const v = str.trim();
  if (!v) return '\x20';
  return [
    v[0] !== str[0] ? '\x20' : '',
    v,
    v.at(-1) !== str.at(-1) ? '\x20' : '',
  ].join('');
};

export const takeWhile = <T>(
  arr: Iterable<T>,
  fn: (v: T, i: number) => boolean
): T[] => {
  const result: T[] = [];
  let i = 0;
  for (const v of arr) {
    if (!fn(v, i)) break;
    result.push(v);
    i++;
  }
  return result;
};

const safeRun = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch (e) {
    return undefined;
  }
};

const isHtmlText = (str: string): boolean => {
  if (!str) return false;
  return htmlRegList.some((v) => str.match(v));
};

function* traverseHtml2Node(node: ParentNode) {
  const stack = node.children.toReversed();
  while (stack.length) {
    const child = stack.pop()!;
    yield child;
    if (DomUtils.hasChildren(child)) {
      stack.push(...child.children.toReversed());
    }
  }
}

export const handleStringInnerHtml = (
  content: string,
  program: parser.ParseResult<t.File>
): string | undefined => {
  const nodes: (t.StringLiteral | t.TemplateLiteral)[] = [];
  const usedNodes = new Set<t.TemplateElement>();
  const templateNodes: t.TemplateElement[] = [];
  traverse(program, {
    StringLiteral(p) {
      if (!hasZh(p.node.value)) return;
      if (!isHtmlText(p.node.value)) return;
      nodes.push(p.node);
    },
    TemplateElement(p) {
      if (usedNodes.has(p.node)) return;
      if (!hasZh(p.node.value.raw)) return;
      if (!isHtmlText(p.node.value.raw)) return;
      templateNodes.push(p.node);
    },
    TemplateLiteral(p) {
      if (p.node.expressions.length) return;
      const node = p.node.quasis[0];
      if (!hasZh(node.value.raw)) return;
      if (!isHtmlText(node.value.raw)) return;
      nodes.push(p.node);
      usedNodes.add(p.node.quasis[0]);
    },
    ...skipTraverseTsOpts,
  });
  if (nodes.length === 0 && templateNodes.length === 0) return;
  const ms = new MagicString(content);
  let flag = Boolean(false);
  nodes.forEach((node) => {
    const nodeContent = t.isStringLiteral(node)
      ? node.value
      : node.quasis[0].value.raw;
    const doc = safeRun(() =>
      parseDocument(nodeContent, {
        withStartIndices: true,
        withEndIndices: true,
      })
    );
    if (!doc) return;
    const quote = content[node.start!];
    const offset = node.start! + 1;
    for (const child of traverseHtml2Node(doc)) {
      if (!DomUtils.isText(child)) continue;
      if (!hasZh(child.data)) continue;
      const newData = [quote, '+', JSON.stringify(child.data), '+', quote].join(
        ''
      );
      const newStart = child.startIndex! + offset;
      const newEnd = child.endIndex! + 1 + offset;
      ms.update(newStart, newEnd, newData);
      flag = true;
    }
  });
  templateNodes.forEach((node) => {
    const nodeContent = node.value.raw;
    const doc = safeRun(() =>
      parseDocument(nodeContent, {
        withStartIndices: true,
        withEndIndices: true,
      })
    );
    if (!doc) return;
    const offset = node.start!;
    for (const child of traverseHtml2Node(doc)) {
      if (!DomUtils.isText(child)) continue;
      if (!hasZh(child.data)) continue;
      const newData = ['${', JSON.stringify(child.data),'}'].join(
        ''
      );
      const newStart = child.startIndex! + offset;
      const newEnd = child.endIndex! + 1 + offset;
      ms.update(newStart, newEnd, newData);
      flag = true;
    }
  });
  if (!flag) return;
  return ms.toString();
};
