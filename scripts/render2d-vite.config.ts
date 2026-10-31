// The 2D renderer's own dev server: port 5248, no hot reload, so edits made by
// other agents in the shared checkout never reload a page mid-measurement.
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env: ConfigEnv) => {
  const root = typeof base === 'function' ? (base as (e: ConfigEnv) => UserConfig)(env) : (base as UserConfig);
  return mergeConfig(root, { server: { port: 5248, strictPort: true, hmr: false } });
});
