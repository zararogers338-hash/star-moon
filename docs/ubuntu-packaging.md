# Star Moon: Ubuntu-first local packaging

This source tree now builds a distinct **Star Moon** desktop package. It does not
replace the installed Codex app or an existing Codex Web GPT installation. The
launcher and bundled runtime both remain at **5.0.2**; the internal runtime CLI
and its checksummed manifest keep their existing protocol names.

## Package identity

| Item | Star Moon value |
| --- | --- |
| npm/Electron package name | `star-moon` |
| Desktop product name | `Star Moon` |
| App id | `dev.starmoon.launcher` |
| Linux executable | `star-moon` |
| Desktop file | `star-moon.desktop` |
| Linux window class | `star-moon` |
| Debian package name | `star-moon` |
| Targets | AppImage and deb |
| Artifact template | `star-moon-${version}-${os}-${arch}.${ext}` |
| Optional autostart file | `dev.starmoon.launcher.desktop` |

For an x86-64 build, the AppImage copied to `launcher/artifacts` is named
`star-moon-5.0.2-linux-x64.AppImage`. The deb uses the same configured template;
verify the actual filename and its Debian `Architecture` field after building.
The packager collects `.deb` files as well as AppImages. Older-version artifacts
and upstream-named packages remain untouched. Before replacing an artifact with
the same filename, the previous file is copied into a timestamped
`launcher/artifacts/history` directory; the new file is then published by an
atomic rename. Smoke verification selects only the current version.

The package metadata homepage identifies the **upstream source repository**,
not an endorsed Star Moon support/release site. `noreply@star-moon.invalid` is an
explicit local-build maintainer placeholder, not a monitored address. The fork's
automatic update feed remains disabled until its own repository and release
artifacts are configured and verified. The retained upstream
`scripts/install-launcher.sh` and `.ps1` are intentionally not Star Moon
installers. A configured Star Moon release must publish and use
`scripts/install-star-moon.sh` or `.ps1`, with `STAR_MOON_REPOSITORY` set
explicitly.

## Data isolation

On a normal Ubuntu desktop, with no Star Moon-specific overrides:

| Purpose | Default location |
| --- | --- |
| Core runtime, runtime versions, descriptor and runtime config | `~/.star-moon` |
| Electron user data, launcher state and logs | `~/.config/Star Moon` (Electron `appData/Star Moon`) |
| Browser session partition | `persist:star-moon-chatgpt`, inside Star Moon user data |
| AgentDock and Moon Letter data | Subdirectories of Star Moon user data |
| Development core | `~/.star-moon-dev` |
| Development Electron data | `~/.star-moon-dev/launcher` |
| Development Codex target | `~/.star-moon-dev/codex-home` |
| Development browser partition | `persist:star-moon-dev-chatgpt` |

No cookies, saved credentials, state, runtime configuration or executable runtime
are copied from Codex Web GPT. The launcher ignores the legacy
`CODEX_CHATGPT_WEB_HOME`, `CODEX_WEB_GPT_LAUNCHER_DATA_DIR` and
`CODEX_WEB_GPT_DEV_HOME` variables when selecting its storage. Explicit Star Moon
paths are rejected if they overlap Codex/legacy application homes or the other
Star Moon profile, including paths through existing symlinks. Broad locations
such as a home directory, filesystem root or the system temporary root are not
accepted as application storage roots.

Supported explicit overrides:

- `STAR_MOON_HOME`: production core storage.
- `STAR_MOON_LAUNCHER_DATA_DIR`: production Electron data.
- `STAR_MOON_DEV_HOME`: development core; its launcher and Codex homes are nested
  inside it.
- `STAR_MOON_CODEX_HOME`: an explicit production integration target, useful for a
  fully isolated smoke test.
- `STAR_MOON_LAUNCHER_EXECUTABLE` / `STAR_MOON_APPIMAGE`: stable launcher path for
  optional autostart.
- `STAR_MOON_SMOKE_FILE`: readiness marker for `--launcher-smoke-test`.

Production's default **integration target** is still the user's `CODEX_HOME`, or
`~/.codex` if unset. That path is not used for Star Moon cookies or state. A fresh,
unconfigured Star Moon profile does not install a Codex route; changing the
normal Codex configuration remains the existing explicit model-install/setup
action. Do not invoke setup, route replacement, tunnel setup or account import
as part of an installation-only trial. A previously configured Star Moon profile
can resume its already-authorized runtime on later launches.

## Build and inspect

Build on the target Linux architecture: the bundle contains native Bun and the
packaging script intentionally rejects cross-OS packaging. Use the existing
project dependencies and preserve the root/launcher/runtime version match.

From the repository root:

```sh
# AppImage builds need the pinned libnotify ABI and an owned AppImage toolset.
sudo apt-get update
sudo apt-get install -y meson ninja-build pkg-config libglib2.0-dev libgdk-pixbuf-2.0-dev binutils
./scripts/prepare-linux-libnotify.sh
export CODEX_WEB_GPT_LINUX_LIBNOTIFY="$PWD/launcher/build/linux-libs/libnotify.so.4"
bun run launcher/scripts/prepare-linux-appimage-tools.cjs
export APPIMAGE_TOOLS_PATH="$PWD/launcher/build/appimage-tools"
bun run --cwd launcher package:linux
```

These preparation commands are required for an AppImage because distributions may
ship an older `libnotify` and electron-builder's shared AppImage tool cache is
not modified in place. The package script verifies the final AppImage's exported
symbols before publishing it, so an incomplete preparation fails before a broken
artifact is copied to `launcher/artifacts`. A Debian-only build does not need the
AppImage prerequisites: use `bun run --cwd launcher scripts/package.cjs --linux deb`.
The successful build runs renderer typechecking/build, prepares the checksummed
native runtime and license notices, then invokes electron-builder with publication
disabled. Completed distributables are copied to `launcher/artifacts`.

For a staged directory-only trial before creating installers, from `launcher`:

```sh
bun run build
bun run build:runtime
node node_modules/electron-builder/out/cli/cli.js --linux dir --publish never --config.directories.output=release/star-moon-trial
```

Before any system installation, inspect the exact newly built deb with
`dpkg-deb --field` and `dpkg-deb --contents`. Confirm `Package: star-moon`,
`Version: 5.0.2`, the native architecture, a Star Moon-only `/opt` installation
directory, the `star-moon` executable/desktop entries and distinct AppArmor
profile. The default electron-builder Debian scripts register that executable,
refresh desktop/MIME metadata and manage the package's own sandbox/AppArmor
files. They are not run by building or by the offline contract tests.

For the first local Ubuntu trial, an AppImage or staged directory can be launched
as the ordinary user without replacing system packages. Keep the artifact in a
stable, Star Moon-specific location; do not point its optional autostart entry at
a temporary extraction directory. Actual installation and desktop registration
are a separate, user-authorized step. Never enter a password in chat or a command
argument; use the local system prompt if an administrator install is chosen.

## Verification and limits

The package smoke script uses fresh `STAR_MOON_*` temporary homes, including a
temporary Codex integration target, and disables its ordinary startup-login
refresh. From the repository root:

```sh
bun run --cwd launcher smoke:package
```

The Ubuntu AppImage smoke path currently expects x86-64 and `xvfb-run`; this is
not proof of an interactive desktop session, a completed login, a working model
route or AgentDock authorization. When those host dependencies are unavailable,
report that limitation and perform a supervised native desktop trial instead of
declaring GUI success from packaging alone.

The inherited model-route default is **127.0.0.1:17841** (`src/config.ts`). Data
isolation does not reserve another TCP port. An existing Codex Web GPT route may
already own it; check the host listener before explicit model setup and choose a
separate port through the supported setup workflow if needed. Do not stop,
replace or reconfigure an existing service to make a trial pass. AgentDock's
usual local port 8765 is a different service, and changing its OAuth metadata or
restarting it is not part of packaging.

The packaging/profile tests use synthetic paths, fake metadata and private test
directories. They validate identities, storage separation, `.deb` collection and
preservation of an existing autostart entry. A successful source build alone is
not an installed-app or end-to-end integration result.
