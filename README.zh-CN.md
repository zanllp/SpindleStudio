# MuseStudio

<img src="build/icon.png" alt="MuseStudio 图标" width="256" align="right" />

[English](README.md) · 中文

一个轻量级的纯 API 生图工作台。像 Threads 一样，在同一个会话里并发推进多个想法——不需要等上一张图跑完，就能继续发新的生图请求、引用旧图、或在任意历史结果上追加变体。适合已经跨过「调参阶段」、只想把注意力放回创意本身的用户。

## 它是什么

MuseStudio 不是 Stable Diffusion WebUI / ComfyUI 的替代品，也不是面面俱到的通用 AI 客户端。它的定位更纯粹：

- 🧵 **多想法并行**：同一个会话内可同时推进多个生图请求，不必排队等待上一条完成
- 💬 **对话式迭代**：每条消息都是一条独立线索，可在任意历史结果上继续生成、引用旧图、回填提示词
- 🖼️ **硬核生图**：只做文生图 / 图生图，把这条路径做到极致
- 🔌 **多供应商**：一次配置多家 provider，按需切换或并发调用

如果你用过 Cherry Studio 这类综合客户端，可以把 MuseStudio 理解为 **「只聊图片」的生图特化版**。

## 功能

- 🧵 **同会话多线程生图**：会话内可同时存在多个进行中的生图请求，像 Threads 一样并行推进
- 💬 对话式生图：每条消息就是一条提示词，上下文中可以反复迭代
- 🖼️ 图生图：引用已生成的图片，或上传 / 粘贴本地图片作为参考图
- 🔢 一次生成多张（1–8 张），每张独立任务，逐张渐进上屏
- ➕ 在任意历史结果上「再生成一张」，直接追加变体
- ✏️ 提示词原地编辑重发、回填输入框、删除、失败重试
- 💾 会话本地落盘持久化，刷新 / 重启后可恢复（包括未完成任务的续跑）
- 🎨 四套主题：ChatGPT / Frutiger Aero / Windows Vista / Windows XP
- ⚙️ API Key 在应用内设置，不需要改配置文件

生成服务支持多家供应商（设置页统一配置，左下角齿轮进入）：API Mart（默认，gpt-image-2）、OpenRouter、OpenAI 官方、自定义 OpenAI 兼容。

## 快速开始

```bash
npm install
npm run dev        # Web 开发模式: http://localhost:5173
```

首次启动会弹出设置窗口，填入 API Key 即可开始生图。

### 桌面（Electron）

```bash
npm run dev:electron   # 开发模式（Vite + 后端 + Electron）
npm run build          # 构建前端 + 后端
npm run electron       # 以桌面窗口运行（内嵌后端）
npm run dist:win       # 打包 Windows 安装包 / 便携版 (electron-builder)
```

### 纯 Node 运行（无 Electron）

```bash
npm run build
npm start            # http://localhost:3210
```

## 配置

优先级：应用内设置（`config.json`）> `.env.local` > `.env` > 环境变量。参考 [.env.example](.env.example)。

| 配置项 | 说明 |
| --- | --- |
| `APIMART_API_KEY` / `APIMART_BASE_URL` | API Mart 初始 Key / 地址（种子值，应用内可改） |
| `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` | OpenRouter 初始 Key / 地址（种子值，应用内可改） |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 可选，仅用于会话「AI 总结」标题 |
| `PORT` | 后端端口，默认 3210 |
| `HTTPS_PROXY` | 可选，出站请求代理 |

数据（会话、生成的图片、上传的参考图、配置）默认保存在项目目录下；Electron 打包版保存在系统 userData 目录。

### 自定义数据目录（共享既有数据）

打包版可以把数据目录指向任意已有目录（类似 IIB 的 `sd_webui_dir`），优先级：`DATA_DIR` 环境变量 > exe 同目录 `data-dir.txt` > userData 下 `data-dir.txt` > 默认。文件内容就是一行绝对路径，例如：

```
C:\Users\me\repo\MuseStudio
```

指向本仓库目录后，打包版与开发模式共用同一份会话 / 图片 / 配置。纯 Node 运行（`npm start`）用 `DATA_DIR` 环境变量即可。如需一次性导入而不是共享，用 `npm run migrate -- <源目录> [目标目录]`（幂等增量复制会话与图片）。

## License

MIT
