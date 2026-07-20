// Preload script: kept intentionally minimal.
// The app talks to its own local Express server over HTTP, so no Node APIs
// need to be exposed to the renderer.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
})
