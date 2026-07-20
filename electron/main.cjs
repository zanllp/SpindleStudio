// Electron main process: starts the embedded Express server and opens the window.
// In dev (ELECTRON_START_URL set), the Vite dev server is loaded instead and the
// backend is expected to be started separately (npm run dev).
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const DEV_URL = process.env.ELECTRON_START_URL || ''
const SERVER_PORT = Number(process.env.PORT) || 3210

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
  const win = new BrowserWindow({
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
  })

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(`http://localhost:${SERVER_PORT}`)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadURL(`http://localhost:${SERVER_PORT}`)
  }
}

app.whenReady().then(async () => {
  if (!DEV_URL) {
    await startServer()
    await waitForServer(`http://localhost:${SERVER_PORT}/api/config`)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
