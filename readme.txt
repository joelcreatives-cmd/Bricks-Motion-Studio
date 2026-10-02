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

= Licensing note =

GSAP is free (including commercial use) under the GSAP Standard License, which is not GPL and prohibits use in no-code visual animation tools that compete with Webflow without written consent. Use on your own/client sites is permitted; get consent from GSAP before selling or distributing this plugin with GSAP bundled. Anime.js, Motion, Lenis and Three.js are MIT.

== Installation ==

1. Upload the `bricks-motion-studio` folder to `/wp-content/plugins/`.
2. Activate the plugin (Bricks must be the active theme or parent theme).
3. Configure under Motion Studio in the dashboard sidebar.

== Frequently Asked Questions ==

= Do animations run inside the Bricks builder? =

No — the builder canvas stays static so editing is never obstructed. Use Bricks' preview or the frontend.

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
* Timeline: keyframe animations for an element and the elements inside it, started by scroll position, scrolling into view, hover (with an optional separate hover-out) or a loop. Animates position, rotation, scale, opacity, width, height and colours; custom scroll ranges; `auto` (the designed value) and `-overflow` (slide to the last card) values; exact GSAP-style easing curves; per-row screen sizes. Loads its own 3 KB script only on pages that use it.
* Marquee preset: a seamless endless strip (the content is duplicated once, hidden from screen readers and keyboard), pauses on hover and keyboard focus, clips its parent.
* Quality pass: elements with a designed transform (centred, rotated) keep it on every engine and in tilt hover; content in closed popups/tabs is measured when shown; right-to-left and joined scripts are never split into letters; words crossing inline tags don't wrap mid-word; scroll fades complete near the page end on every engine; GSAP line reveals no longer pop in; rules with an unavailable preset are kept; update checks use the new release's own requirements.
* Second quality pass: timeline elements never flash before their script runs, and are never also given an auto animation; timelines inside AJAX popups and filtered loops load their script when they arrive; keyframes are checked against their property (whole row or nothing) and accept colour names, hsl() and var(); colour fades blend like CSS; ranges inside sticky stages, view rows in popups and scrolling boxes, the mobile address bar, hover-out-only rows and `#brxe-` targets in query loops all work; turning on reduced motion mid-visit is handled fully (fades, 3D still frame, smooth scrolling removed cleanly, "ignore" respected); marquees in column or grid containers, counters like 0.125, `data-bme-replay="true"`, replay after skipping past, scroll-highlight after reset(), content printed while hidden, and centred looping elements after a font swap or resize; the Basic level also stops marquees; broken "never animate inside" selectors drop only themselves; class rules keep names like md:hidden; settings can be saved without JavaScript; the admin preview shows saved zero values.
* Third quality pass: 3D posters come back when a model can't load and only give way once the scene is drawn; 3D colours accept every CSS colour format; scenes out of view hand their WebGL slot to ones coming into view; Anime.js line reveals rise from one line-height; Motion has real elastic and bounce easing and leaves a theme's own Motion alone; scroll fades on Anime.js and Motion re-measure when the page height changes; SVG drawing and word splitting no longer download libraries they don't use; settings snippets are protected from Rocket Loader and similar optimizers; the 3D placeholder only appears in the builder; templates rendered late in the footer are counted; Bricks interactions with a leftover selector are recognised; component overrides of timeline rows work; timeline colours resolve correctly on elements with CSS transitions; sticky stages with absolute layers measure correctly; content inserted by other scripts is picked up; a timeline aimed only at child elements keeps the element's own reveal; marquees keep a column layout's spacing.

Licensing note: bundled GSAP is under the GSAP Standard License (see Description).
