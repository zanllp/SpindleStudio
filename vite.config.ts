import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'fs'

function readServerPort(): number {
  try {
    const port = parseInt(readFileSync(resolve(__dirname, '.server-port'), 'utf-8').trim(), 10)
    if (port > 0 && port < 65536) return port
  } catch {
    // .server-port not written yet — fall back to default
  }
  return Number(process.env.PORT) || 3210
}

const serverPort = readServerPort()

export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true
      },
      '/images': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true
      },
      '/uploads': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true
      },
      '/socket.io': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
        ws: true
      }
    }
  },
  base: './'
})
