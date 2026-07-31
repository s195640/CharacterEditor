# Milestone 4: GUI controls for animation and equipment

## What was built

A control panel docked to the right side of the screen, replacing the need to
know the keyboard shortcuts to use the tool.

- `shell/ui.ts` — `createControlPanel(options)`: plain DOM, no framework. Builds
  an "Animations" section (one button per name from `animationController.list()`,
  each calling `onSelectAnimation(name)`) and an "Equipment" section (one
  toggle button, label switching between `Equip Helmet` / `Remove Helmet`).
  Returns `{ setEquipmentState(equipped) }` so callers can push state changes
  into the button label from anywhere.
- `shell/ui.css` — new file, linked from `index.html`. Fixed 220px right-side
  panel, dark translucent background, plain buttons.
- `shell/index.html` — canvas width changed to `calc(100% - 220px)` so the
  panel sits beside the 3D view rather than overlapping it.
- `shell/main.ts` — wires `createControlPanel` in; the existing `Space`/`E`
  keyboard shortcuts were kept rather than removed.

## Key decisions made

- **Plain DOM, no UI framework.** A handful of buttons doesn't need React/Vue/
  etc. — no new runtime dependency, consistent with how minimal the rest of
  Shell has stayed.
- **Single equip button, not a multi-item list.** Only one equipment asset
  (Helmet) exists; a list-style inventory UI would have been speculative until
  there's a second item to justify it.
- **Keyboard and GUI share one code path.** `main.ts` keeps one `setEquipped`
  function that both the `KeyE` listener and the panel's button call — the
  button's label update lives inside `setEquipped` itself, not duplicated in
  two places, so the two input methods can never drift out of sync with each
  other.
- **Inserted into the roadmap as milestone 4**, ahead of Export and Generalize
  (renumbered to 5 and 6) — the user asked for this now, out of the original
  planned order.

## What was tried and rejected

Nothing at the architecture level — this was a small, well-understood UI task
with no real unknowns.

## How it was verified

- `tsc --noEmit` passed.
- Headless Chromium (Playwright): confirmed all four buttons render
  (`Walking`, `Idle`, `Running`, `Equip Helmet`) with the correct initial
  label; clicked `Idle` and confirmed the visible pose changed; clicked
  `Equip Helmet` and confirmed both the helmet appeared on the character *and*
  the button label flipped to `Remove Helmet`; pressed the `E` key afterward
  and confirmed the label flipped back to `Equip Helmet`, proving the keyboard
  and GUI paths stay in sync through the shared `setEquipped` function.
  Screenshots also confirm the panel sits beside the character without
  overlapping it.
- Browser console showed no errors throughout.
