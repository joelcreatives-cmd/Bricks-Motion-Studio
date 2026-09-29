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

* 39 presets: reveals, text splitting, scroll-linked (parallax, scrub, pin, horizontal scroll), loops, counters, SVG drawing, hover effects.
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
* 39 presets, auto-animate rules by element type or CSS class, a Motion Studio panel on every Bricks element (nested children included), 3D backgrounds and the 3D Scene element.
* Animation levels (Basic / Moderate / Advanced) site-wide, per page and per element; page settings; start animations from Bricks Interactions (BricksMotion.play / reset).
* Respects each element's designed opacity and transform; accessible text splitting; reduced-motion options; fail-safes for blocked or delayed scripts; optimizer-plugin compatibility.
* Minified runtime with the preset catalog built in; slim bundled builds of Anime.js and Motion; libraries load only on pages that use them.
* Settings app with live previews, system checks, export / import / reset; end-to-end test suite.
* Updates from GitHub releases; automated checks on every push.

Licensing note: bundled GSAP is under the GSAP Standard License (see Description).
