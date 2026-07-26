// Electron main process: starts the embedded Express server and opens the window.
// In dev (ELECTRON_START_URL set), the Vite dev server is loaded instead and the
// backend is expected to be started separately (npm run dev).
const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const path = require('path')

// Any startup failure (embedded server crash, port conflict, bad native module…)
// must be VISIBLE — never die silently with no window. Log to userData and show
// a dialog before quitting.
function fatal(err) {
  const msg = err?.stack || String(err)
  console.error(msg)
  try {
    require('fs').appendFileSync(
      path.join(app.getPath('userData'), 'startup-error.log'),
      `${new Date().toISOString()}\n${msg}\n\n`,
    )
  } catch {
    // userData not writable — the dialog still shows the error
  }
  dialog.showErrorBox('SpindleStudio 启动失败 / Startup failed', msg)
  app.quit()
}
process.on('uncaughtException', fatal)
process.on('unhandledRejection', fatal)

const DEV_URL = process.env.ELECTRON_START_URL || ''
const SERVER_PORT = Number(process.env.PORT) || 3210
const BASE_URL = DEV_URL || `http://localhost:${SERVER_PORT}`

// Shared BrowserWindow options — also applied to child windows opened via
// window.open() (multi-window: one conversation per window, all talking to the
// same embedded backend)
const WINDOW_OPTIONS = {
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  autoHideMenuBar: true,
  backgroundColor: '#ffffff',
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
  },
}

// The embedded server listens on a fixed port — a second instance would crash
// with EADDRINUSE, so enforce single-instance: re-launching focuses the
// existing window instead.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

async function startServer() {
  // Store user data (conversations, images, config) under the OS userData dir
  if (app.isPackaged) {
    process.env.DATA_DIR = path.join(app.getPath('userData'), 'data')
  }
  // The compiled server listens as a side effect of being required
  require(path.join(__dirname, '../dist-server/index.js'))
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const resp = await fetch(url)
        if (resp.ok || resp.status === 404) return resolve()
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('server start timeout'))
      setTimeout(check, 300)
    }
    check()
  })
}

function createWindow() {
  const win = new BrowserWindow(WINDOW_OPTIONS)

  // Same-origin window.open (?conv=... multi-window links) gets a real app
  // window; anything external goes to the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === new URL(BASE_URL).origin) {
        return { action: 'allow', overrideBrowserWindowOptions: WINDOW_OPTIONS }
      }
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    } catch {
      // unparsable URL — fall through to deny
    }
    return { action: 'deny' }
  })

  win.loadURL(BASE_URL)
}

// Application menu (hidden until Alt, autoHideMenuBar stays). Localized by OS
// locale; the renderer has its own language setting, but the menu is chrome-level.
function setupMenu() {
  const isZh = app.getLocale().toLowerCase().startsWith('zh')
  const menu = Menu.buildFromTemplate([
    {
      label: isZh ? '文件' : 'File',
      submenu: [
        {
          label: isZh ? '新建窗口' : 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        { role: 'quit', label: isZh ? '退出' : 'Quit' },
      ],
    },
    {
      label: isZh ? '编辑' : 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: isZh ? '视图' : 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: isZh ? '窗口' : 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ])
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  try {
    if (!DEV_URL) {
      await startServer()
      await waitForServer(`http://localhost:${SERVER_PORT}/api/config`)
    }
    setupMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    fatal(err)
  }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
