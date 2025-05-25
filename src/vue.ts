import type {
  ElementNode,
  InterpolationNode,
  Node,
  SourceLocation,
  TemplateChildNode,
  TextNode,
} from '@vue/compiler-core';
import { NodeTypes } from '@vue/compiler-core';
import MagicString from 'magic-string';
import type { SFCTemplateBlock } from 'vue/compiler-sfc';
import { parse } from 'vue/compiler-sfc';
import { handleEsCode } from './es';
import getKeyFromStr from './key';
import {
  addMap,
  addParentheses,
  getI18nExp,
  hasChildNodeZh,
  hasZh,
  removeParentheses,
  takeWhile,
} from './utils';

const getNodeChildren = (node: Node): TemplateChildNode[] | undefined => {
  return Reflect.get(node, 'children');
};

function* traverseNode(node: Node) {
  const rootChildren = getNodeChildren(node);
  if (!rootChildren?.length) return;
  const stack: TemplateChildNode[] = rootChildren.concat().reverse();
  while (stack.length) {
    const top = stack.pop()!;
    yield top;
    const children = getNodeChildren(top);
    if (children instanceof Array) {
      stack.push(...children);
    }
  }
}

const assertQuote = (quote: string) => {
  if (!`'"`.includes(quote)) {
    throw new Error(`Invalid quote: ${quote}`);
  }
};

const innerHandleVueTemplate = (
  template: SFCTemplateBlock | undefined | null
): HandleCodeResult | undefined => {
  if (!template?.ast) return;
  if (!hasZh(template.content)) return;
  let undone = Boolean(false);
  const { ast } = template;
  const offset = template.loc.start.offset;
  const usedNodes = new Set();
  const hasUsedNode = (node: Node): boolean => usedNodes.has(node);
  const ms = new MagicString(template.content);
  const zhMap = new Map<string, string>();
  const updateMs = (loc: SourceLocation, value: string) => {
    ms.update(loc.start.offset - offset, loc.end.offset - offset, value);
  };
  const updateNode = (
    node: Node,
    key: string,
    value: string,
    newValue: string
  ) => {
    zhMap.set(key, value);
    updateMs(node.loc, newValue);
  };
  const handleElementProps = (node: ElementNode) => {
    node.props.forEach((prop) => {
      if (prop.type === NodeTypes.ATTRIBUTE) {
        if (!prop.value) return;
        const value = (prop.value?.content || '').trim();
        if (!hasZh(value)) return;
        const key = getKeyFromStr(value);
        const newValue = `:${prop.name}="${getI18nExp(key)}"`;
        updateNode(prop, key, value, newValue);
      } else {
        if (!prop.exp) return;
        const content = prop.exp.loc.source;
        if (!hasZh(content)) return;
        const quote = template.content[prop.exp.loc.start.offset - offset - 1];
        assertQuote(quote);
        const singleQuote = quote !== "'";
        const r = handleEsCode(addParentheses(content), 'tsx', singleQuote);
        if (!r) return;
        updateMs(prop.exp.loc, removeParentheses(r.code));
        addMap(r.zhMap, zhMap);
      }
    });
  };

  const handleSerialNode = (subNodes: TemplateChildNode[]) => {
    if (subNodes.length <= 1) return;
    if (
      subNodes.some(
        (v) =>
          v.type === NodeTypes.INTERPOLATION && hasChildNodeZh(v.content.ast)
      )
    ) {
      undone = true;
      // console.log(node.loc.source);
      return;
    }
    const values: string[] = [];
    const args: string[] = [];
    subNodes.forEach((child) => {
      usedNodes.add(child);
      if (child.type === NodeTypes.TEXT) {
        values.push(child.content);
      } else if (child.type === NodeTypes.INTERPOLATION) {
        values.push(`{${args.length}}`);
        args.push(child.content.loc.source);
      }
    });
    const value = values.join('').trim();
    const key = getKeyFromStr(value);
    const newValue = [
      subNodes[0].loc.source[0] !== value[0] ? '\x20' : '',
      `{{ ${getI18nExp(key, args)} }}`,
      subNodes.at(-1)!.loc.source.at(-1) !== value.at(-1) ? '\x20' : '',
    ].join('');
    zhMap.set(key, value);
    ms.update(
      subNodes[0].loc.start.offset - offset,
      subNodes.at(-1)!.loc.end.offset - offset,
      newValue
    );
  };
  const handleElementNode = (node: ElementNode) => {
    handleElementProps(node);
    if (node.children.length <= 1) return;
    for (let i = 0; i < node.children.length; ) {
      const subNodes = takeWhile(
        node.children,
        (v) =>
          (v.type === NodeTypes.TEXT && hasZh(v.content)) ||
          v.type === NodeTypes.INTERPOLATION
      );
      if (subNodes.length) {
        handleSerialNode(subNodes);
        i += subNodes.length;
      } else {
        i++;
      }
    }
  };
  const handleTextNode = (node: TextNode) => {
    const value = node.content.trim();
    if (!hasZh(value)) return;
    const key = getKeyFromStr(value);
    const newValue = [
      value[0] !== node.content[0] ? '\x20' : '',
      `{{ ${getI18nExp(key)} }}`,
      value.at(-1) !== node.content.at(-1) ? '\x20' : '',
    ].join('');
    updateNode(node, key, value, newValue);
  };
  const handleInterpolationNode = (node: InterpolationNode) => {
    const content = node.content.loc.source;
    if (!hasZh(content)) return;
    const r = handleEsCode(addParentheses(content), 'tsx');
    if (!r) return;
    updateMs(node.content.loc, removeParentheses(r.code));
    addMap(r.zhMap, zhMap);
  };
  for (const node of traverseNode(ast)) {
    if (hasUsedNode(node)) continue;
    if (node.type === NodeTypes.ELEMENT) {
      handleElementNode(node);
    } else if (node.type === NodeTypes.TEXT) {
      handleTextNode(node);
    } else if (node.type === NodeTypes.INTERPOLATION) {
      handleInterpolationNode(node);
    }
  }
  if (!zhMap.size) return;
  return {
    code: ms.toString(),
    zhMap,
    undone,
  };
};

const handleVueTemplate = (
  template: SFCTemplateBlock | undefined | null
): HandleCodeResult | undefined => {
  let r = innerHandleVueTemplate(template);
  if (!r) return;
  while (r?.undone) {
    const newTemplate = parse(r.code).descriptor.template;
    const r2 = innerHandleVueTemplate(newTemplate);
    if (!r2) break;
    addMap(r.zhMap, r2.zhMap);
    r = r2;
  }
  if (!r.zhMap.size) return;
  return r;
};

export const handleVueFile = (
  filePath: string,
  content: string,
  cliOpts: InputCliOptions
): HandleCodeResult | undefined => {
  const sfcParseResult = parse(content, { filename: filePath });
  const { script, scriptSetup, template } = sfcParseResult.descriptor;
  const scriptResult = script
    ? handleEsCode(
        script.content,
        filePath + '/script.' + (script.lang || 'js'),
        undefined,
        cliOpts
      )
    : undefined;
  const scriptSetupResult = scriptSetup
    ? handleEsCode(
        scriptSetup.content,
        filePath + '/script.setup.' + (scriptSetup.lang || 'js'),
        undefined,
        cliOpts
      )
    : undefined;
  const templateResult = handleVueTemplate(template);
  if (!scriptResult && !scriptSetupResult && !templateResult) return;
  const ms = new MagicString(content);
  if (script && scriptResult) {
    ms.update(
      script.loc.start.offset,
      script.loc.end.offset,
      scriptResult.code
    );
  }
  if (scriptSetup && scriptSetupResult) {
    ms.update(
      scriptSetup.loc.start.offset,
      scriptSetup.loc.end.offset,
      scriptSetupResult.code
    );
  }
  if (template && templateResult) {
    ms.update(
      template.loc.start.offset,
      template.loc.end.offset,
      templateResult.code
    );
  }
  return {
    code: ms.toString(),
    zhMap: new Map([
      ...(scriptResult?.zhMap ?? []),
      ...(scriptSetupResult?.zhMap ?? []),
      ...(templateResult?.zhMap ?? []),
    ]),
  };
};
