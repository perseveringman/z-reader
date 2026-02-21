import { defineConfig } from 'vite';
import pkg from './package.json';

// 将所有 dependencies 外部化，打包时通过 forge hook 复制 node_modules
const external = Object.keys(pkg.dependencies);

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external,
    },
  },
});
