# Pi Record Assistant

将外部渠道发送给 Pi 的输入路由为“写入当天笔记”或“交给 Pi”。记录保存在
当前项目的 `records/YYYY-MM-DD.md`，每条记录带本地时间标题。本地终端、RPC、
JSON 和标准 print 会话始终直接交给 Pi，不受记录模式影响。

## 安装

```sh
pi install git:github.com/hetapethh-commits/pi-record-assistant@v0.2.0
```

这是用户级安装，会对本机 Pi 的所有项目生效。安装后可用 `pi list` 查看；移除：

```sh
pi remove git:github.com/hetapethh-commits/pi-record-assistant
```

## 渠道边界

Pi 的输入事件没有提供 WeChat、WeCom 等具体渠道名，因此本扩展只处理已明确注册
的渠道会话根目录。当前默认支持 `omp-wechat` 的
`~/.omp-wechat/sessions`：消息还必须同时来自 `interactive` source 和 `print`
模式，才会进入记录逻辑。

本地 TUI、RPC、JSON、标准 print、本地自建 headless SDK，以及 extension 注入的
内部消息都直接交给 Pi。当前 `@amaster.ai/pi-wecom` 提供 WeCom 工作区技能和 CLI，
不是入站消息桥接，所以没有可被本扩展处理的 WeCom 入站消息；未来的入站适配器需
先提供稳定的会话根目录，再显式加入支持列表。

## 模式

| 模式 | 外部渠道普通输入 | 外部渠道 `-` 开头的输入 |
| --- | --- | --- |
| `unprefixed`（默认） | 记录 | 去掉 `-` 和紧随其后的一个空格后交给 Pi |
| `prefixed` | 交给 Pi | 去掉 `-` 和紧随其后的一个空格后记录 |

模式按项目保存在 `.pi/record-assistant.json`。

## 命令

- `/record-mode`：在两种外部渠道模式间切换。
- `/record-mode status`：查看当前模式。
- `/record-mode unprefixed`：外部渠道普通输入记录。
- `/record-mode prefixed`：仅记录外部渠道中以 `-` 开头的输入。

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
npm run release:github -- 0.2.0
```
