# Handout Generator

Local desktop editor for creating single-page handouts. The app uses Tauri for file/resource management and Vue 3 + Konva for the editor canvas.

## Stack

- Tauri 2 backend in Rust
- Vue 3 + TypeScript + Vite frontend
- Konva / vue-konva canvas rendering
- shadcn-vue UI components
- Pinia editor state

## Development

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm tauri dev
```

Run the browser-only frontend preview:

```bash
pnpm dev
```

The browser preview is useful for layout work, but file import, project persistence, and resource reads require the Tauri desktop runtime.

## Data Location

Runtime data is stored under the repository-local `data/` directory:

```text
data/
  library/
    backgrounds/
    assets/
    fonts/
    index.json
  projects/
    <project-id>/
      handout.json
      metadata.json
```

`data/` is ignored by git because it contains user projects and imported files.

## Configuration

Local build-time configuration lives in `configuration.toml`.

```toml
[mask]
enabled = true
use_pixi_preview = true
```

- `enabled = false` disables all mask UI, mask editing, mask preview composition, and mask application during preview/export/flat rendering.
- `use_pixi_preview = false` keeps masks enabled but disables PixiJS for low-frequency layer-mask preview composition. Final export still uses the deterministic Canvas2D/Konva path.

## Workflow

The app opens on the project manager, not directly in the editor.

- `Handouts`: create a handout from an existing background, upload a new background, or start from a transparent blank canvas with a custom pixel size.
- `Backgrounds`: drag or upload base images for handouts.
- `Assets`: drag or upload image assets and textures that can be added as canvas layers.
- `Fonts`: drag or upload font files and tag them for retrieval.

Opening a handout switches to the canvas editor. The editor has:

- left sidebar tabs for assets, fonts, and layers
- center Konva canvas
- right sidebar tabs for element inspection, document type/details, and export

Backgrounds are chosen only during handout creation. The editor does not support changing the background afterward.

## Document Model

Each handout is saved as a project folder with `handout.json`. The document stores:

- schema version
- title
- pixel canvas size
- transparent canvas background by default
- optional `backgroundAssetId`
- ordered image/text layers
- layer transform, opacity, blend mode, and basic effect fields

Imported resources are referenced by stable resource ids instead of raw source paths.

## Verification

Useful checks:

```bash
pnpm exec vitest run
pnpm run build
cd src-tauri && cargo build
```

`pnpm run build` currently emits Rolldown warnings from dependency pure annotations in `@vueuse/core`; the build still completes successfully.
