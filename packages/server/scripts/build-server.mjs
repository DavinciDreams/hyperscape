import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '../')

// Note: Model bounds extraction is handled by turbo task `extract-bounds`
// which runs before this build script with proper caching based on GLB file changes.
// See turbo.json: server#extract-bounds

// Server files import shared via relative paths (../../../../shared/src/...)
// which bypasses packages:'external' and pulls shared's PhysXManager into
// this bundle. The bundled code runs `await import("./PhysXManager.server")`
// at runtime and resolves relative to dist/index.js, so the dynamic-import
// targets are kept external and the emitted files from shared/build/ are
// copied next to dist/index.js below.
const sharedServerOnlyExternals = [
  './PhysXManager.server',
  './PhysXManager.server.js',
  './storage.server',
  './storage.server.js',
]

// Build the server
const serverCtx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  platform: 'node',
  format: 'esm',
  bundle: true,
  treeShaking: true,
  minify: false,
  sourcemap: true,
  packages: 'external',
  external: ['@hyperforge/shared', ...sharedServerOnlyExternals],
  target: 'node22',
  loader: {
    '.ts': 'ts',
  },
})

await serverCtx.rebuild()
await serverCtx.dispose()

// Build the agent behavior worker as a separate file (loaded by worker_threads)
const workerCtx = await esbuild.context({
  entryPoints: ['src/eliza/worker/agentBehaviorWorker.ts'],
  outfile: 'dist/agentBehaviorWorker.js',
  platform: 'node',
  format: 'esm',
  bundle: true,
  treeShaking: true,
  minify: false,
  sourcemap: true,
  packages: 'external',
  external: ['@hyperforge/shared', ...sharedServerOnlyExternals],
  target: 'node22',
  loader: {
    '.ts': 'ts',
  },
})

await workerCtx.rebuild()
await workerCtx.dispose()
console.log('✓ Agent behavior worker built')

// Copy PhysX WASM files to assets/web/ for server-side loading
import fs from 'fs'
const assetsDir = path.join(rootDir, 'world/assets/web')
fs.mkdirSync(assetsDir, { recursive: true })

// Copy from physx-js-webidl package in workspace
const physxWasm = path.join(rootDir, '../physx-js-webidl/dist/physx-js-webidl.wasm')
const physxJs = path.join(rootDir, '../physx-js-webidl/dist/physx-js-webidl.js')

if (fs.existsSync(physxWasm)) {
  fs.copyFileSync(physxWasm, path.join(assetsDir, 'physx-js-webidl.wasm'))
  fs.copyFileSync(physxJs, path.join(assetsDir, 'physx-js-webidl.js'))
  console.log('✓ PhysX assets copied to world/assets/web/')
} else {
  console.error('❌ PhysX WASM not found at:', physxWasm)
  throw new Error('PhysX WASM files missing - ensure @hyperforge/physx-js-webidl is built first')
}

// Copy shared's server-only dynamic-import targets next to dist/index.js so
// the bundled `await import("./PhysXManager.server")` resolves at runtime.
const distDir = path.join(rootDir, 'dist')
const sharedBuildDir = path.join(rootDir, '../shared/build')
fs.mkdirSync(distDir, { recursive: true })
for (const base of ['PhysXManager.server.js', 'storage.server.js']) {
  const src = path.join(sharedBuildDir, base)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, base))
    const map = src + '.map'
    if (fs.existsSync(map)) fs.copyFileSync(map, path.join(distDir, base + '.map'))
  } else {
    console.error('❌ Shared server-only module missing:', src)
    throw new Error(`Missing ${base} in shared build — run shared build first`)
  }
}
console.log('✓ Shared server-only modules copied to dist/')

console.log('✓ Server built successfully')

