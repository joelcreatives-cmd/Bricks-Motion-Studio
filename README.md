# Bricks Motion Studio

Multi-library animation engine for **Bricks Builder**. Enable **GSAP**, **Anime.js**, **Motion (motion.dev)**, **Three.js** and **Lenis** — one or all at once — and Bricks elements are animated automatically, with full per-element control in the builder.

- **Auto-animate:** site-wide rules map Bricks element types or CSS classes to presets (headings split into words, text fades up, images zoom out, lists stagger…). Nothing to do per element.
- **Per-element control:** every Bricks element (native and third-party) gets a **Content → Motion Studio** group: preset, engine, start trigger, duration, delay, stagger, easing, distance, viewport offset, replay, mobile toggle, hover effect — and a **Three.js 3D background** on sections, containers, blocks and divs.
- **3D Scene element:** standalone Three.js canvas — liquid gradient, particle field, wave grid, floating shapes, or a GLB/GLTF model viewer.
- **No conflicts:** each element is owned by exactly one engine, libraries load only on pages that use them, and everything is cleaned up so animated elements end up exactly as your stylesheet renders them.

Tested on WordPress 7.1.2 + Bricks 2.4.2, PHP 8.2. Requires WordPress 6.5+, PHP 7.4+, Bricks 2.x.

> **Licensing:** GSAP ships under the GSAP Standard License (free, including commercial use — but *not* GPL, and it restricts use in no-code visual animation tools that compete with Webflow). Using this plugin on your own/client sites is a permitted use. Before **selling or publicly distributing** this plugin with GSAP bundled, get written consent from GSAP/Webflow, or ship with GSAP disabled/removed (Anime.js, Motion, Lenis and Three.js are MIT). A wordpress.org release cannot include GSAP. See [docs/STUDY.md](docs/STUDY.md#4-libraries-and-licensing).

---

## Install

1. Download `bricks-motion-studio-<version>.zip` from the [latest release](https://github.com/joelcreatives-cmd/Bricks-Motion-Studio/releases/latest) and upload it in **Plugins → Add New → Upload** (or copy the `bricks-motion-studio` folder to `wp-content/plugins/`).
2. Activate **Bricks Motion Studio**.
3. Open **Motion Studio** in the WordPress dashboard sidebar.

Updates arrive like any other plugin update (Dashboard → Updates), straight from this repository's releases.

## Releasing an update

1. Bump the version in `bricks-motion-studio.php` (header **and** `BME_VERSION`) and `readme.txt` (`Stable tag`), add a changelog entry, commit.
2. Push a matching tag: `git tag v1.0.1 && git push origin v1.0.1`.
3. The **Release** workflow checks that the versions match, runs every check and browser test, builds the zip and publishes the GitHub release. Sites see the update within about 6 hours (immediately after **Dashboard → Updates → Check again**).

## Timeline (keyframes)

Every element's **Motion Studio** group has a **Timeline** list. Each row animates one property of the element itself, of elements inside it (a selector), or of anything on the page (`page:.selector`):

| Field | Values |
|---|---|
| Trigger | **Scroll position** (keyframes are % of the element's trip through the screen, so a tall section can choreograph a sticky stage), **Scrolled into view** (once), **Hover** (reverses on leave), **Hover out** (plays on leave instead of reversing), **Loop** |
| Property | x, y, rotate, scale, scaleX, scaleY, opacity, width, height, text colour, background colour |
| Keyframes | `percent: value` pairs, e.g. `0: 100%, 25: 0%`. Numbers with px % vw vh vmin vmax svh dvh lvh em rem deg turn (scale / opacity: plain numbers or %, so `80%` = 0.8), `#hex` / `rgb()` / `rgba()` (comma or space syntax) / `transparent`, `auto` (the element's designed value; resting on it hands the property back to the stylesheet), `-overflow` (slide until the far edge reaches the parent's content edge). A value that doesn't fully match is dropped, never half-read |
| Duration / delay / easing | timed triggers; easing includes exact quad/cubic/quart/quint/expo/sine/circ/back curves (GSAP power1-4 …) |
| Scroll range | optional ScrollTrigger-style `"<element edge> <screen line>"`, e.g. `top 15%` → `bottom bottom`, measured on this element or another |
| Screen sizes | all, desktop (992px+), or tablet and phone (991px and below) |

Rows replace the part of the designed transform they animate (like GSAP's x / y / rotate / scale) and keep the rest; when several rows drive the same property, the most recently started one applies. Only styles the timeline wrote are ever restored (other scripts' inline styles are left alone). View rows inside hidden content (closed popups, tabs, accordions) wait until it is shown; timelines in content Bricks loads by AJAX are picked up; hover rows ignore touch taps and focus moving between links inside the element. Timelines run on `assets/js/timeline.js` (3 KB gzipped, no library), enqueued only on pages that use them. Under reduced motion, scroll rows still follow the scrollbar (the visitor drives them, and stacked sections need them for layout); view and hover rows jump to their end state and loops stay parked.

## Settings (dashboard → Motion Studio)

| Section | What it controls |
|---|---|
| **Libraries** | Toggle GSAP / Anime.js / Motion / Three.js / Lenis (any combination). Default engine (only enabled engines selectable). Bundled files (default) or jsDelivr with integrity checks. |
| **Auto-animate** | Master switch, **animation level** (Basic / Moderate / Advanced), rules (element type, CSS class, or `*` = any other content element → preset, scope, engine) with live preview per rule, and exclusions. |
| **Timing & feel** | Duration, delay, easing, distance, stagger, cascade, start line, parallax speed, replay, with a live preview that plays as you type. |
| **Scroll & 3D** | Lenis smoothness, wheel speed, anchors, touch. Three.js pixel ratio and phones on/off. |
| **Accessibility** | Reduced-motion behavior (none / fades / full), minimum width, anti-flash, fail-safe timeout, load everywhere, debug mode. |
| **System** | Compatibility checks (WordPress, PHP, Bricks, element coverage, bundled files), export / import, reset. |
| **Reference** | Every preset as a hover-to-play card, attribute and JS API. |

Unsaved changes are tracked in the top bar; save with the button or Ctrl/⌘ + S.

### Performance and page weight
- **Nothing loads on pages without animations.** Libraries load per page, only when an element on that page needs them.
- **Lightweight engine (on by default).** Reveals, loops and word/character text run on the browser's built-in Web Animations engine: no library download, and transform/opacity animations run off the main thread. GSAP / Anime.js / Motion load only for what needs them (scroll-linked, pinning, horizontal scroll, SVG drawing, scramble, line splitting) or where an element or rule picks an engine explicitly. Switch: Libraries → *Lightweight engine for simple effects*.
- **Minified builds.** `runtime.min.js` (≈12 KB gzipped, preset catalog included and cached with it), minified adapters and CSS; slim bundled builds of Motion (≈23 KB gz) and Anime.js (≈19 KB gz) with only the functions the adapters use. `SCRIPT_DEBUG` loads the readable sources.
- **Three.js is lazy**: downloaded only when a 3D element approaches the viewport.
- Server cost measured at ≈8 µs per rendered element.

### Animation levels
Levels change element-type rules (and the `*` catch-all). **CSS-class rules always keep the exact preset and timing you chose**, and an element set to **Custom** keeps its own settings. Setting **Level** on an individual element overrides both (it is an explicit choice for that element).

| Level | Effect |
|---|---|
| **Basic** | Every reveal/text rule becomes a short fade or fade-up at half the travel (×0.5 distance, ×0.8 duration, ×0.7 stagger); parallax, scroll-fade/scale/rotate/expand and loops are turned off. Horizontal scroll, pin, counters and SVG drawing stay as set (structural, not decorative). |
| **Moderate** | The presets exactly as set in the rules (default). |
| **Advanced** | Richer swaps: headings `split-words` → `split-words-blur`, `fade-up` → `blur-up`, `fade` → `blur-in`, images `zoom-out` → `reveal-image`; ×1.4 distance, ×1.15 duration, ×1.3 stagger. The `*` catch-all rule only gets the scaling (no blur on generic elements). |

The level can be overridden per page (Bricks → Settings → Page settings → **Motion Studio**) and per element (Motion Studio → **Level**, shown in Auto mode).

### Page settings
Bricks → Settings → Page settings → **Motion Studio** (pages and templates):
- **Animations on this page**: Site settings / Only elements set to Custom / Disabled (no Motion Studio output at all).
- **Animation level**: overrides the site level on this page.

### Animations started by Bricks Interactions
Set an element to **Custom → Start: By a Bricks interaction**. Then on any element add an interaction with the action **JavaScript (Function)**, function name `BricksMotion.play` (or `BricksMotion.reset`), target the animated element (CSS selector — use Bricks' **#** "Copy CSS ID" button), and under **Arguments** click **Add item** (Bricks fills in `%brx%`). Click, hover, popup open, form submit… all work.

### Rule precedence
1. Element set to **Disabled** → never animated.
2. Element set to **Custom** → its own settings.
3. Manual `data-bme` attribute (Style → Attributes).
4. **CSS-class rule** (plain classes and Bricks global class names).
5. **Element-type rule**.
6. **`*` catch-all rule** (fade-up by default): every other content element. Never applied to wrappers (section, container, block, div) or nestable elements (accordions, tabs, sliders), so nothing animates twice.

Auto rules never touch: sticky/fixed elements, sliders/carousels, nav menus, off-canvas, counters (they animate themselves), code/HTML/template elements, anything inside the "never animate inside" selectors, and (by default) the header template and elements that already use Bricks' own entrance interactions.

## Presets

| Group | Presets | Engines |
|---|---|---|
| Reveal | fade, fade-up/down/left/right, zoom-in/out, flip-up, flip-left, rotate-in, skew-up, blur-in, blur-up, clip-up/down/left/right, reveal-image | Built-in, GSAP, Anime.js, Motion |
| Text | split-lines (masked), split-words, split-words-blur, split-chars, typewriter, scramble (GSAP), scroll-highlight | Built-in (words/chars/typewriter); GSAP (SplitText, needed for lines and scramble); Anime.js/Motion (built-in accessible splitter) |
| Scroll-linked | parallax, parallax-x, scroll-fade, scroll-scale, scroll-rotate, scroll-expand, horizontal-scroll (GSAP), pin (GSAP) | GSAP ScrollTrigger, Anime.js `onScroll`, Motion `scroll()` |
| Loop | float, pulse, sway, spin (pause automatically off-screen) | Built-in, GSAP, Anime.js, Motion |
| Special | counter (count-up with number formatting), draw-svg (stroked SVGs; GSAP DrawSVG when available) | built-in / any |
| Hover | lift, grow, magnetic, 3D tilt (separate "Hover effect" setting, combinable with any preset) | built-in |

If a preset isn't supported by the chosen engine, the next enabled engine that supports it takes over (e.g. *scramble* → GSAP), or its fallback preset is used (*scramble* → *split-chars*).

**Horizontal scroll:** apply it to the wrapper (e.g. a section); its first child is the track (a row that does not wrap), or set *Animate → Custom selector* to point at the track.

## Attribute API (no code)

Add in any element's **Style → Attributes**:

```
data-bme         = fade-up
data-bme-engine  = motion
data-bme-opts    = {"duration":1.2,"delay":0.2,"scope":"children","stagger":0.1,"trigger":"load","replay":1}
data-bme-hover   = magnetic
data-bme-skip    (no value — opt the element out of auto rules)
```

Individual overrides also work: `data-bme-duration`, `data-bme-delay`, `data-bme-stagger`, `data-bme-distance`, `data-bme-offset`, `data-bme-speed`, `data-bme-ease`, `data-bme-trigger`, `data-bme-scope`, `data-bme-replay`. A class like `bme-fade-up` works too.

Eases: `smooth`, `soft`, `strong`, `in-out`, `back`, `elastic`, `bounce`, `sine`, `linear` (mapped to each engine's equivalent).

## JavaScript API

```js
BricksMotion.refresh( root? );   // scan for new elements (after custom AJAX), recalc triggers
BricksMotion.play( target );     // (re)play now: element, selector, NodeList, or Bricks' %brx% object
BricksMotion.reset( target );    // back to the start state, ready to play again
BricksMotion.destroy( el );      // revert + stop an element
BricksMotion.lenis;              // Lenis instance when smooth scroll is enabled
BricksMotion.adapters;           // { native, gsap, anime, motion } registered engines
BricksMotion.registerAdapter( 'name', adapter ); // add your own engine (see runtime.js)

document.addEventListener( 'bme:ready',    e => {} ); // { engines, animations, config }
document.addEventListener( 'bme:play',     e => {} ); // { element, preset, engine }
document.addEventListener( 'bme:complete', e => {} ); // { element, preset }
document.addEventListener( 'bme:3d-ready', e => {} ); // { element, scene }
document.addEventListener( 'bme:reduced',  e => {} ); // visitor turned on reduced motion: everything was shown
```

Debug: enable **Debug mode** (console log + ScrollTrigger markers). Logged-in editors can load any page with `?bme-disable=1` to see it without the plugin (never cached; ignored for visitors unless `WP_DEBUG` is on).

## Security

Reviewed for: stored XSS through builder settings and custom attributes, settings injection, CSRF, capability checks, output escaping, direct file access, unauthenticated endpoints and supply chain.

- Settings: `manage_options` + nonces on save, import and reset; every value rebuilt from an allowlist, numbers clamped, selectors stripped of `<{};\` and checked for balanced brackets.
- Frontend output: all attributes escaped by Bricks, config JSON-encoded (cannot close `<script>`), no `eval`, no `innerHTML` with user data, no server-side fetching.
- Builder users can only choose from allowlisted presets/engines/scenes; 3D values are clamped again in the browser and model URLs must be http(s).
- No AJAX/REST endpoints, no file writes, no `unserialize`. Every PHP file refuses direct access; folders carry `index.php` guards.
- Libraries are bundled at pinned versions; the optional CDN mode adds Subresource Integrity hashes generated at build time.

## Updates and compatibility

- Library versions are pinned and bundled, so upstream releases never change a live site. Update deliberately: bump versions in `package.json` and `Libraries::VERSIONS`, run `npm run build`, then `npm run test:e2e`.
- Every Bricks/WordPress API call is feature-checked (`class_exists`, `function_exists`), so a missing API disables the feature instead of fatal-erroring.
- Failure is always safe: if a script is blocked, delayed or throws, content becomes visible (per-element error handling, watchdog, fail-safe timer, a DOMContentLoaded check and a runtime safety net for late content).
- Saved settings carry a schema version; `Plugin::maybe_upgrade()` migrates them once per release.
- **System** panel shows WordPress/PHP/Bricks compatibility and whether all bundled files are present.

## PHP hooks

| Hook | Type | Purpose |
|---|---|---|
| `bme/presets` | filter | Add/modify presets (same schema as `includes/data/presets.json`). |
| `bme/runtime_config` | filter | Modify `window.BME_CONFIG`. |
| `bme/load` | filter | Force-load or suppress the engine on a request. |
| `bme/passive_context` | filter | Return `true` to print no motion markup on a request. |
| `bme/boot_script_attributes` | filter | Attributes of the critical inline boot script (optimizer exclusions). |
| `bme/gsap_core_handle` | filter | GSAP core to build on when another plugin already loads GSAP (return `bme-gsap` to force the bundled copy). |
| `bme/force_controls` | filter | Build builder controls on frontend requests too (normally skipped for speed). |

## How it works (short)

```
PHP (render time)                                   Browser
─────────────────                                   ───────
bricks/element/set_root_attributes (priority 20)    <head> boot: html.bme-js, reduced-motion check,
 ├─ Disabled / Custom / manual attribute / rules      fail-safe reveal timer
 ├─ resolve engine: built-in or library               runtime.js (engine-agnostic orchestrator)
 └─ print data-bme, data-bme-engine, data-bme-opts,   ├─ one owner per element, ancestors claim children
    data-bme-hide, data-bme-hover, data-bme-3d        ├─ IntersectionObserver per offset + batch cascade
Usage tracker ──► wp_footer:15 enqueue only the       ├─ geometric sweep (clipped / fast-scroll / page end)
    engines, GSAP plugins & Lenis the page needs      ├─ engines: built-in (Web Animations) | GSAP | Anime.js | Motion
                                                      ├─ built-ins: splitter, counter, draw, highlight, hover
                                                      ├─ Three.js module, lazy-imported near the viewport
                                                      └─ Bricks AJAX/popup/accordion/tab events, cleanup
```

Full design rationale, research and test log: **[docs/STUDY.md](docs/STUDY.md)**.

## File map

```
bricks-motion-studio.php          bootstrap
uninstall.php                     removes the option
includes/
  class-plugin.php                wiring, activation
  class-settings.php              schema, defaults, sanitization
  class-presets.php               preset catalog accessors
  class-levels.php                animation levels (Basic / Moderate / Advanced)
  class-libraries.php             library registry (versions, local/CDN, handles)
  class-usage.php                 per-request usage tracker
  class-bricks-integration.php    builder controls, render attributes, auto rules, engine resolution
  class-assets.php                boot snippet, conditional enqueue, optimizer exclusions
  class-admin.php                 settings screen
  class-updater.php               updates from GitHub releases (dashboard / cron only)
  data/presets.json               single source of truth for presets (PHP + JS)
  data/sri.json                   CDN integrity hashes (generated by bin/vendor.mjs)
  data/icons.json                 admin icons (Tabler, MIT)
  elements/class-element-3d-scene.php
assets/
  js/runtime.js                   core orchestrator + built-in Web Animations engine
  js/adapter-{gsap,anime,motion}.js
  js/*.min.js, css/frontend.min.css  production builds (SCRIPT_DEBUG loads the sources)
  js/smooth-scroll.js             Lenis integration
  js/timeline.js                  Timeline keyframes (scroll / view / hover / loop), library-free
  js/three/                       built Three.js scenes (ES modules, lazy)
  js/admin.js, css/*.css
  vendor/{gsap,anime,motion,lenis}/  bundled libraries + licenses (Anime.js / Motion as slim builds)
src/three/                        Three.js scene sources (bundled by esbuild)
bin/                              vendor copy, builds (build-js, build-three), checks, packaging
docs/STUDY.md                     the study
```

## Build from source

```bash
npm install
npm run build      # vendor files + Three.js bundle + minified runtime/adapters/CSS + slim Motion/Anime.js
npm run build:js   # only the minified builds (run after editing assets/js/*.js or frontend.css)
npm run check      # php -l + node --check; fails on stale builds, version drift or SRI mismatch
npm run test:e2e   # every preset x every engine (incl. built-in), on the sources and on the shipped builds
npm run zip        # dist/bricks-motion-studio-<version>.zip (refuses stale builds; no sources, tests or dev files)
composer install && composer lint   # WordPress coding standards + PHP 7.4 compatibility (phpcs.xml.dist)
```

Every push runs all of the above on GitHub Actions (PHP 7.4 and 8.4 syntax, coding standards, checks, browser tests, packaging).

Library versions are pinned in `package.json` and `includes/class-libraries.php` (`Libraries::VERSIONS`) — update both together (`npm run check` fails if they drift).
