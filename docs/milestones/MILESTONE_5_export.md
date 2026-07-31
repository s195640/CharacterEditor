# Milestone 5: Export to glTF + manifest

## What was built

An "Export" button in the control panel that downloads the current character
state as `character.glb` plus a `character.manifest.json` describing it.

- `core/exporter.ts` — `exportCharacter(scene, options)` calls
  `GLTF2Export.GLBAsync(scene, "character", { shouldExportNode })` and returns
  `{ gltfData, manifest }`. The manifest is minimal: `sourceCharacter`
  (the base character file), `animations` (every loaded `AnimationGroup`
  name), and `equippedItems` (whatever the caller says is currently equipped).
  Core returns the raw `GLTFData` rather than triggering a download itself —
  "how to deliver the export" is a Shell/host concern, consistent with the
  existing Core/Shell split.
- `shell/ui.ts` — added an "Export" section/button; `ControlPanelOptions`
  gained `onExport`.
- `shell/main.ts` — the Export button calls `exportCharacter` with
  `shouldExportNode: (node) => equipped || !equipmentMeshes.some((mesh) => mesh === node)`
  (excludes the equipment mesh specifically, and only when unequipped), then
  triggers both downloads: `gltfData.downloadFiles()` for the `.glb`, and a
  small Blob+anchor helper for the manifest JSON.
- `package.json` — added `@babylonjs/serializers` (`9.19.0`, matching the
  existing Babylon packages) as a new runtime dependency, approved by the user
  before implementation.

## Key decisions made

- **Only currently-equipped items are included in the export** — the Helmet
  is fully excluded (not just hidden) from the `.glb` when unequipped.
- **Minimal manifest schema** — no slot structure, versioning, or other
  speculative fields until a real consumer exists to need them.
- **Export button in the GUI**, not a keyboard shortcut — consistent with
  Milestone 4 making the tool GUI-first.
- **Core owns serialization + manifest construction; Shell owns the actual
  browser download.** Verified this split holds up in practice: `GLTFData`'s
  own `downloadFiles()` method is genuinely Babylon's browser-specific
  delivery mechanism, separate from the data itself.

## What was tried and rejected

Nothing at the architecture level — `GLTF2Export.GLBAsync`'s `shouldExportNode`
option was confirmed via Babylon.js docs/forum before implementation and
worked as documented.

## How it was verified

- `tsc --noEmit` passed.
- Playwright captured both downloaded files across two exports (helmet
  unequipped, then equipped) and inspected them directly rather than trusting
  file presence alone:
  - `character.manifest.json` differed correctly: `equippedItems: []` vs.
    `["Helmet"]`; `animations` was `["Walking", "Idle", "Running"]` in both
    (animations aren't gated by equip state, as intended).
  - The `.glb`'s JSON chunk was parsed directly (reading the GLB header/JSON
    chunk by hand — no external library needed) to confirm exactly what
    `shouldExportNode` did: in the unequipped export, the `Helmet` node exists
    only as an empty transform (no `mesh`/`skin` property — hierarchy
    scaffolding, no payload); in the equipped export, a second `Helmet` node
    carries the actual `mesh`/`skin` reference. File size also differed
    (~110KB) consistent with the geometry being included only when equipped.
- Browser console showed only benign warnings (`Light light is not supported
  in KHR_lights_punctual` / `EXT_lights_area` — glTF has no hemispheric-light
  equivalent, so the exporter skips it; harmless, the light is a Shell-side
  scene-setup concern, not part of the character asset).
