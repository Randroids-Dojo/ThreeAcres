// Dev server for the 3D renderer workbench: port 5249, no hot reload, so edits
// elsewhere in the shared checkout never reload a page mid-measurement.
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env: ConfigEnv) => {
  const root = (typeof base === 'function' ? base(env) : base) as UserConfig;
  return mergeConfig(root, {
    server: { port: 5249, strictPort: true, hmr: false },
  });
});
