# Nhi's Dream Zoo 🌸

A premium 3D interactive zoo built as a personal gift for **Nhi** — a pastel fantasy
world of pastel gardens, ponds, waterfalls of light and **ten hand-rigged, skeletally
animated animals** you can pet, feed and play with.

Built with **Three.js**, vanilla JS ES modules and Vite. No game engine, no templates,
no emoji stand-ins: every animal is a real skinned mesh with a bone hierarchy, driven by
an `AnimationMixer` with authored animation clips.

---

## 1. Quick start

```bash
# 1. install dependencies
npm install

# 2. (optional) re-bake the animal .glb models from source rigs
npm run build:models

# 3. development server (http://localhost:5173)
npm run dev

# 4. production build + local preview (http://localhost:4173)
npm run build
npm run preview
```

Open the URL, press **Bắt đầu chuyến tham quan** (or **Bỏ qua phần giới thiệu**), and the
cinematic introduction plays into free exploration.

> `npm run dev -- --host` exposes the server on your LAN so you can open it on a phone
> and test the touch controls.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serves the built `dist/` on port 4173 |
| `npm run build:models` | Re-bakes `public/models/*.glb` from the source rigs in `src/rig` |
| `npm run test:diag` | 45 automated end-to-end interaction checks (needs `preview` running) |
| `npm run test:visual` | 18 geometric/layout checks (grounding, water, UI, diacritics) |
| `npm run test:fallback` | Hides a `.glb` and proves the procedural fallback still works |
| `npm run test:anatomy` | Verifies each sculpted animal is one connected, watertight shell |
| `npm run gallery` | Writes the labelled screenshot tour into `screenshots/` |
| `npm run gallery:animals` | Writes 5 angles × 10 species into `screenshots/animals/` |
| `npm run profile:scene` | Prints the draw-call / object breakdown |

---

## 2. What is implemented

### Cinematic introduction (7 paced beats)

1. A slow drift through the dreamy sky while the title screen breathes.
2. The title **"A Little World Made Just For Nhi"** revealed with a staggered
   letter-spacing + blur animation.
3. The camera glides up to the flower-covered **3D gate**.
4. The gate **swings open** with a real point light spilling warm light outward plus a
   petal burst and rising glow motes.
5. A 26-second **flythrough** along an eased spline over the meadow, lake, forest, ice
   isle, lotus pond, grassland, savanna and the secret garden, with the camera
   deliberately slowing at five highlight moments.
6. The personal greeting for Nhi.
7. A seamless settle into free exploration (the exact camera pose the controls take over).

There is a **Skip Intro** button and an **audio toggle**. Music only starts after a user
gesture, as browsers require. If the tab is left on the title screen, the camera keeps
drifting as a live backdrop.

### The world

Ten connected habitats with distinct palettes, decoration, lighting mood and props:
flower meadow & rabbit burrow, baby-elephant grassland, sunset savanna (lions), capybara
lake (capybaras + otters), enchanted forest (foxes, fawns, red pandas), frozen kingdom
(penguins), lotus pond (flamingos) and **Nhi's Secret Garden** (walled-off, unlocked by
exploring).

Terrain is a single vertex-coloured mesh: biome tints (grass, dry savanna, deep forest,
sand banks, rock slopes, snow peaks, dark lake beds), carved lake and pond basins with
soft banks, cobblestone paths, two wooden arch bridges, three instanced tree species,
instanced wildflowers with shader wind, glowing mushrooms, rocks, lanterns, benches,
signposts, habitat fences, rose trellises, an igloo, cattail reeds, lily pads and lotus
blooms, fairy lights and ice crystals. **Time of day** can be switched between dawn, day,
sunset and night (lighting, fog, exposure, stars, lantern glow and fireflies all respond).

### The animals — sculpted as continuous skins

Every animal is a **single continuous surface**, not an assembly of primitives.
`src/rig/implicit.js` is a small implicit-surface (metaball) modeller: each species
describes its anatomy as signed-distance primitives — ellipsoids, tapered capsules and
chains — a smooth-minimum union melts them together, and the surface is polygonised with
marching cubes. `src/rig/anatomy.js` places those primitives **on the animal's own
skeleton**, so the torso, neck, head, brow, cheeks, muzzle, ears, legs, paws, tail and
trunk are literally one shell that flows between parts.

The anatomy is authored in **layers with different blend radii**, which is what keeps
the animals both cohesive *and* recognisable:

* the **torso** (hips → spine → chest → shoulder/haunch masses) melts with a wide blend
  into one barrel, and its belly is automatically lifted until it clears the paws, so
  even short-legged species keep visible legs;
* the **neck** tapers until it is clearly thinner than the skull, and the **skull** is a
  cranium + crown + brow + jowls + jaw + tapered muzzle — so the head is a shaped head
  rather than a ball on a tube;
* **ears, muzzles, legs and tails** use a tight blend and keep their own silhouette, so
  a rabbit's ear reads as a blade and a fox's tail as a brush;
* **markings are painted, not bolted on.** Per-vertex colours are baked from the same
  primitives, weighted by distance, so belly panels, face masks, socks, fawn spots and
  tail rings are soft gradients in one material.

Quality passes applied to every species after polygonisation:

* **Taubin (λ/μ) smoothing** removes the marching-cubes stair-stepping without the
  volume loss a plain Laplacian filter would cause.
* **Consistent outward winding** (verified by signed volume). This matters more than it
  sounds: with inward winding every normal points the wrong way *and* raycasts hit the
  far side of the body, which is exactly how eyes and noses used to end up on the back
  of the head. Eye, nose, mouth, hoof and tusk details are now ray-snapped onto the
  sculpted skin and verifiably sit in the face.
* **Manifold repair**: ambiguous cells that pinch two sheets together along one edge are
  separated by splitting the shared vertex per surface fan.
* **Grounding**: the model is shifted so its lowest vertex defines y = 0.

Consequences:

* **No seams, gaps or "spheres stuck on spheres".** Verified: one connected component,
  watertight (zero boundary edges), manifold, no degenerate triangles.
* **Smooth shading** from welded-surface normals (measured agreement with the faceted
  normals: 0.99+).
* **Animation is unchanged.** Vertices are skinned to the same bones with per-vertex bone
  whitelists (a belly vertex can never be grabbed by a nearby leg), so every clip drives
  anatomically sound deformation.

Ten species, each with 15–27 bones and 8–10 animation clips:

| Animal | Name | Locomotion | Special behaviour |
| --- | --- | --- | --- |
| Rabbit | Thỏ Tuyết Mochi | hop (crouch → launch → tuck → land) | long floppy ears with follow-through |
| Capybara | Bác Ba Capybara | slow walk | **swims** — paddling skin, floats in the lake |
| Otter | Rái Cá Mun | quick walk/trot | **swims**, rudder tail |
| Fox | Cáo Nhỏ Lửa | trot/run | chases the thrown ball |
| Fawn | Hươu Con Bambi | walk/run | fawn spots, big listening ears |
| Red panda | Gấu Trúc Đỏ Mun | walk | ringed tail, cream face mask |
| Penguin | Cánh Cụt Bông | **waddle** (roll + shuffle) | flipper flap, **swims** |
| Flamingo | Hồng Hạc Hồng | **stride** (high-knee wade) | stands in the shallows |
| Baby elephant | Voi Con Kem | walk | trunk reach + **water spray**, **swims** |
| Lion cub | Sư Tử Con Nắng | walk/run | tail tuft, playful pounce |

Every species supports: **Idle** (breathing, weight shift, curious look-around, ear
twitches, tail sway), **Walk**, **Run/Play**, **Eat** (lowered neck + chewing, and a
gentle trunk reach for the elephant), **Pet** (look up, lean in, joyful wiggle, fast tail
wag), **Play** (play-bow, pounce), **Sleep** (curled, slow deep breathing, eyes closed)
and **React** (alert). The four semi-aquatic species additionally have **Swim**, a
paddling cycle with a rippling spine, sculling legs and a sweeping tail — so they are
never translated through the water on a land gait. Blinking is a real animation: the
eyeball bones squash on a randomised schedule (with occasional double-blinks), and stay
closed while sleeping.

#### Feet stay on the ground (verified, not assumed)

Authored poses drift: a walk cycle can lift the paws a few centimetres and a play-bow or
a sleeping curl can push them through the floor. So every clip is **grounded
automatically** at rig-build time (`RiggedAnimal.groundClips`): the real skinned
contact vertices (the paws/hooves) are sampled across the clip, and the clip's root
height track is offset by a constant until its lowest contact point rests exactly on
y = 0. The offset is a pure vertical shift, so the animation itself is untouched.

On top of that, each animal **tilts to match the terrain it stands on**
(`updateGroundTilt`), damped, so it does not stand bolt upright on a slope with one
side's paws buried in the hill.

`npm run test:motion` prints the per-clip, per-species ground contact measured from the
real skinned vertices — see §5 for the results.

### Interactions (all verified working)

* **Hover** — a soft ground halo plus a pointer cursor.
* **Click / tap an animal** — the camera smoothly frames it and an elegant info card
  slides in with name, species, tagline, facts, a friendship meter, lifetime interaction
  statistics and the favourite food.
* **Vuốt ve (pet)** — the animal plays its Pet clip, hearts rise, an audio chime plays,
  friendship grows.
* **Cho ăn (feed)** — a food drawer opens with the species' favourite marked. **Drag the
  food onto the animal**, or tap it. The food arcs through the air and lands, then the
  animal walks over (a commanded target outranks idle wandering, so feeding during
  another reaction still ends with the animal arriving). Once it reaches the food its
  head lowers and the food is held **at the muzzle** — recomputed from the head bone
  every frame, so it follows the head down and is never pushed through the body — then
  it chews, sparkles, and returns to idle.
* **Chơi cùng (play)** — a ball is lobbed with a real parabolic arc and decaying bounces;
  lively species sprint after it. The baby elephant plays with water instead, spraying a
  droplet burst.
* **Noticing you** — an idle animal that you walk up close to raises its head and pricks
  up its ears on a long cooldown, so approaching an animal has a visible response.
* **The gift box** in the Secret Garden opens its lid with fireworks and reveals Nhi's
  personal letter.
* **Diary** — habitats explored, animals befriended, pets/feeds/plays, photos, best
  friendship, ten achievements (with unlock toasts) and a full habitat checklist.
* **Photo mode** — a viewfinder overlay that saves a PNG snapshot at raised resolution.
* **Progress persists** in `localStorage` (`nhis_dream_zoo_progress_v1`) and survives
  reloads.

Repeated input is guarded: each action has a short cooldown, and re-triggering the same
reaction inside its own window is ignored so animations can never conflict or double-fire.

### Interface

Designed as one system: a soft-glass top bar (brand + live habitat name, a four-way time
switcher, sound/photo/diary/help icons), a scrollable habitat dock with colour-coded
pips, a contextual hint bar, a detail card, modals, toasts and a help sheet. Typography is
Playfair Display + Quicksand with **full Vietnamese diacritic support**. On phones the card
becomes a bottom sheet and the camera re-frames the selected animal into the upper third
so the panel never covers it. `prefers-reduced-motion` is respected.

---

## 3. Project structure

```
index.html                    markup for every screen
src/
  main.js                     app assembly, frame loop, model streaming
  style.css                   the whole design system
  core/
    SceneManager.js           renderer, camera, lights, fog, day/night, adaptive quality
    AssetLoader.js            GLTF streaming with byte progress + timeouts + fallbacks
    LoadingScreen.js          the pastel loading overlay
  rig/
    implicit.js               implicit-surface modeller (SDF primitives -> marching cubes,
                              Taubin smoothing, winding + manifold repair, grounding)
    anatomy.js                parametric anatomy sculptor (quadruped + bird body plans)
    shapes.js                 geometry primitives for crisp details (eyes, cones, tubes)
    RigBuilder.js             bone hierarchy + skin weighting + material merging
    ClipLibrary.js            analytic animation-clip authoring (incl. hop/waddle/stride/swim)
    templates.js              skeleton + animation-profile templates per body plan
  animals/
    RiggedAnimal.js           the runtime: mixer, state machine, movement, clip grounding,
                              terrain tilt, LOD, blinking, contact probes
    Bunny.js … LionCub.js     one file per species (proportions, palette, personality)
  environment/
    terrainHeight.js          single source of truth for ground height / water / zones
    TerrainSystem.js          ground, paths, bridges, trees, flowers, props (instanced)
    HabitatDecor.js           per-habitat decoration + shader wind
    WaterSystem.js            lake, pond, lily pads, lotus, reeds
    SkySystem.js              gradient dome, sun/moon, stars, clouds
    ZooGate.js                the animated gate + warm spill light
    ParticleSystem.js         petals, fireflies, sparkles, butterflies, bursts, spray
  props/                      SecretGarden.js, FoodItem.js, ToyBall.js
  systems/                    InteractionSystem, UIManager, CinematicDirector,
                              AudioManager (procedural Web Audio), ProgressManager
  controls/TouchController.js mobile gestures
tools/
  build-models.mjs            bakes public/models/*.glb from the sculpted rigs
  dom-shim.mjs                minimal browser globals for headless tooling
  verify-anatomy.mjs          mesh-topology proof for every species
  verify-motion.mjs           per-clip ground-contact proof (sink + foot float)
  verify-fallback.mjs         proves the no-.glb fallback path
  ascii-preview.mjs           renders each species as ASCII side/front/top silhouettes
  capture-gallery.mjs         writes a labelled screenshot tour
  capture-animals.mjs         5 angles x 10 species of model screenshots
  profile-scene.mjs           draw-call / object breakdown report
public/models/*.glb           ten baked skinned animal models + clips
test-diagnostics.js           45 functional checks
test-visual.js                18 geometric / layout checks
test-anatomy (tools/)         70 mesh-topology checks across the ten species
screenshots/                  the captured tour
```

---

## 4. How the 3D models work (and how to replace them)

The animals are **not** loaded from a third-party asset pack — each one is sculpted from
an implicit surface in `src/rig/anatomy.js` (see §2) and then **baked into a real `.glb`**:

```bash
npm run build:models
```

That script (running headless in Node, with a tiny DOM shim so three's `GLTFExporter`
works outside a browser) writes `public/models/*.glb`, each containing:

* a `THREE.SkinnedMesh` per material, with `skinIndex`/`skinWeight` attributes,
* the full bone hierarchy (`root`, `hips`, `spine1/2`, `chest`, `neck`, `head`, `earL/R`,
  `eyeL/R`, `tail1-3`, `legFL/FR/BL/BR` + `shin*`/`foot*`, plus `trunk1/2` for the
  elephant), and
* 8–9 `AnimationClip`s (`Idle`, `Walk`, `Run`, `Eat`, `Pet`, `Play`, `Sleep`, `React`,
  plus `Spray`/`Flap` where relevant).

At runtime `main.js` streams them one at a time with `GLTFLoader` (real progress on the
loading bar) and calls `animal.applyGLTF(gltf)`, which swaps the procedural mesh for the
loaded one and rebuilds the `AnimationMixer`. Because the GLB is exported from the same
rig, bone names still match, so blinking and the state machine keep working.

**Two-layer safety:** every animal is born with its procedural rig already attached. If a
`.glb` is missing, times out, or is malformed, `AssetLoader` warns and that species simply
keeps its procedural rig — the world never breaks and the loading screen is released after
a hard 5-second cap regardless.

### Replacing a model with a third-party asset

1. Drop your file at `public/models/fox.glb` (keep the same lowercase id).
2. Make sure it contains a **skinned** mesh and animation clips named `Idle`, `Walk`,
   `Run`, `Eat`, `Pet`, `Play`, `Sleep`, `React`.
3. Reload. Nothing else needs to change — `applyGLTF` adapts, and the clip metadata table
   in the species file (`clipMeta`) tells the locomotion system the stride length so feet
   stay locked to the ground.

If your asset uses different clip names, either rename them, or edit
`RiggedAnimal.setState()` (the `mapping` object) and `buildClipSet` names to match.

### Adding a new species

Copy an existing species file (e.g. `src/animals/Fox.js`), import it in `main.js`, add it
to the `MODEL_MANIFEST`, and add its id to `ANIMALS` in `src/systems/ProgressManager.js`.
The template system handles the rig, clips, AI, interaction and UI card automatically.

---

## 5. Testing performed

Everything below was actually executed; results are from the commands shown. Both suites
drive the real UI in headless Chrome (Puppeteer) on the **built** `dist/` bundle.

```bash
npm run build && npm run preview     # in one terminal
npm run test:diag                    # → 46/46 checks passed
npm run test:visual                  # → 18/18 checks passed
npm run test:fallback                # → ALL PASS
npm run test:anatomy                 # → ALL PASS (mesh topology of every species)
npm run test:motion                  # → ALL PASS (ground contact of every clip)
npm run preview:ascii                # → ASCII silhouettes of all ten species
node tools/capture-gallery.mjs       # → 24 screenshots, no page errors
node tools/capture-animals.mjs       # → 50 animal screenshots, no page errors
```

**Anatomy suite (70 checks, all passing) — the evidence that the animals are cohesive
sculpted characters rather than an assembly of primitives.** Measured from the real mesh
data of all ten species:

| species | triangles | vertices | primitives | connected shells | boundary edges | non-manifold | degenerate | smooth shading |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bunny | 21 750 | 10 877 | 59 | **1** | 0 | 0 | 0 | 0.991 |
| capybara | 32 030 | 16 017 | 56 | **1** | 0 | 0 | 0 | 0.994 |
| otter | 23 498 | 11 751 | 59 | **1** | 0 | 0 | 0 | 0.994 |
| fox | 23 394 | 11 699 | 61 | **1** | 0 | 0 | 0 | 0.992 |
| deer | 21 420 | 10 712 | 63 | **1** | 0 | 0 | 0 | 0.992 |
| red panda | 29 114 | 14 559 | 60 | **1** | 0 | 0 | 0 | 0.994 |
| penguin | 24 210 | 12 107 | 37 | **1** | 0 | 0 | 0 | 0.996 |
| flamingo | 24 680 | 12 342 | 39 | **1** | 0 | 0 | 0 | 0.993 |
| elephant | 31 318 | 15 661 | 71 | **1** | 0 | 0 | 0 | 0.990 |
| lion cub | 30 068 | 15 036 | 60 | **1** | 0 | 0 | 0 | 0.994 |
| **total** | **261 482** | | | | | | | |

"connected shells = 1" means the whole animal — torso, neck, head, ears, legs, tail and
(where applicable) trunk — is one welded surface with no detached pieces. Zero boundary
edges means it is watertight: there are no holes or gaps anywhere. The suite also asserts
that each animal's feet rest on the ground plane and that a horizontal slice through the
torso is a single continuous mass (no floating blobs).

**Motion suite (`npm run test:motion`) — the evidence that no clip floats or sinks.**
Every species × every clip (95 clips), sampled at 60 points through the clip, measuring
the real skinned vertices through the bone matrices. Two numbers per clip:

* `sink` — the lowest point reached, in character space where y = 0 is the ground. A
  negative value means a part of the body went through the floor.
* `foot` — the lowest point reached by the *contact* vertices (the paws/hooves, i.e. the
  vertices that sit near y = 0 in the rest pose). It should touch 0 at some point in the
  cycle; a positive value means the animal is floating.

Result: **every clip of every species passes** — `foot` is within ±1 mm of 0 and nothing
reaches more than 1 mm below the floor, after the automatic clip-grounding and terrain
tilt described in §2.

**Functional suite (46 checks, all passing) — includes:** loading screen shown and
removed; ten species present; **10/10 skinned rigs** with 15–27 bones and 8–10 clips;
`.glb` models loaded through `GLTFLoader`; draw calls **186**; triangles **434 888**;
render loop advancing; adaptive quality responding; HUD activation; habitat fast-travel
recorded and highlighted; framing and **clicking an animal opens its card** (verified
through a real raycast at projected screen coordinates); **petting** plays the `Pet` clip,
raises friendship and spawns hearts; **feeding** via a real pointer **drag-and-drop**
creates the flying food, the animal walks over and eats it; **playing** throws the ball and
sends the fox running; the elephant's unique `Spray` clip fires; diary stats and
achievements; `localStorage` persistence; night mode lighting; the gift box unlocks the
letter; help sheet opens **and closes from its own button**; photo mode hides the HUD;
audio mute/unmute; camera clamp keeps a real clearance above local ground; window resize;
mobile bottom-sheet layout; **touch tap selects an animal**. Zero console errors.

**Visual/geometric suite (18 checks, all passing) — includes:** every animal stands
exactly on its surface (worst deviation **0.03** units — nothing floats or sinks); sane
silhouette heights; animals never overlap; wander targets stay in habitat; both water
bodies flat-topped with rims hidden below the waterline; no NaN in any bone matrix;
**skeletal animation verified to actually change 26 bone rotations**; full clip coverage
per species; the animal card fully inside the viewport and not covering the dock or top
bar; all interface text ≥11px; selected animal framed on screen; Vietnamese diacritics
render; no page scrollbars.

**Fallback suite (8 checks, all passing):** with `bunny.glb` deleted from the served
output, the loading screen still lifts on its hard cap, the bunny keeps a 24-bone
procedural rig with all 8 clips, keeps animating, still responds to petting (its skeleton
verifiably deforms), the other nine models still load, and **zero page errors** occur.

**Performance:** measured with `tools/profile-scene.mjs` and the diagnostics suite. Draw
calls **~186**, triangles **~435k** (budget 900k), ~167 geometries. The animals are
higher-resolution than before (261k triangles across the ten species, up from 125k) so
the silhouettes, muzzles, ears and paws read cleanly; three.js re-renders the whole scene
for every transmissive material, so the water still avoids `transmission`. An adaptive
quality system drops shadow mapping and then resolution if the measured FPS stays below
32, and restores it when the GPU recovers.

### Honest note on frame rate

FPS was **not** meaningfully measurable in this environment: the headless browser uses
**SwiftShader (pure software rasterisation, no GPU)**, where the scene runs at 1–3 fps.
That number says nothing about real hardware. What I verified instead is that the render
loop advances, the draw-call and triangle budgets are healthy, LOD distances downscale skin
sampling and disable shadow casting for distant animals, and the adaptive quality system
engages. **Please confirm the frame rate on your own machine** — I could not.

---

## 6. Known limitations

* **I could not look at the rendered images.** The model I run as cannot view images.
  Instead the geometry was inspected as **ASCII side/front/top silhouettes of every
  species** (`npm run preview:ascii`) and the actual renders were checked numerically:
  the anatomy suite proves each animal is one watertight shell with the feet on the
  ground, the motion suite proves every clip plants its paws, and the captured
  screenshots were analysed pixel-wise for the species' dominant colours (bunny white,
  fox orange, flamingo pink, elephant grey, lion cub gold). That is not the same as
  looking at them — please review `screenshots/animals/` and tell me anything that reads
  wrong.
* **Model payload grew.** The ten `.glb` files are now **12.8 MB** (was 7.1 MB), because
  the animals are ~2× the triangle density. They still stream one at a time with progress
  and the intro is released after the first two, so a slow connection starts quickly, but
  if payload matters more than detail, lowering `resolution` in a species file from 76 to
  64 cuts roughly a third of it.
* **No post-processing bloom.** Emissive materials, additive glow sprites and canvas-drawn
  light textures provide the glow instead. This was a deliberate trade: `UnrealBloomPass`
  costs a full-screen pass and would hurt low-end and mobile devices. Easy to add if you
  want it (`EffectComposer` + `UnrealBloomPass`, threshold ~0.85).
* **The animals are stylised characters, not anatomical scans.** They are sculpted as
  continuous implicit surfaces with painted markings — deliberately cute and pastel, in
  the style of a family-friendly 3D game, rather than photoreal. Swapping in downloaded
  rigged GLBs is supported (see §4).
* **Swimming has no water-entry transition.** The semi-aquatic species switch to the
  paddle cycle the moment they are over deep water and back to the walk when they leave
  it, but there is no dive/resurface sequence and no ripple or wake particles.
* **Ambient audio is a single procedural soundscape** (Web Audio: music-box BGM, birdsong,
  water, wind) rather than per-habitat stems. It follows the time of day, not the habitat.
* **No collision with scenery.** The camera cannot clip through terrain or water (verified),
  but the camera is not blocked by individual trees or the gate; animals stay inside their
  habitat zone but do not path around trees or props.
* Petting is triggered from the info card rather than by directly stroking the model — the
  hover halo plus card interaction is what is implemented.

---

## 7. Deployment

The project is a static site; `npm run build` produces a fully self-contained `dist/`.

Any static host works — Netlify, Vercel, GitHub Pages, Cloudflare Pages, or plain nginx:

```bash
npm run build
# then upload the contents of dist/
```

Notes:

* Serve over HTTP(S), not `file://` (ES modules + `fetch` for the `.glb` files require a
  server). The `preview` script covers local use.
* Total payload is roughly **13.8 MB**, of which **12.8 MB is the ten `.glb` animal models**
  and ~1 MB is the JS/CSS bundle. The loading screen hides the streaming and the intro is
  released as soon as the first two animals are live, so a slow connection still starts
  quickly.
* If you deploy under a sub-path, keep Vite's `base` default: asset URLs are resolved
  relative to the served root, and `AssetLoader` reads `import.meta.env.BASE_URL`.

---

Made with care, for Nhi. 🌸
