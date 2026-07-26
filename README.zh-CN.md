# MuseStudio

<img src="build/icon.png" alt="MuseStudio 图标" width="256" align="right" />

[English](README.md) · 中文

一个轻量级的纯 API 生图工作台。像 Threads 一样，在同一个会话里并发推进多个想法——不需要等上一张图跑完，就能继续发新的生图请求、引用旧图、或在任意历史结果上追加变体。适合已经跨过「调参阶段」、只想把注意力放回创意本身的用户。

与 [Infinite Image Browsing](https://github.com/zanllp/sd-webui-infinite-image-browsing) 搭配使用效果更佳：生成的每张图都自带 SD WebUI 兼容 EXIF，可直接被 IIB 索引、搜索和打标。

**下载**：预构建的 Windows 安装包 / 便携版见 [GitHub Releases](https://github.com/zanllp/MuseStudio/releases)。

> **macOS 用户**：应用未签名，Gatekeeper 会提示「已损坏，无法打开」。安装后执行一次 `xattr -cr /Applications/MuseStudio.app` 清除隔离标记即可。建议下载 `.dmg`（部分解压工具会破坏 app 内的符号链接）。

## 它是什么

MuseStudio 不是 Stable Diffusion WebUI / ComfyUI 的替代品，也不是面面俱到的通用 AI 客户端。它的定位更纯粹：

- 🧵 **多想法并行**：同一个会话内可同时推进多个生图请求，不必排队等待上一条完成
- 💬 **对话式迭代**：每条消息都是一条独立线索，可在任意历史结果上继续生成、引用旧图、回填提示词
- 🖼️ **零调参**：不关心步数、LoRA、采样器那些传统生图细节，只做文生图 / 图生图，把这条路径做到极致
- 🔌 **多供应商**：一次配置多家 provider，按需切换或并发调用

如果你用过 Cherry Studio 这类综合客户端，可以把 MuseStudio 理解为 **「只聊图片」的生图特化版**。

![MuseStudio —— 同一会话内多线程生图](docs/screenshots/theme-chatgpt.webp)

## 功能

- 🧵 **同会话多线程生图**：会话内可同时存在多个进行中的生图请求，像 Threads 一样并行推进
- 💬 对话式生图：每条消息就是一条提示词，上下文中可以反复迭代
- 🖼️ 图生图：引用已生成的图片，或上传 / 粘贴本地图片作为参考图
- 🔢 一次生成多张（1–8 张），每张独立任务，逐张渐进上屏
- ➕ 在任意历史结果上「再生成一张」，直接追加变体
- ✏️ 提示词原地编辑重发、回填输入框、删除、失败重试
- 🎛️ 生成参数：auto + 13 种画面比例预设，1K / 2K / 4K 分辨率（4K 限宽屏比例）
- 🏷️ 生成图写入 EXIF 元数据：提示词、尺寸、模型，SD WebUI 兼容格式，可被 [Infinite Image Browsing](https://github.com/zanllp/sd-webui-infinite-image-browsing) 等工具直接读取
- 📈 上传历史按使用频率排序，常用参考图一键复用
- 💾 会话本地落盘持久化，刷新 / 重启后可恢复（包括未完成任务的续跑）
- 🪟 多窗口实时同步：桌面多窗口 + Web 页面同时使用，一处操作处处更新，主题按窗口独立
- 🎨 四套主题：ChatGPT / Frutiger Aero / Windows Vista / Windows XP
- 🌐 中英文界面，跟随系统或手动切换
- ⚙️ API Key 在应用内设置，不需要改配置文件

## 实际使用

**Threads 式并行生图**——连续发多条提示词不用等，各自独立任务、完成即上屏：

![多条提示词并行——第一张已出图，下一张仍在生成](docs/screenshots/feat-inflight2.webp)

**图生图**——点任意历史结果上的链接按钮（或上传 / 粘贴本地图片），描述想要的改动：

<table>
  <tr>
    <td><img src="docs/screenshots/feat-i2i-input.webp" alt="引用历史结果后，输入框切换为图生图模式" /></td>
    <td><img src="docs/screenshots/feat-i2i-result.webp" alt="基于参考图把雨夜咖啡馆重绘成飘雪版本" /></td>
  </tr>
</table>

**一条消息最多 8 张**，逐张渐进上屏——结果旁的 ⊕ 一键追加变体；悬停消息可回填提示词 / 编辑重发 / 删除：

<table>
  <tr>
    <td><img src="docs/screenshots/feat-batch.webp" alt="一条提示词产出四张抹茶拿铁" /></td>
    <td><img src="docs/screenshots/feat-actions.webp" alt="每条消息支持回填、编辑重发、删除" /></td>
  </tr>
</table>

**参数随手调**——13 种画面比例预设 + 1K / 2K / 4K 分辨率；**每张图都记得自己的来历**——提示词、模型、尺寸等写入 SD WebUI 兼容 EXIF：

<table>
  <tr>
    <td><img src="docs/screenshots/feat-params.webp" alt="画面比例预设与分辨率选项" /></td>
    <td><img src="docs/screenshots/feat-exif.webp" alt="每张图都保存完整生成参数" /></td>
  </tr>
</table>

## 多窗口并行，实时同步

想开几个窗口就开几个——桌面端从侧栏「新建窗口」多开，同时还能在浏览器打开 `http://localhost:3210`——所有窗口实时同步：在任意窗口发提示词，其余窗口同步出图；新建、编辑、删除会话即刻更新到每个窗口。主题按窗口独立，浏览器里跑 Windows XP、应用窗口保持 ChatGPT 互不干扰。

![桌面窗口与浏览器并排打开同一会话、实时同步——各自使用不同主题](docs/screenshots/feat-multiwindow.webp)

## 主题

四套内置主题，右上角下拉随时切换：

<table>
  <tr>
    <td><img src="docs/screenshots/theme-chatgpt.webp" alt="ChatGPT 主题" /></td>
    <td><img src="docs/screenshots/theme-frutiger-aero.webp" alt="Frutiger Aero 主题" /></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/theme-vista.webp" alt="Windows Vista 主题" /></td>
    <td><img src="docs/screenshots/theme-xp.webp" alt="Windows XP 主题" /></td>
  </tr>
</table>

## 模型供应商

多家生图后端可以在设置页（左下角齿轮）并行配置——每家独立的 Key、地址和模型列表——使用时在输入框旁按消息切换。同步（OpenAI 兼容 images）与异步任务式 API 均可接入，也支持从界面添加自定义供应商。默认模型为 `gpt-image-2`。

<img src="docs/screenshots/settings-providers.webp" alt="供应商设置" width="720" />

## 快速开始

从源码运行：

```bash
yarn
yarn dev           # Web 开发模式: http://localhost:5173
```

首次启动会弹出设置窗口，填入 API Key 即可开始生图。

### 桌面（Electron）

```bash
yarn dev:electron    # 开发模式（Vite + 后端 + Electron）
yarn build           # 构建前端 + 后端
yarn electron        # 以桌面窗口运行（内嵌后端）
yarn dist:win        # 打包 Windows 安装包 / 便携版 (electron-builder)
```

### 纯 Node 运行（无 Electron）

```bash
yarn build
yarn start           # http://localhost:3210
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

指向本仓库目录后，打包版与开发模式共用同一份会话 / 图片 / 配置。纯 Node 运行（`yarn start`）用 `DATA_DIR` 环境变量即可。如需一次性导入而不是共享，用 `yarn migrate <源目录> [目标目录]`（幂等增量复制会话与图片）。

## 技术栈

Vue 3 · Vite · TypeScript · Pinia · Ant Design Vue · Express · socket.io（实时进度）· sharp（EXIF 写入）· Electron

## License

MIT
