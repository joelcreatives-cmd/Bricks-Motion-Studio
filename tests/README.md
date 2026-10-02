# Tests

Run after any update of WordPress, Bricks or a bundled library (`npm run build` first when libraries change):

```bash
npm install
npm run check      # php -l + node --check; stale builds, library version drift, CDN integrity hashes
npm run test:e2e   # the harness twice: on the sources, then on the shipped builds (BUILD=min)
```

`test:e2e` needs Google Chrome (set `CHROME=/path/to/chrome` if it is not in the default location). It generates
`tests/e2e/harness.html` (every preset × built-in engine / GSAP / Anime.js / Motion, all Three.js scenes, hover, a
clipped case, designed-opacity cases and audit regressions), runs it in normal and reduced-motion mode, and exits
non-zero on any failure:

- content left hidden, inline styles or split markup left behind;
- a timed preset that never played, or played on a different engine than it asked for (no silent fallbacks);
- a runtime warning (animation failed, watchdog, no engine available);
- scroll/loop presets not moving, loops moving under reduced motion;
- an element designed at 50% opacity not ending at 50%, or one designed invisible becoming visible at any moment;
- audit regressions: CSS transitions, clones made after setup, authored `translate(-50%)` kept by the built-in engine,
  scoped children designed invisible, scramble turning text into markup, `BricksMotion.play()` on a loop;
- a 3D scene not mounting, a missing engine, or a page error;
- timelines: scroll keyframes (position, width, colour, a designed `translateX(-50%)` kept), custom scroll ranges,
  `-overflow`, holding before/after the range, view, hover with a separate hover-out, `auto`, loops (parked under
  reduced motion), exact easing curves, and rebuilding when the window crosses 992px (tablet-only rows switch on
  and leave nothing behind on the way back);
- QA regressions: a designed transform kept mid-animation on GSAP and for content shown after load, mixed RTL text not
  split into letters, a word joiner across inline tags (and nothing left after), GSAP line reveals rising halfway, the
  marquee (copies, inert, clipped parent, seamless half-way copy), tilt on a centred element, timeline focus /
  zero-duration / scale % / colour syntax / padded `-overflow` / hidden view rows / not wiping other scripts' styles,
  and scroll fades completing at the page end on Motion, Anime.js and GSAP. Each was checked against the code from
  before the fix and fails there.

The audit assertions were mutation-tested: with its bug re-introduced, each of these fails — clone repair, authored
transform kept by the built-in engine, `play()` on loops, per-child designed opacity, the library → built-in switch,
and (removed together, since either one alone prevents the flash) the invisible-child filter plus that switch.
Two cases guard scenarios that current Chrome / GSAP 3.15 no longer reproduce (an opacity transition read mid-way;
ScrambleText writing markup) and stay as protection against future browser or library changes.
