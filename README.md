# i18n-ast-convert

基于 AST 的中文迁移国际化代码提取替换工具

- 支持 js/ts/jsx/tsx/vue 文件

| 表达式                             | 提取模版                    | 替换结果                     |
| ---------------------------------- | --------------------------- | ---------------------------- |
| `'苹果'`                           | `苹果`                      | `$t('key')`                  |
| `a+'个苹果'`                       | `{0}个苹果`                 | `$t('key', [a])`             |
| `` `${a}个苹果和${b}个香蕉${c}` `` | `{0}个苹果和${1}个香蕉${2}` | `$t('key', [a, b, c])`       |
| `a+'个苹果和'+b+'个香蕉'+c`        | `{0}个苹果和${1}个香蕉${2}` | `$t('key', [a, b, c])`       |
| `<div title="苹果" />`             | `苹果`                      | `<div :title="$t('key')" />` |
| `<div>{{a}}个苹果</div>`             | `{0}个苹果`                      | `<div>{{$t('key', [a])}}</div>` |

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

这将自动转换该项目代码并生成 `i18n.json` 文件
