# Windows handoff checklist

Milestones 1–8 of `plans/create-a-nuxt-ancient-pizza.md` are implemented. Development happened on
macOS, so the `cfg(windows)` code has only been compiled by the `windows` CI workflow, and none of
the Windows behavior below has been tried for real yet. Please go through this list on a Windows
machine and note results (or fixes) next to each item.

## Setup

```powershell
bun install
bun tauri dev        # builds the fswatch sidecar, starts Nuxt, opens the app
bun tauri build      # NSIS + MSI installers in src-tauri/target/release/bundle/
cargo test --workspace --manifest-path src-tauri/Cargo.toml
bunx vitest run
```

## Smoke test

1. Settings → choose a library folder on the same drive as a Steam game.
2. Settings → SteamCMD → *Install now*. Expect `%APPDATA%\com.kenshi.workshopdownloader\steamcmd\base`
   to fill, and the log to show the self-update.
3. Add items → paste a workshop URL of a game that allows anonymous downloads → Resolve. The AppID
   group should appear with the game name.
4. Download. The job card shows a worker number, a moving progress bar, and log lines.
5. The item lands in `<library>\<appId>\<itemId>\<time_updated>\`, and (if the game has a mods
   folder set, e.g. RimWorld via its adapter) a junction appears in the mods folder.
6. Download the same item again after it updates (or delete the newest snapshot row's time on purpose) and
   switch between snapshots on the item page: the junction must re-point and old folders stay intact.
7. Queue 3+ items across different games at once: separate workers, no clashes.

## Risks to verify

- [ ] **Several SteamCMD instances sharing one folder.** We assume they can't, so each worker gets a
      copy (`steamcmd\worker-N`, cloned from `base`). If sharing turns out to be safe, the copies can go.
- [ ] **SteamCMD exit code after the first self-update.** Commonly reported as `7` on Windows; the
      install step ignores the exit code and only checks that `steamcmd.exe` exists. Confirm a second
      job right after install works.
- [ ] **stdout buffering when piped.** Progress comes from the fswatch sidecar either way, but the
      result lines (`Success. Downloaded item …`, `ERROR! Download item … failed (…)`) must arrive. If
      they don't, jobs fall back to "files exist in the content folder" and log a warning.
- [ ] **Output fixtures.** `src-tauri/src/steamcmd/fixtures/*.log` were written from known SteamCMD
      output formats, not captured from a live run. Please replace them with real captures (an
      anonymous download with one good and one bad id, and a Steam Guard login) and re-run `cargo test`.
- [ ] **Steam Guard flow.** With an account: the first download should stop with "Steam Guard code
      needed", the job card asks for the code, and the retry passes `+set_steam_guard_code`. Check both
      email codes and mobile authenticator codes.
- [ ] **Login cache between workers.** After one worker logs in, `config\config.vdf` is copied to
      `steamcmd\login-cache\<user>\` and into other workers before they log in. Check that a second
      worker doesn't ask for Steam Guard again.
- [ ] **Password on the command line.** Account passwords are read from Credential Manager and passed
      as `+login user password`, because SteamCMD's password prompt isn't known to work over a pipe.
      Other processes of the same Windows user can see command lines. Worth checking whether
      `+login user` alone works once the login cache exists; if so, pass the password only when needed.
- [ ] **Junctions across drives.** Junctions need local NTFS volumes. A library on a network drive or
      exFAT should fail with a clear message.
- [ ] **Symlink mode.** Needs Developer Mode or admin; without it, linking should fail with a message
      saying so.
- [ ] **Link safety.** Put a real folder where a link would go: the app must refuse and leave it alone.
- [ ] **Long paths (>260 chars) in mods.** Not handled yet. Tauri's default app manifest doesn't declare
      `longPathAware`; adding it means a custom manifest in `build.rs` (keep the common-controls
      dependency Tauri adds). Test with a mod that has deep folders.
- [ ] **Antivirus.** Windows Defender scanning SteamCMD downloads or locking staging folders. The
      staging → library move falls back to copy + delete if the rename fails, but a locked file will
      still fail the item.
- [ ] **Registry lookup.** `HKCU\Software\Valve\Steam\SteamPath` → library folders → appmanifests. The
      "Find in Steam" button on a game's settings tab should fill the install folder.
- [ ] **No console windows.** SteamCMD runs with `CREATE_NO_WINDOW`; no window should flash per job.

## Not run during development

Because of sandbox limits on the dev machine (files matching `*token*` couldn't be read), these
weren't run there:

- ESLint (`bun run lint`) and `nuxt typecheck` (vue-tsc was run directly and passes).
- The 3 XPath cases in `test/engine.test.ts`, which need jsdom. The other cases pass.

They run in CI (`ci.yml` runs lint + typecheck, `windows.yml` runs vitest).

## macOS dev notes

- macOS uses symlinks instead of junctions and `steamcmd_osx.tar.gz` instead of the zip.
- SteamCMD for macOS may need Rosetta 2 on Apple Silicon (not verified).
