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
// Timelines (asserted in run.mjs via data-case3 = "tl-*").
const tl = (rows) => "data-bme-tl='" + JSON.stringify(rows) + "'";
body += `<style>.tl-stage{height:2000px;position:relative}.tl-stage .pin{position:sticky;top:0;height:300px}.tl-d{position:absolute;left:50%;transform:translateX(-50%);width:100px}.tl-strip-wrap{overflow:hidden;width:400px}.tl-strip{display:flex;width:max-content}.tl-strip>div{width:300px;height:40px;flex:none}</style>
<section class="tl-stage" data-case3="tl-scroll" ${tl([
  { on: 'scroll', s: '.a', p: 'x', k: [[0, '0px'], [100, '200px']] },
  { on: 'scroll', s: '.b', p: 'width', k: [[0, '10px'], [100, '110px']] },
  { on: 'scroll', s: '.c', p: 'backgroundColor', k: [[0, '#ff0000'], [100, '#0000ff']] },
  { on: 'scroll', s: '.tl-d', p: 'y', k: [[0, '0px'], [100, '50px']] },
  { on: 'scroll', s: '.e', p: 'opacity', k: [[40, '0'], [60, '1']] },
  { on: 'scroll', s: '.f', p: 'y', k: [[0, '0px'], [100, '100px']], rs: 'top center', re: 'bottom center' },
  { on: 'scroll', s: '.tl-strip', p: 'x', k: [[0, '0px'], [100, '-overflow']] },
  { on: 'scroll', s: '.g', p: 'x', k: [[0, '0px'], [100, '99px']], bp: 'tablet' },
])}><div class="pin"><div class="a" data-case3="tl-a">a</div><div class="b" data-case3="tl-b" style="height:10px;background:#333"></div><div class="c" data-case3="tl-c" style="height:10px"></div><div class="tl-d" data-case3="tl-d">centred</div><div class="e" data-case3="tl-e">e</div><div class="f" data-case3="tl-f">f</div><div class="tl-strip-wrap"><div class="tl-strip" data-case3="tl-strip"><div>1</div><div>2</div><div>3</div></div></div><div class="g" data-case3="tl-g">g</div></div></section>
<div data-case3="tl-view" ${tl([{ on: 'view', p: 'opacity', k: [[0, '0'], [100, '1']], d: 0.3, o: 0 }, { on: 'view', p: 'y', k: [[0, '40px'], [100, '0px']], d: 0.3, o: 0 }])}>view</div>
<div data-case3="tl-hover" style="width:120px;height:40px;background:#eee" ${tl([{ on: 'hover', s: '.ov', p: 'x', k: [[0, '-100%'], [100, '0%']], d: 0.2, e: 'linear' }, { on: 'leave', s: '.ov', p: 'x', k: [[0, '0%'], [100, '100%']], d: 0.2, e: 'linear' }])}><div class="ov" data-case3="tl-ov" style="width:120px;height:40px;background:#333"></div></div>
<div data-case3="tl-loop" ${tl([{ on: 'loop', p: 'x', k: [[0, '0%'], [100, '-100%']], d: 1, e: 'linear' }])} style="width:100px">loop</div>
<div style="transform:translateY(10px)" data-case3="tl-auto" ${tl([{ on: 'hover', p: 'y', k: [[0, 'auto'], [100, '30px']], d: 0.2 }])}>auto</div>
<style>.qa-tx{position:relative;left:50%;width:200px;transform:translateX(-50%)}.qa-hidden{display:none}.qa-mq-wrap{width:300px}.qa-mq{display:flex;gap:20px}.qa-mq>div{width:100px;flex:none;height:20px;background:#ccc}.qa-ovf-wrap{overflow:hidden;width:400px;padding:0 20px;box-sizing:border-box}.qa-ovf{display:flex;width:max-content}.qa-ovf>div{width:300px;height:20px;flex:none}</style>
<div class="qa-tx" data-bme="fade-up" data-bme-engine="gsap" data-bme-opts='{"duration":2}' data-bme-hide data-case4="qa-gsap-designed">gsap keeps translateX(-50%)</div>
<div class="qa-hidden" id="qa-hidden-wrap"><div class="qa-tx" data-bme="fade-up" data-bme-engine="native" data-bme-opts='{"duration":2}' data-bme-hide data-case4="qa-hidden-designed">shown later</div></div>
<h2 data-bme="split-chars" data-bme-engine="native" data-bme-opts='{"duration":2}' data-bme-hide data-case4="qa-rtl">Hello שלום עולם</h2>
<h2 data-bme="split-words" data-bme-engine="native" data-bme-opts='{"duration":2}' data-bme-hide data-case4="qa-joiner">bbb<em>bbbbb</em>bbbbbbbb end</h2>
<h2 data-bme="split-lines" data-bme-engine="gsap" data-bme-opts='{"duration":2}' data-bme-hide data-case4="qa-lines-gsap">Masked line reveal that should rise into view without popping at the end of the animation</h2>
<div class="qa-mq-wrap"><div class="qa-mq" data-bme="marquee" data-bme-engine="native" data-bme-opts='{"duration":2}' data-case4="qa-marquee"><div>A</div><div>B</div><div>C</div><div data-bme="fade-up">D</div></div></div>
<div class="qa-tx" data-bme-hover="tilt" data-case4="qa-tilt" style="height:40px">tilt keeps translateX(-50%)</div>
<div data-case4="qa-tl-focus" ${tl([{ on: 'hover', s: '.ov', p: 'x', k: [[0, '0px'], [100, '50px']], d: 0.1, e: 'linear' }, { on: 'leave', s: '.ov', p: 'x', k: [[0, '50px'], [100, '0px']], d: 0.1, e: 'linear' }])}><a href="#a" class="l1">one</a> <a href="#b" class="l2">two</a><div class="ov" data-case4="qa-tl-focus-ov">ov</div></div>
<div data-case4="qa-tl-zero" ${tl([{ on: 'view', p: 'opacity', k: [[0, '0.2'], [100, '0.7']], d: 0, o: 0 }])}>zero</div>
<div data-case4="qa-tl-scale" ${tl([{ on: 'view', p: 'scale', k: [[0, '50%'], [100, '80%']], d: 0.1, o: 0 }])}>scale %</div>
<div data-case4="qa-tl-colour" ${tl([{ on: 'view', p: 'color', k: [[0, 'rgb(255 0 0 / 50%)'], [100, 'transparent']], d: 0, o: 0 }])}>colour</div>
<div class="qa-ovf-wrap"><div class="qa-ovf" data-case4="qa-tl-ovf" ${tl([{ on: 'view', p: 'x', k: [[0, '0px'], [100, '-overflow']], d: 0, o: 0 }])}><div>1</div><div>2</div></div></div>
<div class="qa-hidden" id="qa-tl-hidden-wrap"><div data-case4="qa-tl-hidden" ${tl([{ on: 'view', p: 'opacity', k: [[0, '0'], [100, '1']], d: 0, o: 0 }])}>hidden view</div></div>
<div data-case4="qa-tl-keep" style="width:120px" ${tl([{ on: 'scroll', p: 'x', k: [[0, '0px'], [100, '10px']], bp: 'desktop' }])}>keep other styles</div>
<div style="height:2500px"></div>
<div style="height:60px"></div>
${['motion', 'anime', 'gsap'].map((e) => `<div data-bme="scroll-fade" data-bme-engine="${e}" data-case4="qa-endfade-${e}" style="height:40px">end fade ${e}</div>`).join('')}
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>BME harness</title>
<style>html.bme-js:not(.bme-off):not(.bme-failsafe) [data-bme-hide]{opacity:.01}</style>
<script>(function(d,w){var h=d.documentElement;h.classList.add("bme-js");try{if(w.matchMedia("(prefers-reduced-motion: reduce)").matches)h.classList.add("bme-off")}catch(e){}w.setTimeout(function(){if(!(w.BricksMotion&&w.BricksMotion.started))h.classList.add("bme-failsafe")},3000);d.addEventListener("DOMContentLoaded",function(){if(!w.BricksMotion){h.classList.add("bme-failsafe")}})})(document,window);</script>
<script>window.__played={};document.addEventListener('bme:play',function(e){var el=e.detail&&e.detail.element;if(el&&el.dataset.case){window.__played[el.dataset.case]=e.detail.engine||'';}});</script>
<link rel="stylesheet" href="/plugin/assets/css/frontend${m}.css"><link rel="stylesheet" href="/plugin/assets/vendor/lenis/lenis.css">
</head><body>${body}
<script>window.BME_CONFIG=${JSON.stringify(cfg)};</script>
<script src="/plugin/assets/js/runtime${m}.js" defer></script>
<script>window.BME_TL={reduced:'respect'};</script><script src="/plugin/assets/js/timeline${m}.js" defer></script>
${['gsap','ScrollTrigger','SplitText','ScrambleTextPlugin','DrawSVGPlugin'].map(f=>`<script src="/plugin/assets/vendor/gsap/${f}.min.js" defer></script>`).join('')}
<script src="/plugin/assets/vendor/anime/${MIN ? 'anime.slim.min.js' : 'anime.umd.min.js'}" defer></script><script src="/plugin/assets/vendor/motion/${MIN ? 'motion.slim.min.js' : 'motion.js'}" defer></script><script src="/plugin/assets/vendor/lenis/lenis.min.js" defer></script>
<script src="/plugin/assets/js/adapter-gsap${m}.js" defer></script><script src="/plugin/assets/js/adapter-anime${m}.js" defer></script><script src="/plugin/assets/js/adapter-motion${m}.js" defer></script><script src="/plugin/assets/js/smooth-scroll${m}.js" defer></script>
</body></html>`;
writeFileSync(new URL('./harness.html', import.meta.url), html); console.log('cases', (body.match(/data-case=/g)||[]).length);
