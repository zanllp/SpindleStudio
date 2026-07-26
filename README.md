# MuseStudio

<img src="build/icon.png" alt="MuseStudio icon" width="256" align="right" />

English · [中文](README.zh-CN.md)

A lightweight, API-first image generation studio. Like Threads, it lets you advance multiple ideas in parallel within a single conversation — no need to wait for one image to finish before sending the next request, referencing an old image, or spawning a variant from any previous result. Built for users who have moved past the "tweak every parameter" phase and just want to iterate on ideas quickly through conversation.

## What it is

MuseStudio is not a replacement for Stable Diffusion WebUI / ComfyUI, nor a do-everything AI client. It is deliberately focused:

- 🧵 **Multi-idea parallelism**: multiple in-flight generation requests can progress inside the same session without waiting in line
- 💬 **Conversational iteration**: every message is an independent thread; continue generating from, reference, or backfill any previous result
- 🖼️ **Image-generation-first**: text-to-image and image-to-image, done well
- 🔌 **Multi-provider**: configure multiple backends and switch or call them as needed

If you have used all-in-one clients like Cherry Studio, think of MuseStudio as the **image-generation-specialized alternative**.

## Features

- **Multi-thread generation in one session**: multiple in-flight requests progress in parallel, Threads-style
- Conversational image generation — every message is a prompt you can iterate on
- Image-to-image via referencing generated images or uploading / pasting local ones
- Batch generation (1–8 images) with progressive per-image rendering
- "Generate one more" on any previous result to append a variant instantly
- In-place prompt edit & resend, backfill to input box, delete, retry
- Local disk persistence — conversations and in-flight tasks survive refresh / restart
- Four themes: ChatGPT / Frutiger Aero / Windows Vista / Windows XP
- In-app settings for API key & base URL

Talks to an OpenAI-compatible images API (`gpt-image-2` by default); key and base URL are configurable in Settings.

## Getting started

```bash
npm install
npm run dev          # web dev at http://localhost:5173
```

Fill in your API key in the settings dialog on first launch.

### Desktop (Electron)

```bash
npm run dev:electron   # dev mode (Vite + backend + Electron)
npm run build          # build frontend + backend
npm run electron       # run as desktop window (embedded backend)
npm run dist:win       # package Windows installer / portable (electron-builder)
```

### Headless Node (no Electron)

```bash
npm run build
npm start            # http://localhost:3210
```

## Configuration

Priority: in-app settings (`config.json`) > `.env.local` > `.env` > environment variables. See [.env.example](.env.example).

| Variable | Description |
| --- | --- |
| `APIMART_API_KEY` / `APIMART_BASE_URL` | API Mart seed key / URL (editable in-app) |
| `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` | OpenRouter seed key / URL (editable in-app) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Optional, used only for the "AI title" feature |
| `PORT` | Backend port, default `3210` |
| `HTTPS_PROXY` | Optional outbound proxy |

Data (conversations, generated images, uploads, config) lives in the project directory by default; packaged builds use the OS userData dir.

### Custom data directory (share existing data)

A packaged build can point its data directory at any existing folder (IIB `sd_webui_dir`-style). Precedence: `DATA_DIR` env var > `data-dir.txt` next to the exe > `data-dir.txt` in userData > default. The file contains one absolute path, e.g.:

```
C:\Users\me\repo\MuseStudio
```

After pointing it at this repo, the packaged build and dev mode share the same conversations / images / config. For headless Node mode (`npm start`), use the `DATA_DIR` env var. For a one-time import instead of sharing: `npm run migrate -- <sourceDir> [destDir]`.

## License

MIT
