// Dev server for scripted checks: no hot reload, so other edits in the
// checkout do not reload a page mid-run.
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env) => mergeConfig(typeof base === 'function' ? base(env) : base, { server: { port: 5247, strictPort: true, hmr: false } }));
