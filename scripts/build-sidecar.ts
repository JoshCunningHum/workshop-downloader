// Builds the fswatch sidecar and copies it to src-tauri/binaries/fswatch-<target-triple>[.exe],
// the file name Tauri's `bundle.externalBin: ["binaries/fswatch"]` expects.
//
// Usage: bun scripts/build-sidecar.ts [--target <triple>]
// Under `tauri dev` / `tauri build` the target comes from TAURI_ENV_TARGET_TRIPLE.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const targetArg = process.argv.indexOf('--target')
const target = (targetArg !== -1 ? process.argv[targetArg + 1] : undefined) ?? process.env.TAURI_ENV_TARGET_TRIPLE
const triple = target ?? hostTriple()

const cargo = ['cargo', 'build', '-p', 'fswatch', '--release', '--manifest-path', join(root, 'src-tauri', 'Cargo.toml')]
if (target) cargo.push('--target', target)

const build = Bun.spawnSync(cargo, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

const ext = triple.includes('windows') ? '.exe' : ''
const targetDir = process.env.CARGO_TARGET_DIR ?? join(root, 'src-tauri', 'target')
const built = join(targetDir, ...(target ? [target] : []), 'release', `fswatch${ext}`)
const outDir = join(root, 'src-tauri', 'binaries')
const out = join(outDir, `fswatch-${triple}${ext}`)

mkdirSync(outDir, { recursive: true })
copyFileSync(built, out)
console.log(`sidecar: ${out}`)

function hostTriple(): string {
  const result = Bun.spawnSync(['rustc', '--print', 'host-tuple'])
  if (result.exitCode !== 0) throw new Error('`rustc --print host-tuple` failed (needs Rust 1.84+)')
  return result.stdout.toString().trim()
}
