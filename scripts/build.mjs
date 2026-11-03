// Builds the deployable site into dist/:
//  - bundles + minifies src/main.js → app.js and the stylesheets → app.css (esbuild)
//  - copies icons, vendor files and the manifest
//  - rewrites index.html to use the bundles
//  - writes service-worker.js with a precache list and a content-hash version, so every
//    change produces a new cache automatically (no manual version bumps)
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// 1. JavaScript and CSS bundles.
await build({
  entryPoints: { app: join(ROOT, "src/main.js") },
  bundle: true,
  format: "esm",
  minify: true,
  target: ["es2020", "safari14"],
  outdir: DIST,
  legalComments: "none",
  logLevel: "warning",
});
await build({
  entryPoints: { app: join(ROOT, "src/styles.css") },
  bundle: true,
  minify: true,
  outdir: DIST,
  logLevel: "warning",
});

// 2. Static files.
for (const path of ["icons", "vendor", "manifest.json"]) {
  await cp(join(ROOT, path), join(DIST, path), { recursive: true });
}
await rm(join(DIST, "vendor/canvas-confetti.LICENSE"), { force: true });
await build({
  entryPoints: [join(ROOT, "vendor/confetti.browser.js")],
  minify: true,
  outfile: join(DIST, "vendor/confetti.browser.js"),
  allowOverwrite: true,
  logLevel: "warning",
});

// 3. index.html pointing at the bundles.
let html = await readFile(join(ROOT, "index.html"), "utf8");
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html: expected to find ${from}`);
  html = html.replace(from, to);
};
swap('<link rel="stylesheet" href="src/styles.css">', '<link rel="stylesheet" href="app.css">');
swap('<script type="module" src="src/main.js"></script>', '<script type="module" src="app.js"></script>');
html = html.replace(/<!--(?!\s*\[if)[\s\S]*?-->/g, "").replace(/\n\s*\n+/g, "\n");
await writeFile(join(DIST, "index.html"), html);

// 4. Service worker with precache list + content hash.
async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  }));
  return files.flat();
}
const PRECACHE_SKIP = [/\.txt$/]; // licences
const files = (await listFiles(DIST))
  .map((file) => relative(DIST, file).split("\\").join("/"))
  .filter((file) => !PRECACHE_SKIP.some((pattern) => pattern.test(file)))
  .sort();
const hash = createHash("sha256");
for (const file of files) hash.update(file).update(await readFile(join(DIST, file)));
const version = `${pkg.version}-${hash.digest("hex").slice(0, 10)}`;

let sw = await readFile(join(ROOT, "service-worker.js"), "utf8");
const injectedVersion = sw.replace('const BUILD_VERSION = "dev";', `const BUILD_VERSION = ${JSON.stringify(version)};`);
const injected = injectedVersion.replace('const PRECACHE = ["./", "index.html"];', `const PRECACHE = ${JSON.stringify(["./", ...files])};`);
if (injected === injectedVersion || injectedVersion === sw) throw new Error("service-worker.js placeholders not found");
await writeFile(join(DIST, "service-worker.js"), injected);
await writeFile(join(DIST, ".nojekyll"), "");

let total = 0;
for (const file of files) total += (await stat(join(DIST, file))).size;
console.log(`Built dist/ — version ${version}, ${files.length} files precached (${(total / 1024).toFixed(0)} KB)`);
