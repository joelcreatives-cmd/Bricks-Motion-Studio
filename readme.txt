=== Bricks Motion Studio ===
Contributors: joelcreatives
Tags: bricks, animation, gsap, three.js, scroll
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Multi-library animation engine for Bricks Builder: GSAP, Anime.js, Motion, Three.js and Lenis — one or all, auto-applied to Bricks elements.

== Description ==

Choose one or several animation libraries. Auto-animate rules apply presets to Bricks elements by element type or CSS class, and every element gets a "Motion Studio" control group in the Bricks editor for fine-tuning. Sections, containers, blocks and divs can get animated Three.js backgrounds, and the "3D Scene" element renders procedural scenes or GLB/GLTF models.

* 40 presets: reveals, text splitting, scroll-linked (parallax, scrub, pin, horizontal scroll), loops, counters, SVG drawing, hover effects.
* One engine owns each element; libraries load only on pages that use them.
* Anti-flash with fail-safe reveal, reduced-motion support, keyboard-focus reveal.
* Works with Bricks AJAX query loops, filters, popups, accordions and tabs.
* Lenis smooth scroll synced with GSAP ScrollTrigger; pauses for Bricks popups and off-canvas.
* Animation levels (Basic / Moderate / Advanced) site-wide, per page and per element.
* Every element in the structure panel, including children of nestable elements, has its own Motion Studio controls.
* Page settings: disable animations or change the level for one page or template.
* Start animations from Bricks Interactions (JavaScript Function: BricksMotion.play).
* Live preview in the Bricks builder: animations play on the canvas as you change their settings, plus a "Preview animation" button.
* Timeline keyframes with a visual keyframe track (drag, click to add, keyboard) and instant checks.
* "Pause animations button" element: pauses everything that keeps moving (WCAG 2.2.2).
* My presets: your own named timing on any built-in preset, available everywhere presets are picked.
* Turn off on phone, tablet or desktop, per element.
* No sideways scrolling: elements sliding in near the screen edge never make the page wider than the window.

= Licensing note =

A personal project by JoelCreatives, built for my own and client projects and published as a portfolio piece; it is not sold or offered as a product. The plugin's code is GPLv2 or later. Bundled libraries keep their own licences: GSAP is free (including commercial use) under the GSAP Standard License, which is not GPL; Anime.js, Motion, Lenis and Three.js are MIT. Anyone reusing this code in a distributed product should check the GSAP licence first.

== Installation ==

1. Upload the `bricks-motion-studio` folder to `/wp-content/plugins/`.
2. Activate the plugin (Bricks must be the active theme or parent theme).
3. Configure under Motion Studio in the dashboard sidebar.

== Frequently Asked Questions ==

= Do animations run inside the Bricks builder? =

Only when you ask: changing an element's Motion Studio settings plays its animation once on the canvas (live preview), and the "Preview animation" button replays it. Nothing else moves while you edit.

= An element should not animate =

Select it in Bricks → Content → Motion Studio → Animation: Disabled. Or add the attribute `data-bme-skip`.

= How do updates work? =

Like any other plugin: WordPress checks this plugin's GitHub releases (from the dashboard and its background update check, never on the front end) and shows the update under Dashboard → Updates.

= How do I see the page without the plugin? =

While logged in as an editor or admin, append `?bme-disable=1` to any URL.

== Changelog ==

= 1.0.0 =
* Initial release.
* Animation libraries: GSAP, Anime.js, Motion, Three.js and Lenis, any combination, one engine per element; plus a lightweight built-in engine (Web Animations API) for reveals, loops and word/character text, so most pages load no library at all.
* 40 presets, auto-animate rules by element type or CSS class, a Motion Studio panel on every Bricks element (nested children included), 3D backgrounds and the 3D Scene element.
* Animation levels (Basic / Moderate / Advanced) site-wide, per page and per element; page settings; start animations from Bricks Interactions (BricksMotion.play / reset).
* Respects each element's designed opacity and transform; accessible text splitting; reduced-motion options; fail-safes for blocked or delayed scripts; optimizer-plugin compatibility.
* Minified runtime with the preset catalog built in; slim bundled builds of Anime.js and Motion; libraries load only on pages that use them.
* Settings app with live previews, system checks, export / import / reset; end-to-end test suite.
* Updates from GitHub releases; automated checks on every push.
* Timeline: keyframe animations for an element and the elements inside it, started by scroll position, scrolling into view, hover (with an optional separate hover-out) or a loop. Animates position, rotation, scale, opacity, width, height and colours; custom scroll ranges; `auto` (the designed value) and `-overflow` (slide to the last card) values; exact GSAP-style easing curves; per-row screen sizes. Loads its own small script (about 8 KB gzipped) only on pages that use it.
* Marquee preset: a seamless endless strip (the content is duplicated once, hidden from screen readers and keyboard), pauses on hover and keyboard focus, clips its parent.
* Quality pass: elements with a designed transform (centred, rotated) keep it on every engine and in tilt hover; content in closed popups/tabs is measured when shown; right-to-left and joined scripts are never split into letters; words crossing inline tags don't wrap mid-word; scroll fades complete near the page end on every engine; GSAP line reveals no longer pop in; rules with an unavailable preset are kept; update checks use the new release's own requirements.
* Second quality pass: timeline elements never flash before their script runs, and are never also given an auto animation; timelines inside AJAX popups and filtered loops load their script when they arrive; keyframes are checked against their property (whole row or nothing) and accept colour names, hsl() and var(); colour fades blend like CSS; ranges inside sticky stages, view rows in popups and scrolling boxes, the mobile address bar, hover-out-only rows and `#brxe-` targets in query loops all work; turning on reduced motion mid-visit is handled fully (fades, 3D still frame, smooth scrolling removed cleanly, "ignore" respected); marquees in column or grid containers, counters like 0.125, `data-bme-replay="true"`, replay after skipping past, scroll-highlight after reset(), content printed while hidden, and centred looping elements after a font swap or resize; the Basic level also stops marquees; broken "never animate inside" selectors drop only themselves; class rules keep names like md:hidden; settings can be saved without JavaScript; the admin preview shows saved zero values.
* Third quality pass: 3D posters come back when a model can't load and only give way once the scene is drawn; 3D colours accept every CSS colour format; scenes out of view hand their WebGL slot to ones coming into view; Anime.js line reveals rise from one line-height; Motion has real elastic and bounce easing and leaves a theme's own Motion alone; scroll fades on Anime.js and Motion re-measure when the page height changes; SVG drawing and word splitting no longer download libraries they don't use; settings snippets are protected from Rocket Loader and similar optimizers; the 3D placeholder only appears in the builder; templates rendered late in the footer are counted; Bricks interactions with a leftover selector are recognised; component overrides of timeline rows work; timeline colours resolve correctly on elements with CSS transitions; sticky stages with absolute layers measure correctly; content inserted by other scripts is picked up; a timeline aimed only at child elements keeps the element's own reveal; marquees keep a column layout's spacing.
* Fourth quality pass: a pause button for everything that keeps moving (add `data-bme-pause-toggle` to any button; also BricksMotion.pauseAll / resumeAll; WCAG 2.2.2); marquees pause on tap and bring a focused link back into view; timeline reveals play on keyboard focus and at the page end; scroll-highlight is fully readable in "gentle fades" mode; a broken "never animate inside" selector no longer switches off the others in the browser; hand-written timeline attributes can't stop other timelines; BricksMotion.destroy accepts selectors; Anime.js / Motion scroll effects near the page end no longer restart; colour checks never start a CSS transition; 3D colours read any CSS colour and failed scenes free their slot; timelines skip style writes that change nothing; settings screen: save state announced, focus kept when removing a rule, numbered rule buttons, sticky bar never hides the focused field.
* Fifth quality pass: tested in WebKit (Safari's engine) and on PHP 8.4 / 8.5; masks and marquees clip correctly on Safari 15; hover lift / grow only on devices that can hover; marquee tap-to-resume works on touch screens and "resume all" respects a paused marquee; 3D still frame when reduced motion is switched on mid-visit; 3D models finishing their download while paused stay paused; scroll "enter" ranges on SVG elements; pause buttons show their state everywhere; screen-reader text keeps the source spelling; "never animate inside" selectors with quoted commas.
* New: live preview in the Bricks builder (plays as you change Motion Studio settings, plus a Preview animation button); a visual keyframe track with instant checks under every timeline row; a "Pause animations button" element; My presets (your own named timing on any built-in preset); "Turn off on" phone / tablet / desktop for any element.
* Sixth quality pass: the keyframe track never drops keyframes while a row has a typo, keeps exact positions and keyboard focus; previews stop when you select another element, take hover effects off cleanly, ignore other plugins' hooks and respect pages set to Disabled; the pause button follows its Gap and Style settings and is never auto-animated; the old "Disable below 768px" box only counts in Custom mode; My presets keep backslashes and long names in any language, and Import replaces them instead of mixing; GSAP from another plugin is always shared, never loaded twice; timeline loops rest visibly while paused or with reduced motion; timelines read the real design on elements with CSS transitions, blend mixed units, keep mirrored designs flipped, and a hover row no longer flashes over a reveal; BricksMotion.destroy() lasts until refresh(); SVG drawings honour pathLength and long drawings no longer snap to the end; Anime.js marquees re-measure after a resize.
* Seventh quality pass: no sideways scrolling: on pages with animations, elements sliding, zooming or rotating in near the screen edge no longer make the page wider than the window (Accessibility → No sideways scrolling, on by default; sticky and pinned sections unaffected); page-level Animations / level settings apply to Load more, filters and infinite scroll; the builder canvas no longer animates content on its own and previews hover-only effects; a preview reply for a previously selected element is ignored; sticky positions set through global classes and Bricks background parallax are recognised; Hover and Timeline controls hide when Animation is Disabled; paused timeline loops freeze in place; vertically flipped designs stay flipped; timelines wait for an element's own reveal before reading its design, re-measure around GSAP pins and are never loaded twice; counters keep their width while counting; faster word and character splitting; API calls made before start-up are carried out; late-injected scripts start immediately; older GSAP copies from other plugins can be stopped cleanly; SVG drawings with pathLength on GSAP pages; updates keep the plugin's folder name when it was installed from a GitHub "Download ZIP".
* Final quality pass: "No sideways scrolling" now clips the page's top-level wrappers, so phone swipes are blocked too and Bricks' popup / off-canvas / mobile-menu scroll lock keeps working; replay no longer loops by itself on "fade down" / "zoom out"; printouts show scroll-linked and not-yet-revealed content; counters read their real number to screen readers; timelines blend deg ↔ turn, start "auto" scale from the designed scale, blend modern colour formats (oklch and others), restore page-wide targets of removed popups and survive page-transition tools; GSAP pins re-measure timelines; load more / filters follow content-template page settings; late-injected scripts wait for their engines; BricksMotion.refresh() accepts selectors; play() on content in a popup that is still opening waits for it; line reveals wait for web fonts; builder previews survive font loads and canvas resizes; keyframe track keyboard (Home / End / Page Up / Down), drag and click fixes; preset names are translatable; settings fields show visible labels on narrow screens; consistent names for the same settings everywhere; corrupted rules no longer break the settings screen; more robust automated checks on GitHub.

Licensing note: bundled GSAP is under the GSAP Standard License (see Description).
