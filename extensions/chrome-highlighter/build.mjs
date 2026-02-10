import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  target: 'chrome120',
  outdir: 'dist',
};

const configs = [
  { ...commonOptions, entryPoints: ['src/background.ts'], format: 'esm' },
  { ...commonOptions, entryPoints: ['src/content.ts'], format: 'iife' },
  { ...commonOptions, entryPoints: ['src/popup.ts'], format: 'iife' },
];

// 复制静态资源到 dist
function copyStatic() {
  mkdirSync('dist', { recursive: true });
  copyFileSync('src/styles.css', 'dist/styles.css');
  copyFileSync('src/popup.css', 'dist/popup.css');
}

if (isWatch) {
  copyStatic();
  for (const config of configs) {
    const ctx = await context(config);
    await ctx.watch();
  }
  console.log('Watching for changes...');
} else {
  copyStatic();
  for (const config of configs) {
    await build(config);
  }
  console.log('Build complete.');
}
