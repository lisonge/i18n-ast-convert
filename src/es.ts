import parser from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import _traverse from '@babel/traverse';
import t from '@babel/types';
import MagicString from 'magic-string';
import fs from 'node:fs/promises';
import getKeyFromStr from './key';
import {
  addMap,
  flatBinaryExpression,
  getBabelPlugins,
  getI18nExp,
  getMiniWhitespaceText,
  getTryNodeString,
  hasChildNodeZh,
  hasNodeZh,
  hasZh,
  handleStringInnerHtml,
  skipTraverseTsOpts,
} from './utils';
const traverse: typeof _traverse = Reflect.get(_traverse, 'default');

const innerHandleEsCode = (
  content: string,
  pathOrLang: string | undefined,
  singleQuote: boolean
): HandleCodeResult | undefined => {
  if (!hasZh(content)) return;
  const program = parser.parse(content, {
    sourceType: 'module',
    plugins: getBabelPlugins(pathOrLang),
  });
  const splitResultContent = handleStringInnerHtml(content, program);
  if (splitResultContent && splitResultContent !== content) {
    return {
      code: splitResultContent,
      i18nMap: new Map(),
      undone: true,
    };
  }
  if (!hasNodeZh(program)) return;
  const getContent = (node: t.Node | undefined | null) => {
    if (!node) return '';
    return content.slice(node.start!, node.end!);
  };

  let undone = Boolean(false);
  const ms = new MagicString(content);
  const i18nMap = new Map<string, string>();
  const usedNodes = new Set();
  const hasUsedNode = (p: NodePath<t.Node>): boolean => usedNodes.has(p.node);
  const updateNode = (
    node: t.Node,
    key: string,
    value: string,
    newValue: string
  ) => {
    i18nMap.set(key, value);
    usedNodes.add(node);
    ms.update(node.start!, node.end!, newValue);
  };
  const handlePureString = (p: NodePath<t.Node>, value: string) => {
    if (!hasZh(value)) return;
    const key = getKeyFromStr(value);
    const newValue = getI18nExp(key, singleQuote);
    updateNode(p.node, key, value, newValue);
  };
  // const handleNode = (p: NodePath<t.Node>) => {
  //   if (hasUsedNode(p)) return;
  // };
  const handleStringLiteral = (p: NodePath<t.StringLiteral>) => {
    if (hasUsedNode(p)) return;
    handlePureString(p, p.node.value);
  };
  const handleTemplateLiteral = (p: NodePath<t.TemplateLiteral>) => {
    if (hasUsedNode(p)) return;
    if (!p.node.expressions.length) {
      handlePureString(p, p.node.quasis[0].value.raw);
      return;
    }
    if (!p.node.quasis.some((q) => hasZh(q.value.raw))) return;
    if (p.node.expressions.some((e) => hasNodeZh(e))) {
      undone = true;
      // console.log(p.node.expressions.map((v) => getContent(v)));
      return;
    }
    const value = p.node.quasis
      .map((q, i) => q.value.raw + (q.tail ? '' : `{${i}}`))
      .join('');
    const key = getKeyFromStr(value);
    const newValue = getI18nExp(
      key,
      p.node.expressions.map((e) => getContent(e)),
      singleQuote
    );
    updateNode(p.node, key, value, newValue);
  };
  const handleBinaryExpression = (p: NodePath<t.BinaryExpression>) => {
    if (p.node.operator !== '+') return;
    if (hasUsedNode(p)) return;
    if (!hasNodeZh(p.node)) return;
    const usedBinaryExpressions: t.BinaryExpression[] = [];
    const flatNodes = flatBinaryExpression(p.node, (v) =>
      usedBinaryExpressions.push(v)
    );
    if (flatNodes.some((v) => hasChildNodeZh(v))) {
      undone = true;
      // console.log(flatNodes.map((v) => getContent(v)));
      return;
    }
    usedNodes.add(p.node);
    usedBinaryExpressions.forEach((v) => usedNodes.add(v));
    const values: string[] = [];
    const args: string[] = [];
    flatNodes.forEach((v) => {
      const str = getTryNodeString(v);
      if (str && hasZh(str)) {
        usedNodes.add(v);
        values.push(str);
      } else {
        values.push(`{${args.length}}`);
        args.push(getContent(v));
      }
    });
    const value = values.join('').trim();
    const key = getKeyFromStr(value);
    const newValue = getI18nExp(key, args, singleQuote);
    updateNode(p.node, key, value, newValue);
  };
  const handleJSXAttribute = (p: NodePath<t.JSXAttribute>) => {
    if (hasUsedNode(p)) return;
    const strNode = p.node.value;
    if (!t.isStringLiteral(strNode)) return;
    const value = strNode.value;
    if (!hasZh(value)) return;
    const key = getKeyFromStr(value);
    const newValue = `{${getI18nExp(key, singleQuote)}}`;
    updateNode(strNode, key, value, newValue);
  };
  const handleJSXElement = (p: NodePath<t.JSXElement>) => {
    if (hasUsedNode(p)) return;
    if (p.node.children.some((v) => !t.isJSXText(v) && hasNodeZh(v))) {
      undone = true;
      return;
    }
    const jsxTextNodes = p.node.children
      .filter((v) => t.isJSXText(v))
      .filter((v) => hasZh(v.value));
    if (!jsxTextNodes.length) return;
    if (p.node.children.length === 1) {
      const n = jsxTextNodes[0];
      const value = n.value.trim();
      const key = getKeyFromStr(value);
      const newValue = [
        n.value[0] !== value[0] ? '\x20' : '',
        `{${getI18nExp(key, singleQuote)}}`,
        n.value.at(-1) !== value.at(-1) ? '\x20' : '',
      ].join('');
      updateNode(jsxTextNodes[0], key, value, newValue);
      return;
    }
    const values: string[] = [];
    const args: string[] = [];
    p.node.children.forEach((v) => {
      if (t.isJSXText(v)) {
        usedNodes.add(v);
        values.push(getMiniWhitespaceText(v.value));
      } else {
        values.push(`{${args.length}}`);
        if (t.isJSXExpressionContainer(v)) {
          args.push(`${getContent(v.expression)}`);
        } else {
          args.push(`${getContent(v)}`);
        }
      }
    });
    const value = values.join('').trim();
    const key = getKeyFromStr(value);
    const first = p.node.children[0];
    const last = p.node.children.at(-1)!;
    const newValue = [
      t.isJSXText(first) && first.value[0] !== value[0] ? '\x20' : '',
      `{${getI18nExp(key, args, singleQuote)}}`,
      t.isJSXText(last) && last.value.at(-1) !== value.at(-1) ? '\x20' : '',
    ].join('');
    i18nMap.set(key, value);
    usedNodes.add(p.node);
    ms.update(
      p.node.children[0].start!,
      p.node.children.at(-1)!.end!,
      newValue
    );
  };
  traverse(program, {
    StringLiteral(p) {
      handleStringLiteral(p);
    },
    TemplateLiteral(p) {
      handleTemplateLiteral(p);
    },
    BinaryExpression(p) {
      handleBinaryExpression(p);
    },
    JSXElement(p) {
      handleJSXElement(p);
    },
    JSXAttribute(p) {
      handleJSXAttribute(p);
    },
    ...skipTraverseTsOpts,
  });
  return {
    code: ms.toString(),
    i18nMap,
    undone,
  };
};

export const handleEsCode = (
  content: string,
  pathOrLang: string | undefined,
  singleQuote = true
): HandleCodeResult | undefined => {
  let r = innerHandleEsCode(content, pathOrLang, singleQuote);
  if (!r) return;
  while (r?.undone) {
    const r2 = innerHandleEsCode(r.code, pathOrLang, singleQuote);
    if (!r2) break;
    addMap(r.i18nMap, r2.i18nMap);
    r = r2;
  }
  if (!r.i18nMap.size) return;
  return r;
};

export const handleEsFile = async (
  filePath: string,
  content: string
): Promise<HandleCodeResult | undefined> => {
  return handleEsCode(content, filePath);
};
