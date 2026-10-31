// The audio agent's own dev server: the root config on port 5250, no hot
// reload, and a separate dependency cache so it never disturbs the main one.
import { defineConfig, mergeConfig } from 'vite';
import type { ConfigEnv, UserConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env: ConfigEnv) => {
  const root = (typeof base === 'function' ? base(env) : base) as UserConfig;
  return mergeConfig(root, {
    cacheDir: 'node_modules/.vite-audio',
    server: { port: 5250, strictPort: true, hmr: false },
  });
});
