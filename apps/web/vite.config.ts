import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = (prefix: string, target: string) => ({
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ''),
  })
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/identity': proxy(
          '/identity',
          env.IDENTITY_PROXY_TARGET || 'http://localhost:3001',
        ),
        '/mock/organization': proxy(
          '/mock/organization',
          env.ORGANIZATION_PROXY_TARGET || 'http://localhost:4010',
        ),
        '/mock/asset': proxy(
          '/mock/asset',
          env.ASSET_PROXY_TARGET || 'http://localhost:4011',
        ),
        '/mock/requests': proxy(
          '/mock/requests',
          env.SERVICE_REQUEST_PROXY_TARGET || 'http://localhost:4012',
        ),
        '/gateway': proxy(
          '/gateway',
          env.GATEWAY_PROXY_TARGET || 'http://localhost:3000',
        ),
      },
    },
  }
})
