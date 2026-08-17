# Pi Record Assistant

将 Pi 的输入路由为“写入当天笔记”或“交给 Pi”。记录保存在当前项目的
`records/YYYY-MM-DD.md`，每条记录带本地时间标题。

## 安装

```sh
pi install git:github.com/hetapethh-commits/pi-record-assistant@v0.1.0
```

这是用户级安装，会对本机 Pi 的所有项目生效。安装后可用 `pi list` 查看；移除：

```sh
pi remove git:github.com/hetapethh-commits/pi-record-assistant
```

## 模式

| 模式 | 普通输入 | `-` 开头的输入 |
| --- | --- | --- |
| `unprefixed`（默认） | 记录 | 去掉 `-` 和紧随其后的一个空格后交给 Pi |
| `prefixed` | 交给 Pi | 去掉 `-` 和紧随其后的一个空格后记录 |

模式按项目保存在 `.pi/record-assistant.json`。

## 命令

- `/record-mode`：在两种模式间切换。
- `/record-mode status`：查看当前模式。
- `/record-mode unprefixed`：普通输入记录。
- `/record-mode prefixed`：仅记录 `-` 开头的输入。

Pi 的 `/` 命令和 `!` shell 命令仍由 Pi 原生处理，不会写入记录。修改
extension 后，在 Pi 中执行 `/reload` 重新加载。若文件写入失败，内容不会转发给
Pi。

## 测试

```sh
npm test
```

## 发布

发布只通过项目标准入口执行，并要求 `main` 工作区干净、版本号匹配且测试通过：

```sh
npm run release:github -- 0.1.0
```
