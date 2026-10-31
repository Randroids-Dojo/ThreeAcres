// Seedbound's dev server for scripted checks: its own port, no hot reload, so
// edits elsewhere in the checkout do not reload a page mid-run.
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env) => mergeConfig(typeof base === 'function' ? base(env) : base, { server: { port: 5252, strictPort: true, hmr: false } }));
