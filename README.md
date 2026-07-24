# ChatImgHub

一个 ChatGPT 风格的桌面聊天应用，用对话的方式生成图片（文生图 / 图生图）。

English below · 中文在前

## 功能

- 💬 对话式生图：每条消息就是一条提示词，上下文中可以反复迭代
- 🖼️ 图生图：引用已生成的图片，或上传 / 粘贴本地图片作为参考图
- 🔢 一次生成多张（1–8 张），每张独立任务，逐张渐进上屏
- ➕ 任意一条结果都可以「再生成一张」追加变体
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
C:\Users\me\repo\ChatImgHub
```

指向本仓库目录后，打包版与开发模式共用同一份会话 / 图片 / 配置。纯 Node 运行（`npm start`）用 `DATA_DIR` 环境变量即可。如需一次性导入而不是共享，用 `npm run migrate -- <源目录> [目标目录]`（幂等增量复制会话与图片）。

---

## English

A ChatGPT-style desktop chat app for AI image generation (text-to-image & image-to-image).

### Features

- Conversational image generation — every message is a prompt you can iterate on
- Image-to-image via referencing generated images or uploading / pasting local ones
- Batch generation (1–8 images) with progressive per-image rendering
- "Generate one more" variants on any result, in-place prompt edit & resend, retry
- Local disk persistence — conversations and in-flight tasks survive refresh / restart
- Four themes: ChatGPT / Frutiger Aero / Windows Vista / Windows XP
- In-app settings for API key & base URL

Talks to an OpenAI-compatible images API (`gpt-image-2` by default); key and base URL are configurable in Settings.

### Getting started

```bash
npm install
npm run dev          # web dev at http://localhost:5173
```

Fill in your API key in the settings dialog on first launch.

Desktop: `npm run dev:electron` (dev), `npm run dist:win` (Windows installer / portable).
Headless: `npm run build && npm start` → http://localhost:3210.

Data (conversations, generated images, uploads, config) lives in the project directory by default; packaged builds use the OS userData dir. To point a packaged build at an existing data directory (IIB `sd_webui_dir`-style), set the `DATA_DIR` env var, or create a `data-dir.txt` file next to the exe (or in userData) containing one absolute path. One-shot import instead of sharing: `npm run migrate -- <sourceDir> [destDir]`.

## License

MIT
