import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 주소: https://junghwan12.github.io/draw_flow/
export default defineConfig({
  base: '/draw_flow/',
  plugins: [react()],
});
