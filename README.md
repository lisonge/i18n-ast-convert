# i18n-ast-convert

基于 AST 的中文迁移国际化代码提取替换工具

- 支持 js/ts/jsx/tsx/vue 文件

| 表达式                             | 提取模版                    | 替换结果                     |
| ---------------------------------- | --------------------------- | ---------------------------- |
| `'苹果'`                           | `苹果`                      | `$t('key')`                  |
| `a+'个苹果'`                       | `{0}个苹果`                 | `$t('key', [a])`             |
| `` `${a}个苹果和${b}个香蕉${c}` `` | `{0}个苹果和${1}个香蕉${2}` | `$t('key', [a, b, c])`       |
| `a+'个苹果和'+b+'个香蕉'+c`        | `{0}个苹果和${1}个香蕉${2}` | `$t('key', [a, b, c])`       |
| `'<div>苹果</div>'`            | `苹果`                      | `'<div>'+t('xxx')+'</div>'` |
| `<div title="苹果" />`             | `苹果`                      | `<div :title="$t('key')" />` |
| `<div>{{a}}个苹果</div>`             | `{0}个苹果`                      | `<div>{{$t('key', [a])}}</div>` |

以及它们互相连续和嵌套的情况

![img](https://e.gkd.li/94a7b786-1769-4379-a316-2462de9aeac6)

![img](https://e.gkd.li/aa93089c-b192-44f8-afed-f013cead318a)

![img](https://e.gkd.li/d7c8eb7e-5dbc-4028-85a7-ee887559ffa6)

## 使用

安装

```shell
git clone https://github.com/lisonge/i18n-ast-convert.git
cd i18n-ast-convert
pnpm i
```

运行

```shell
pnpm start -d your-project-path
```

这将自动转换该项目代码并生成 `zh-CN.json` 文件
