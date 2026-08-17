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

Pi 的输入事件没有提供 WeChat、WeCom 等具体渠道名。本扩展使用渠道适配器可验证
的会话边界：仅处理 `print` 模式且会话目录位于 Pi 标准用户会话目录之外的输入。
`omp-wechat` 使用这种 headless 自定义会话，已纳入测试；采用相同 Pi SDK 会话结构
的 WeCom 或其他渠道适配器也适用。

这意味着本地自建的 headless SDK 如果也使用自定义会话目录，会被视为外部渠道；
未采用这种会话结构的渠道适配器则不会被识别。Pi 暴露渠道元数据后，可以改为按
明确的渠道标识判断。

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
