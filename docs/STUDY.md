# Bricks Motion Studio — Study & Design Record

How to add GSAP, Three.js and other animation libraries to Bricks Builder sites — selectable one-or-many, without conflicts, applied automatically — and why this plugin is built the way it is.

*Research date: 29 Sep 2026. Environment verified: WordPress 7.1.2, Bricks 2.4.2 (source read locally; cross-checked against 2.3.8 and 2.1.4), PHP 8.2, Chrome 154.*

---

## 1. The requirement, decomposed

| Requirement | What it really means technically |
|---|---|
| "Implement animations on a Bricks site" | Hook into Bricks' element rendering (server) and run animation code on the frontend (client). |
| "Libraries like GSAP and Three.js" | Two different *kinds* of library: DOM tweening engines (GSAP, Anime.js, Motion) and a WebGL renderer (Three.js). Plus a scroll layer (Lenis). |
| "Select a library… one or multiple without conflict" | A library registry + an ownership model so two engines never fight over the same element/property, a single scroll clock, and loading only what's used. |
| "Auto-implemented in the elements" | Site-wide rules that map Bricks element types/classes to presets, resolved at render time — zero per-element work — with per-element override. |

## 2. Bricks integration points (verified in source)

| Need | Mechanism | Notes |
|---|---|---|
| Add a control group to **every** element | `bricks/elements/{name}/control_groups` + `/controls`, looped over `\Bricks\Elements::$elements` on `init` (after native @10 / third-party @11 registration, **before `wp`** — that is where Bricks runs `Element::load()` and caches controls for the builder). | We hook on `init` @9999 so late third-party elements are included. |
| Where the group lives | **Content tab.** Bricks decides "save to element vs. active class/selector" by whether a control has a `css` key, not by tab. Our controls have no `css`, so values always save on the element. | No "not class-able" flag exists; omitting `css` is the flag. |
| Add attributes at render | `bricks/element/set_root_attributes( $attributes, $element )`. Bricks' own Interactions run at priority 10, so at 20 we can see `data-interactions` and avoid double-animating. | Values are `esc_attr`'d by Bricks; empty values render as boolean attributes. |
| Know header/footer/popup context | Track `bricks/frontend/before_render_data` / `after_render_data` (`$area` = header/content/footer/popup) as a stack. | `$element->post_id` is the *page*, not the template — can't be used. |
| Builder detection | `bricks_is_builder()`, `bricks_is_builder_iframe()`, `bricks_is_builder_call()` (AJAX/REST renders). | Nothing is printed in any builder context → the canvas stays editable. |
| Custom element | `\Bricks\Elements::register_element( $file, $name, $class )` on `init` @11 — pass name and class explicitly. | "3D Scene (Three.js)" element. |
| Frontend lifecycle events | All on `document`: `bricks/ajax/nodes_added`, `…/query_result/displayed`, `…/load_page/completed`, `…/pagination/completed`, `…/popup/loaded`, `bricks/popup/open|close`, `bricks/accordion/open|close`, `bricks/tabs/changed`. | Off-canvas fires no events → watch `.brxe-offcanvas.brx-open`; Bricks adds `body.no-scroll` for popups. |
| Native motion to respect | Interactions "Start animation" (Animate.css, `data-interaction-hidden-on-load`); **2.3+ "Real parallax"** writes inline `style.translate`. | Auto rules skip interaction-animated elements; hover effects that use `translate` skip parallax elements. |

DOM conventions used: root class `brxe-{name}`, `#brx-header`, `#brx-content`, `#brx-footer`, `.brx-popup`, Splide/Swiper slider classes. Element IDs are *not* relied on (Bricks may drop them).

## 3. Prior art — what others do and what we learned

| Product | Approach | Lesson taken |
|---|---|---|
| **Bricksforge** (read locally, v3.1.7.1) | "Animations" group in every element's Style tab via the same filters; JSON `data-brf-animation` attribute; bundled GSAP 3.11.5, Lenis 1.1.4, Three r153; conditional loading. Hides the whole `<body>` until `load` to avoid FOUC. | Same injection pattern is proven. **Don't** hide the whole page (bad LCP, blank page under "Delay JS"). Its `.brf-reset-transition` kills Bricks hover transitions — only suspend transitions on the animated element *during* the tween. Users report AJAX-filter breakage and slow builder UI. |
| **Motion.page** | Separate visual timeline builder by CSS selector; **dropped GSAP for its own engine in v3.0 (Apr 2026)** after the license change. | Keep the engine swappable (adapter layer). Target stable hooks, not element IDs. |
| **BricksExtras** | Per-element effects (Lottie, parallax, tilt, floating). Parallax off on mobile by default. | Effects that own `transform` conflict with user transforms — keep one owner. |
| **Bricks core** | Interactions + Animate.css; 2.3 native parallax; no GSAP. | Coexist: detect and skip, never override. |
| **Elementor** | Motion Effects; forced reduced-motion off-switch with no opt-out drew complaints (school PCs set it by policy). | Offer reduced-motion *modes* (none / fades only / ignore) and always show final content. |
| **Webflow Interactions (GSAP)** | Timeline editor; complaints about elements flashing before animating and not seeing which elements are animated. | Start states must be applied before first paint; make animation status inspectable (`data-bme-state`, `data-bme-owner`, debug log). |

## 4. Libraries and licensing

| Library | Version shipped | Role here | License | Browser build |
|---|---|---|---|---|
| **GSAP** + ScrollTrigger, SplitText, ScrambleText, DrawSVG | 3.15.0 | Primary tween engine; the only one with pinning, SplitText, scramble | **GSAP Standard License** — free incl. commercial; not GPL; bans use in no-code animation tools competing with Webflow without consent | `dist/*.min.js` (UMD, `window.gsap`, plugins as globals) |
| **Anime.js** | 4.5.0 | Alternative lightweight engine (`animate`, `stagger`, `onScroll`) | MIT | Bundled: slim build of exactly those functions (≈49 KB, `window.anime`); CDN: `dist/bundles/anime.umd.min.js` |
| **Motion** | 13.4.5 | Alternative engine on the Web Animations API (`animate`, `scroll`, `stagger`) | MIT (Motion+ extras are separate) | Bundled: slim build of exactly those functions (≈64 KB, `window.Motion`); CDN: `dist/motion.js` |
| **Three.js** | r186 (0.186.1) | WebGL backgrounds and 3D Scene element | MIT | ES modules only since r161; **r186 dropped all minified builds** → we bundle with esbuild (tree-shaken, model viewer code-split) |
| **Lenis** | 1.3.26 | Smooth scroll, driven by GSAP's ticker when present | MIT | `dist/lenis.min.js` + `lenis.css` |

**GSAP licensing — the decision that matters most.** The 2025 Standard License (after Webflow's acquisition) allows GSAP on any website, but *prohibits* using it in "no-code visual animation tools" that compete with Webflow's visual animation building, unless Webflow consents in writing; its FAQ welcomes niche WordPress tools "if they don't directly compete" and says to ask. Consequences for this plugin:

- **Agency use on your own/client sites:** permitted use → low risk. The UI is deliberately *preset-based*, not a keyframe/timeline builder (the feature most "similar to Webflow").
- **Selling or distributing publicly:** real, unresolved risk → get written consent via gsap.com/contact, or distribute with GSAP disabled/removed (the adapter design makes the plugin fully functional on Anime.js/Motion alone).
- **wordpress.org:** impossible with GSAP bundled (GPL requirement; CDN offloading of non-service JS is also disallowed).

Bundled vs CDN: **bundled by default** (GDPR — no third-party IP logging; no CDN outage risk; wordpress.org-style), jsDelivr optional.

## 5. The conflict model ("one or many, without conflict")

| Conflict | Mitigation in this plugin |
|---|---|
| Two engines animating the same element | **Ownership:** each element resolves to exactly one engine (`data-bme-owner`). Ancestors with a children/selector scope *claim* those children first (document order), so the children's own rules are skipped. |
| Preset unsupported by chosen engine | Deterministic resolution: element's engine → site default → other enabled engines → preset fallback (e.g. scramble → split-chars) → no animation (content shown). Same logic in PHP (for loading) and JS. |
| Global clobbering / duplicate copies | Namespaced handles (`bme-*`), single `window.BricksMotion`, adapters capture library references at load. Three.js lives inside an ES module bundle — no global, no import-map dependency (avoids Firefox's single-import-map limitation and other plugins' maps). |
| Two scroll/animation clocks | Lenis is driven by `gsap.ticker` + `lenis.on('scroll', ScrollTrigger.update)` + `lagSmoothing(0)` when GSAP is present; otherwise Lenis `autoRaf`. Anime.js/Motion read native scroll, which Lenis drives, so they stay in sync. |
| Bricks' own Animate.css interactions | Auto rules skip elements with a `startAnimation` interaction. |
| Bricks 2.3 native parallax (`style.translate`) | Magnetic/lift hovers skip parallax elements; our reveals use `transform`, which composes with `translate`. |
| CSS transitions fighting tweens (Bricks elements often have `transition: all`) | `transition: none !important` inline **only during** the tween, then the original inline style is restored (verified: computed `transition` back to `all`). |
| Lingering transforms creating containing blocks (breaks `position: fixed` children, off-canvas, popups) and stacking contexts | After a reveal completes: engine revert + restore of the exact original inline styles. Verified on a live page: 579/588 Bricks elements end with computed opacity/transform/filter/clip-path/translate/scale/transition identical to the plugin-free render (the other 9 are inside a `display:none` container and animate when shown). |
| WAAPI committing end values after `finished` (Motion) | Motion completion reported ~50 ms later so cleanup always runs last (found and fixed in testing). |
| Sticky/fixed elements, sliders, menus, off-canvas | Never auto-animated (settings `_position` check + element blacklist + configurable "never animate inside" selectors, also applied in the anti-flash CSS so they are never hidden). |
| Header template (sticky headers use `transform` transitions) | Skipped by default via the render-area stack. |
| Three.js vs DOM animations | Canvas is its own absolutely-positioned layer (`z-index:-1` inside an `isolation:isolate` host); never touches the host's styles, so a section can have a 3D background *and* a GSAP reveal. |
| Transforms in hover effects vs. reveals | Lift/grow use individual `translate`/`scale` properties (compose with any engine's `transform`); tilt waits until the reveal has finished. |

## 6. Flash-of-content, failure and performance strategy

1. **Boot snippet in `<head>`** (tiny, inline, marked with `data-no-optimize`, `data-no-defer`, `data-cfasync="false"`, `nowprocket`, etc.) adds `html.bme-js`; CSS hides only `[data-bme-hide]` elements, only under that class → no JS = no hiding.
2. Hidden state is **`opacity: .01`**, not `visibility:hidden` or `opacity:0`: content stays in the accessibility tree and search index, and stays an LCP candidate (Chrome ignores `opacity:0` paints).
3. **Fail-safe:** if the runtime hasn't started within 3 s (configurable) — scripts blocked, delayed by an optimizer, or erroring — everything is revealed; if the runtime starts later it only animates what the visitor hasn't seen yet.
4. **Conditional loading:** Bricks renders every element before `wp_footer`; a usage tracker records engines/presets per page, and at `wp_footer:15` (after Bricks popups render at 10, before scripts print at 20) only the needed engine(s), GSAP plugins (e.g. SplitText only if a text preset is on the page) and Lenis are enqueued, all `defer`. Since the built-in engine (below) became the default, a page with only fade/zoom/word presets loads **no library at all**: just `runtime.min.js` (≈12 KB gzipped, presets included) and `frontend.min.css`. Verified on the live homepage: 36 KB of plugin files instead of 114 KB.
5. **Three.js is lazy:** the module is `import()`ed only when a 3D element comes within 200 px of the viewport; rendering pauses off-screen and on hidden tabs; pixel ratio capped (default 1.5); `dispose()` + `forceContextLoss()` on removal; max 8 live WebGL contexts (Chromium evicts beyond 16, 8 on Android).
6. **Optimizer cooperation:** WP Rocket / Perfmatters "Delay JS" exclusions and WP Rocket "Remove Unused CSS" safelist are registered by filters; the plugin's own script tags carry `data-cfasync="false"`, `data-no-optimize` and `data-no-defer` (Cloudflare Rocket Loader, LiteSpeed, SiteGround); if the runtime still hasn't run at `DOMContentLoaded`, content is revealed immediately.
7. **Triggers:** one `IntersectionObserver` per offset value, batched cascades for grids/query loops, plus a **geometric sweep** (throttled while scrolling, again when scrolling stops, on load and resize-into-view) that catches what IO can't: elements clipped by `overflow:hidden` ancestors, very fast scrolls, the end of the page, and start states Chrome's IO never reports (fully clipped + scaled, e.g. `reveal-image`). Reads are batched before any writes. (Found in testing: without it, 93 elements on the test page stayed invisible.)
8. **Built-in engine (default):** reveals, loops and word/character text run on the Web Animations API inside the runtime — no library download, transform/opacity on the compositor. Libraries load only for what needs them (scroll-linked, pinning, SVG drawing, scramble, line splitting) or where an engine is picked explicitly. It composes with the element's own CSS transform (e.g. `translate(-50%)` centring) and ends at its designed opacity.
9. **Designed state is respected:** each element's resting opacity and transform are measured once (one batched pass, before any start state is applied); reveals end there, and elements designed to be invisible (hover-revealed text, off-state layers) are not animated at all, so they never flash.

## 7. Accessibility

- `prefers-reduced-motion`: default **no animation at all** (content shown, Lenis off, 3D scenes render a single static frame); alternative "gentle fades only"; "ignore" available but discouraged. Verified in headless Chrome with the media feature emulated.
- Text splitting keeps a visually-hidden intact copy for screen readers and marks split pieces `aria-hidden` (GSAP SplitText uses its `aria:"auto"`); splits are reverted after the reveal so the DOM returns to the original markup.
- Keyboard focus entering not-yet-revealed content reveals it instantly.
- Loops pause off-screen. WCAG 2.2.2 note: loops longer than 5 s running next to other content should get a visible pause control — prefer short/subtle loops or add a Bricks toggle.
- 3D scenes are `aria-hidden` unless an accessible description is set; optional poster image fallback.

## 8. Architecture

```
PHP
 Settings ──── Presets (presets.json, shared with JS) ──── Libraries (versions, handles, local/CDN)
    │
 Bricks_Integration
    ├─ init@9999: control group + controls on every element (content tab)
    ├─ register "3D Scene" element
    ├─ render-area stack (header/content/footer/popup)
    └─ set_root_attributes@20 → Disabled | Custom | manual attr | class rule | element rule
         → resolve(preset, engine) → data-bme / -engine / -opts / -hide / -hover / -3d → Usage
 Levels: Basic / Moderate / Advanced swap & scale element-rule presets (class rules exempt); page settings override
 Assets: wp_head@2 boot snippet · wp_footer@14 commit usage of rendered elements · @15 enqueue · window.BME_CONFIG

JS
 runtime.js  ── built-in Web Animations engine + registerAdapter() ◄── adapter-gsap.js / adapter-anime.js / adapter-motion.js
   ├─ records (one per element) · ownership/claims · IO triggers · sweep · replay/reset
   ├─ neutral props → inline start state; adapters: tween / scrub / special(split, scramble, draw, pin, horizontal-scroll)
   ├─ built-ins: text splitter, counter, SVG draw, scroll highlight, hover effects
   ├─ Bricks events (AJAX, popups, accordions, tabs), MutationObserver cleanup, focus reveal
   └─ Three.js: lazy import('three/bme-three.js') → mount(el) → { pause, resume, destroy }
 smooth-scroll.js ── Lenis ⇄ gsap.ticker/ScrollTrigger, body.no-scroll / off-canvas aware
```

Adding another engine = one file implementing `tween(targets, from, to, opts)` and `scrub(trigger, targets, from, to, opts)` and calling `BricksMotion.registerAdapter()`.

## 9. Test log

| Test | Environment | Result |
|---|---|---|
| Activation, settings screen | Local site (WP 7.1.2, Bricks 2.4.2) | Clean activation, no PHP errors; top-level "Motion Studio" menu. |
| Builder integration | Real Bricks builder | "Motion Studio" group on all 77 registered elements; 3D controls only on section/container/block/div; "3D Scene" element registered; conditional controls (Custom → preset → timing) verified; canvas unaffected. Test edits undone, nothing saved. |
| Auto-animate on a real page | Live homepage, headless Chrome 1440×900 | 229 elements auto-animated; header skipped; only GSAP core loaded; no console errors. |
| End-state fidelity | Same page with vs. without plugin (`?bme-disable=1`) | 579/588 elements computed-style identical after animations; 9 pending inside a `display:none` container (expected). |
| Every preset × every engine | Local harness (now 140 cases: 107 library + 26 built-in-engine + 3D + hover + clipped, plus designed-opacity and audit cases) | All pass on both the sources and the shipped minified/slim builds; each case must play on the engine it asked for. |
| Three.js | Harness, SwiftShader WebGL | Gradient, particles, waves, orbs, GLB model all mount; CSS-variable colors resolved; correct sRGB output. |
| Reduced motion | Emulated `prefers-reduced-motion: reduce` | Nothing animates, nothing hidden, Lenis off, 3D static frame. |
| Mobile 390×844 | Live homepage | All visible elements animate; 46 pending are hidden on phones by Bricks responsive settings (animate if shown). |
| Sanitization | PHP CLI inside WordPress | Script tags stripped, invalid presets/engines/libraries rejected, numbers clamped. |

### Round 2 (after code audit and security review)

| Check | Result |
|---|---|
| Independent code audit | 5 high, 7 medium, 12 low findings, all fixed: focus inside pinned sections no longer kills them; counters always restore their text; engine errors reveal the element; content injected without Bricks events is initialized (MutationObserver) with a safety net (later a runtime check replaced the CSS backstop); builder controls built once and skipped on frontend renders; start waits for all engines; scroll effects complete at page end; non-destructive text splitter; 3D context cleanup and tab-switch resume; existing GSAP reused; watchdog for killed tweens. |
| Security review | No critical/high/medium issues. Low/info items fixed: strict types in the 3D element, browser-side clamping and http(s)-only model URLs, debug switch limited to editors, SRI for CDN mode, safe hash handling, balanced-selector validation, prototype-safe lookups, directory guards. |
| All-elements page (74 Bricks elements) | 40 element types animate (13 before the catch-all rule); 0 stuck hidden; 0 leftover styles; 3D Scene mounts. Skipped by design: wrappers, nestables, sliders, menus, off-canvas, maps, code/HTML. |
| Feature demo page | GSAP, Anime.js and Motion each animate their card; 3 Three.js scenes mount; counters leave "24/7" and years alone. |
| Live homepage | 579/588 elements end identical to the plugin-off render (9 inside a hidden container animate when shown). |
| Committed e2e suite | `npm run test:e2e`: PASS (default and reduced motion). |

### Round 3 (final audits)

| Check | Result |
|---|---|
| Four independent audits (runtime, PHP/security, admin UI/a11y, build/docs/tests) | Fixed: elements with CSS transitions or clones made after setup could stay hidden; built-in engine now keeps authored transforms; scoped children designed invisible no longer flash; `BricksMotion.play()` kind-aware; one layout pass at setup; rules grid layout at laptop widths (container queries); engine choices no longer lost when a library is off; saved panel + "Settings saved" notice; valid ARIA table; 3:1 control contrast; RTL; Isotope grids; external GSAP only reused at 3.13+; stale-build / version / SRI guards; Three.js license shipped; scramble writes plain text only (defense in depth — GSAP 3.15 already escapes). |
| Mutation testing of the suite | Each new assertion was checked to fail with its bug re-introduced; two vacuous checks were found and rewritten. |
| Nested elements page | Every child inside every nestable element (nav, dropdown, off-canvas, accordion, tabs, slider, back-to-top, deep layout chain) animates; Bricks interaction trigger verified end-to-end in the real builder. |
| Weight | Homepage: 36 KB of plugin files (was 114 KB), JS 37 ms (was 112 ms), style work 96–115 ms (was 231 ms), CLS unchanged vs plugin off. |

Also found and fixed during testing: the frontend stylesheet depended on WordPress hoisting late styles (it now loads in `<head>`), and the Three.js canvas now positions itself inline so a missing stylesheet can never create a resize feedback loop.

## 10. Known limitations / roadmap

- No live preview inside the builder canvas (by design: it would depend on undocumented Bricks internals that change between versions). Bricks' Preview (eye icon) shows the animations.
- Scripts enqueued during Bricks AJAX renders never reach the page: if AJAX-loaded content (e.g. AJAX popups, infinite scroll) uses an engine not present on the initial page, enable *Load enabled engines on every page*.
- Draco/KTX2-compressed GLB models aren't supported (would need decoder files).
- Per-breakpoint animation settings (beyond "disable below 768px" and the global minimum width) are not implemented.
- GSAP licensing must be cleared before any public/commercial distribution (see §4).
