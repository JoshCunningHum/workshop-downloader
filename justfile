# Common commands for developing and building Workshop Downloader. `just` lists them.

manifest := "src-tauri/Cargo.toml"

# List the recipes
default:
    @just --list

# Install JS dependencies (as CI does)
install:
    bun install --frozen-lockfile

# Run the app: builds the fswatch sidecar, starts Nuxt on :3000 and opens the Tauri window
dev:
    bun tauri dev

# Serve only the UI in a browser (no Tauri: no database, SteamCMD or webviews)
web:
    bun run dev

# Build the fswatch sidecar into src-tauri/binaries (needed before any cargo build/test)
sidecar:
    bun run sidecar

# Build the release installers (NSIS/MSI on Windows)
build:
    bun tauri build

# Lint the frontend
lint:
    bun run lint

# Lint and fix what can be fixed automatically
lint-fix:
    bunx eslint . --fix

# Typecheck the frontend
typecheck:
    bun run typecheck

# Frontend unit tests (pass a file or filter to narrow them down, e.g. `just test bbcode`)
test *args:
    bunx vitest run {{args}}

# Frontend unit tests in watch mode
test-watch *args:
    bunx vitest {{args}}

# Rust unit tests for the app and the sidecar
test-rust *args: sidecar
    cargo test --workspace --manifest-path {{manifest}} {{args}}

# Check the Rust code compiles
check-rust: sidecar
    cargo check --workspace --manifest-path {{manifest}}

# Clippy over the Rust code
clippy: sidecar
    cargo clippy --workspace --manifest-path {{manifest}}

# Format the Rust code
fmt:
    cargo fmt --all --manifest-path {{manifest}}

# Generate a SQL migration from changes to app/lib/db/schema.ts
db-generate:
    bun run db:generate

# Everything CI checks: lint, typecheck, TS tests, Rust tests
ci: lint typecheck test test-rust

# Remove build output (Nuxt, Tauri target, built sidecar)
clean:
    rm -rf .nuxt .output src-tauri/binaries
    cargo clean --manifest-path {{manifest}}
