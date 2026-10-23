// Bundles the server (and the workspace's @ringfall/* packages, which ship as TypeScript) into dist/.
// Everything from node_modules stays external.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/migrate.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [{
    name: 'external-node-modules',
    setup(b) {
      b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@ringfall/') ? undefined : { path: args.path, external: true }));
    },
  }],
});
