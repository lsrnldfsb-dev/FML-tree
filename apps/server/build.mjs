import { build } from "esbuild";
import { fileURLToPath, URL } from "node:url";

const root = (p) => fileURLToPath(new URL(p, import.meta.url));

await build({
  entryPoints: [root("src/index.ts")],
  outfile: root("dist/server.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Bundle everything, including ws, so the deployed artifact is a single file
  // with no node_modules and no native addons to compile on the box.
  packages: "bundle",
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  alias: {
    "@mm/engine": root("../../packages/engine/src/index.ts"),
    "@mm/shared": root("../../packages/shared/src/index.ts"),
  },
  minify: true,
  sourcemap: false,
  logLevel: "info",
});
