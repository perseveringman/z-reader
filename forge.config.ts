import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      console.log('[forge hook] buildPath:', buildPath);
      console.log('[forge hook] contents:', fs.readdirSync(buildPath));
      // 复制 package.json 到打包目录
      const srcPkgJson = path.resolve(__dirname, 'package.json');
      const destPkgJsonPath = path.join(buildPath, 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(srcPkgJson, 'utf-8'));
      // 只保留 dependencies
      delete pkgJson.devDependencies;
      fs.writeFileSync(destPkgJsonPath, JSON.stringify(pkgJson, null, 2));
      // 安装生产依赖
      execSync('pnpm install --prod --no-frozen-lockfile --ignore-scripts', {
        cwd: buildPath,
        stdio: 'inherit',
      });
      // 为原生模块重新构建
      execSync('pnpm rebuild better-sqlite3', {
        cwd: buildPath,
        stdio: 'inherit',
      });
    },
  },
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
