import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticMagicLink } from 'vite-plugin-static-magic-link'

export default defineConfig({
  plugins: [react(), staticMagicLink()],
})
