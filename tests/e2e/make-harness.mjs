// Generates tests/e2e/harness.html: every preset on every engine, 3D scenes, hover, clipped case.
import { readFileSync, writeFileSync } from 'node:fs';
const presets = JSON.parse(readFileSync(new URL('../../includes/data/presets.json', import.meta.url), 'utf8'));
const engines = ['gsap', 'anime', 'motion'];
// BUILD=min tests the shipped files: minified runtime/adapters (presets baked in), slim Motion/Anime.
const MIN = process.env.BUILD === 'min';
const m = MIN ? '.min' : '';
const cfg = { version: 'test', debug: true, engine: 'gsap', engines, defaults: { duration: 0.6, delay: 0, ease: 'smooth', distance: 40, stagger: 0.05, offset: 12, batch: 0.05, speed: 0.3, replay: 0 },
  exclude: '.splide, [data-bme-skip]', popups: true, reduced: 'respect', minWidth: 0, presets: MIN ? undefined : presets, lenis: { lerp: 0.1, wheel: 1, touch: 0, anchors: 1 },
  three: { url: '/plugin/assets/js/three/bme-three.js', dpr: 1, mobile: true, eager: true } };
const text = 'The quick <strong>brown fox</strong> jumps over the lazy dog and keeps running far away';
let body = '';
// Built-in Web Animations engine: every preset it claims (mirrors nativeOk() in runtime.js).
const nativeOk = (p) => !p.engines && !p.core && !p.plugins && !p.draw && p.split !== 'lines' && ['reveal', 'text', 'loop'].includes(p.group);
for (const eng of [...engines, 'native']) {
  for (const [slug, p] of Object.entries(presets)) {
    if (eng === 'native' && !nativeOk(p)) continue;
    if (p.engines && !p.engines.includes(eng)) continue;
    if (p.core && eng !== 'gsap') continue;
    const hide = ['reveal', 'text', 'special'].includes(p.group) && p.hide !== false ? ' data-bme-hide' : '';
    let inner = `<p>${slug} / ${eng}</p>`;
    let tag = 'div', extra = '';
    if (p.group === 'text') { tag = 'h2'; inner = slug === 'scramble' ? 'Scramble this headline' : text; }
    if (slug === 'counter') inner = 'We shipped 1,250+ projects';
    if (slug === 'draw-svg') inner = '<svg width="120" height="60" viewBox="0 0 120 60"><path d="M5 30 Q 60 -20 115 30" stroke="#333" stroke-width="3" fill="none"/><circle cx="60" cy="40" r="12" stroke="#c00" fill="none" stroke-width="2"/></svg>';
    if (slug === 'horizontal-scroll') inner = '<div class="track" style="display:flex;width:max-content;gap:20px">' + Array.from({length:6},(_, i)=>`<div style="width:400px;height:200px;background:#ddd">${i}</div>`).join('') + '</div>';
    if (p.group === 'reveal' && slug === 'fade-up') { extra = ` data-bme-opts='{"scope":"children"}'`; inner = '<span>a</span><span>b</span><span>c</span>'; }
    body += `<section class="t" style="min-height:260px;padding:20px;border-bottom:1px solid #eee;overflow:hidden"><${tag} class="brxe-x" data-case="${slug}|${eng}" data-bme="${slug}" data-bme-engine="${eng}"${hide}${extra}>${inner}</${tag}></section>\n`;
  }
}
for (const scene of ['gradient', 'particles', 'waves', 'orbs']) body += `<section class="brxe-section bme-3d-host" data-case="3d-${scene}" data-bme-3d='{"scene":"${scene}","interactive":1,"colors":["#ff0066","var(--c2)"]}' style="height:300px;--c2:#00ccff"><p>3D ${scene}</p></section>\n`;
body += `<div class="brxe-bme-3d-scene bme-3d-scene" data-case="3d-model" data-bme-3d='{"scene":"model","mode":"element","model":"/Duck.glb","orbit":1}' style="height:300px"></div>\n`;
body += `<div data-case="hover" data-bme-hover="magnetic" style="width:100px;height:40px;background:#333">hover</div><div data-case="clip-hidden" style="height:30px;overflow:hidden"><div style="transform:translateY(80px)"><span class="brxe-text-basic" data-bme="fade-up" data-bme-hide data-case2="clipped">clipped</span></div></div>`;
// Designed opacity: a 50% layer must end at 50%; an invisible-by-design element must never show.
for (const eng of ['native', 'gsap', 'anime', 'motion']) body += `<style>.rest-zero{opacity:0}.rest-half{opacity:.5}</style><div class="rest-half" data-bme="fade-up" data-bme-engine="${eng}" data-bme-hide data-case2="rest-half-${eng}">half ${eng}</div><div class="rest-zero" data-bme="fade-up" data-bme-engine="${eng}" data-bme-hide data-case2="rest-zero-${eng}">zero ${eng}</div>`;
// Audit regressions (asserted in run.mjs via data-case2 = "audit-*").
body += `<style>.a-trans{transition:all .3s}.a-tx{position:relative;left:50%;width:200px;transform:translateX(-50%)}.a-kids>*{height:20px}.a-kids .off{opacity:0}</style>
<div class="a-trans" data-bme="fade-up" data-bme-engine="native" data-bme-hide data-case2="audit-transition">transition: all</div>
<script>/* like a real page that painted before the runtime started: styles are already computed */ getComputedStyle(document.currentScript.previousElementSibling).opacity;</script>
<div class="a-tx" data-bme="fade-up" data-bme-engine="native" data-bme-hide data-case2="audit-tx-reveal">centred reveal</div>
<div class="a-tx" data-bme="float" data-bme-engine="native" data-case2="audit-tx-loop">centred float</div>
<style>.a-kids .half{opacity:.5}</style>
<div class="a-kids" data-bme="fade-up" data-bme-engine="gsap" data-bme-opts='{"scope":"children"}' data-bme-hide data-case2="audit-kids"><div class="on">child on</div><div class="off" data-case2="audit-kid-off">child off</div></div>
<div class="a-kids" data-bme="fade-up" data-bme-engine="gsap" data-bme-opts='{"scope":"children"}' data-bme-hide data-case2="audit-kids-half"><div class="on">child on</div><div class="half" data-case2="audit-kid-half">child 50%</div></div>
<h2 data-bme="scramble" data-bme-engine="gsap" data-bme-hide data-case2="audit-xss">&lt;img src=x onerror="window.__xss=1"&gt; title</h2>
<script>/* flags markup created from the text at any moment, even if removed again */ new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)window.__xssNode=n.tagName;});});}).observe(document.currentScript.previousElementSibling,{childList:true,subtree:true});</script>
<div data-bme="pulse" data-bme-engine="native" data-case2="audit-play-loop" style="width:60px">pulse</div>
<div style="height:900px"></div>
<div id="a-clone-src" data-bme="fade-up" data-bme-engine="native" data-bme-hide data-case2="audit-clone-src">clone source</div>
<div id="a-clone-dst"></div>
<script>document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){var c=document.getElementById('a-clone-src').cloneNode(true);c.id='a-clone';c.setAttribute('data-case2','audit-clone');document.getElementById('a-clone-dst').appendChild(c);},300);});</script>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>BME harness</title>
<style>html.bme-js:not(.bme-off):not(.bme-failsafe) [data-bme-hide]{opacity:.01}</style>
<script>(function(d,w){var h=d.documentElement;h.classList.add("bme-js");try{if(w.matchMedia("(prefers-reduced-motion: reduce)").matches)h.classList.add("bme-off")}catch(e){}w.setTimeout(function(){if(!(w.BricksMotion&&w.BricksMotion.started))h.classList.add("bme-failsafe")},3000);d.addEventListener("DOMContentLoaded",function(){if(!w.BricksMotion){h.classList.add("bme-failsafe")}})})(document,window);</script>
<script>window.__played={};document.addEventListener('bme:play',function(e){var el=e.detail&&e.detail.element;if(el&&el.dataset.case){window.__played[el.dataset.case]=e.detail.engine||'';}});</script>
<link rel="stylesheet" href="/plugin/assets/css/frontend${m}.css"><link rel="stylesheet" href="/plugin/assets/vendor/lenis/lenis.css">
</head><body>${body}
<script>window.BME_CONFIG=${JSON.stringify(cfg)};</script>
<script src="/plugin/assets/js/runtime${m}.js" defer></script>
${['gsap','ScrollTrigger','SplitText','ScrambleTextPlugin','DrawSVGPlugin'].map(f=>`<script src="/plugin/assets/vendor/gsap/${f}.min.js" defer></script>`).join('')}
<script src="/plugin/assets/vendor/anime/${MIN ? 'anime.slim.min.js' : 'anime.umd.min.js'}" defer></script><script src="/plugin/assets/vendor/motion/${MIN ? 'motion.slim.min.js' : 'motion.js'}" defer></script><script src="/plugin/assets/vendor/lenis/lenis.min.js" defer></script>
<script src="/plugin/assets/js/adapter-gsap${m}.js" defer></script><script src="/plugin/assets/js/adapter-anime${m}.js" defer></script><script src="/plugin/assets/js/adapter-motion${m}.js" defer></script><script src="/plugin/assets/js/smooth-scroll${m}.js" defer></script>
</body></html>`;
writeFileSync(new URL('./harness.html', import.meta.url), html); console.log('cases', (body.match(/data-case=/g)||[]).length);
