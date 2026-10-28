# Decoherence art

Source sprites for the game, one `.aseprite` file per sprite (`grover.aseprite`, `tile.aseprite`, ...).
Files whose name starts with `_` are scratch: they are not exported and `.gitignore` keeps them out of the repository.

## Conventions

- RGB colour mode, pixels drawn at the game's world scale (the window is about 200 world pixels tall).
- Palette: the PAL colours from `../index.html` (cyan `#7fdfff`, mint `#9affd6`, gold `#ffcc55`, violet `#7a6cff`, ink `#e8fbff`, bg `#060812`). Red is reserved for the classical world.
- One **tag** per animation (`idle`, `fire`, `read`, ...). Frame durations in Aseprite are what the game plays.
- Keep every frame of a sprite the same size.

## Sprites

| Source | Built by | Size | Tags |
| --- | --- | --- | --- |
| `cand.aseprite` | `make_cand.lua` | 15×15 | three kinds of each side, every one 4 amplitude levels × 12 frames at 80 ms: right `ra` s-orbital, `rb` sigma bond, `rc` trio (no nodes, bright samples travelling through them); wrong `wa` p-orbital, `wb` d-orbital clover, `wc` 2s-orbital (with nodes). Tags `r<kind><level>`, `w<kind><level>`, flashes `r<kind>f`, `w<kind>f` |
| `floor.aseprite` | `make_floor.lua` | 112×194 | `idle` (4 × 200 ms): the cryo deck inside the window, hexagonal plates 112 px across with coolant seams, a light running round each plate, blinking status lights; one seamless tile (two lattice rows) |
| `register.aseprite` | `make_register.lua` | 64×64 | `idle` (6 × 200 ms): the warm deck outside the window, hexagonal plates 32 px wide on 32 px rows, dim noise colours breathing out of step, hot-pixel sparkle; one seamless tile at the warps' 64 px period |
| `ripple.aseprite` | `make_ripple.lua` | 29×29 | candidates outside the window, rings travelling outward (8 × 90 ms): `n0`–`n2` neutral by amplitude, `r` the oracle on a right answer, `w` on a wrong one (dark node at the centre) |
| `icons.aseprite` | `make_icons.lua` | 24×24 | one frame per gate or flag, tagged with its id (`bolt`, `sweep`, `wave`, `orbit`, `ladder`, `field`, `spin`, `amplify`, `cancel`, `feedforward`, `readfast`, `mitigation`, `coherence`, `suppression`, `zeno`, `momentum`); the compile cards and the hold's loadout draw from it |
| `errors.aseprite` | `make_errors.lua` | 20×20 | the faults, outlined hard pixels: `noise` (4 × 80 ms static swarm), `noise_hit`; `bug` (2 × 120 ms acid-green circuit mite), `bug_frozen`, `bug_hit`; `sim` (4 × 160 ms vacuum tube, filament glowing), `sim_feed`, `sim_hit` |
| `title.aseprite` | `make_title.lua` | 200×28 | `idle` (45 frames, about 6 s): DECOHERENCE in hand-drawn 7×10 lettering at 2×, from a neutral haze through the oracle's marking and amplification to the bevelled gold word with a glint, then a read flash and the collapse |
| `grover.aseprite` | `make_grover.lua` | 11×11 | `idle` (8 × 100 ms, the two lobes meet twice), `fire` (1 × 50 ms recoil), `collapse` (4 × 50 ms, the ring falls onto the query dot), `reading` (4 × 80 ms loop, the dot pulses), `reset` (5 × 50 ms Hadamard flash), `hurt` (1 frame, red) |

Generated sprites carry a hidden `bg` layer (the page background, for viewing in Aseprite): keep it hidden, the export
takes visible layers only. Rebuild a generated sprite with its script rather than editing the file by hand:

```
"C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=. --script make_grover.lua
```

The game loads a sheet with `loadSheet(name)` in `../index.html` (PNG + JSON from `../img/`), picks the frame of a tag
from the game clock, and keeps drawing the old procedural sprite until the sheet is in (or where it cannot load, as in
the single-file copy). Grover's states are driven by `play(tag, once, next)`: `collapse` → `reading` when a read begins,
`reset` when it ends, `fire` on a phase kick, `hurt` while invulnerable, `idle` otherwise.

## Export

```
powershell -ExecutionPolicy Bypass -File export.ps1
```

Writes `../img/<name>.png` (packed sheet) and `../img/<name>.json` (Aseprite `json-array` format: a `frames` list with
`filename` = `name#tag#frame`, `frame` rect, `duration` in ms, and `meta.frameTags` with `from`/`to`).
`-Only <name>` exports one sprite. Aseprite is found in `$env:ASEPRITE` or the default install folder.

## Scripting Aseprite

Sprites can also be generated or batch-edited with Aseprite's Lua API in batch mode:

```
"C:\Program Files\Aseprite\Aseprite.exe" -b --script-param out=. --script make_grover.lua
```

Two gotchas: save Lua files as UTF-8 **without** a byte-order mark (PowerShell's `-Encoding utf8` adds one and Aseprite
refuses the file), and draw on frames made with `spr:newFrame()`; a frame from `spr:newEmptyFrame()` has no cel until
`spr:newCel(layer, frame)` is called. Paths must stay short; Aseprite cannot write into very long Windows paths.
