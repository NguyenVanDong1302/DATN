import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy để gọi /api và /socket.io sang backend trong lúc dev.
// Mặc định backend chạy http://localhost:4000 (sửa nếu bạn dùng port khác).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
