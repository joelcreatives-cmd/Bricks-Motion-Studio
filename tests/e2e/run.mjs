// End-to-end regression test. Usage: npm run test:e2e   (CHROME=/path/to/chrome to override)
// Fails (exit 1) if any reveal/text preset ends hidden or leaves inline styles/split markup behind,
// if scrub/loop presets don't move, if a 3D scene fails to mount, or on any page error.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { start } from './server.mjs';

execFileSync( 'node', [ new URL( './make-harness.mjs', import.meta.url ).pathname ], { stdio: 'inherit' } );
const server = await start();
const executablePath = process.env.CHROME || ( process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome' );
// CI runners (Ubuntu 24.04) restrict the user namespaces Chrome's sandbox needs; the page is our own local harness.
const ciArgs = process.env.CI ? [ '--no-sandbox' ] : [];
const browser = await puppeteer.launch( { executablePath, headless: 'new', args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...ciArgs ] } );
let failed = 0;

async function run( mode ) {
	const page = await browser.newPage();
	await page.setViewport( { width: 1280, height: 800 } );
	if ( mode === 'reduced' ) await page.emulateMediaFeatures( [ { name: 'prefers-reduced-motion', value: 'reduce' } ] );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	// The runtime logs (debug mode) whenever it had to give up on an animation: a silent fallback
	// that shows content without animating must fail the test, not pass it.
	page.on( 'console', ( m ) => {
		if ( /Animation failed|Watchdog finished|No engine available|Could not initialize|Start failed|Loop (resume|pause) failed/.test( m.text() ) ) errors.push( 'runtime: ' + m.text().replace( /%c|color:[^;]*;font-weight:\d+/g, '' ).trim().slice( 0, 160 ) );
	} );
	await page.goto( 'http://localhost:8765/', { waitUntil: 'networkidle0' } );
	// Hidden start states must be opacity .01, never 0: Chrome drops elements painted at 0 from LCP
	// (compositor fades never repaint), so a hero image would stop counting as the largest paint.
	const zeroStarts = mode === 'default' ? await page.evaluate( () => [ ...document.querySelectorAll( '[data-bme], [data-bme] *' ) ].filter( ( e ) => e.style && e.style.opacity === '0' ).length ) : 0;
	const moving = {};
	const restZeroShown = new Set();
	const H = await page.evaluate( () => document.documentElement.scrollHeight );
	for ( let y = 0; y <= H; y += 300 ) {
		await page.evaluate( ( y ) => ( window.BricksMotion && BricksMotion.lenis ? BricksMotion.lenis.scrollTo( y, { immediate: true } ) : scrollTo( 0, y ) ), y );
		await new Promise( ( r ) => setTimeout( r, 120 ) );
		const snap = await page.evaluate( () => Object.fromEntries( [ ...document.querySelectorAll( '[data-case]' ) ].map( ( e ) => [ e.dataset.case, getComputedStyle( e ).transform + getComputedStyle( e ).opacity ] ) ) );
		for ( const k in snap ) ( moving[ k ] = moving[ k ] || new Set() ).add( snap[ k ] );
		// Invisible-by-design elements must never become visible, not even mid-animation.
		const shown = await page.evaluate( () => [
			...[ ...document.querySelectorAll( '[data-case2^="rest-zero"], [data-case2="audit-kid-off"]' ) ].filter( ( e ) => +getComputedStyle( e ).opacity > 0.01 ),
			// Designed at 50%: must never pass 50% (no flash to 100% mid-animation).
			...[ ...document.querySelectorAll( '[data-case2^="rest-half"], [data-case2="audit-kid-half"]' ) ].filter( ( e ) => +getComputedStyle( e ).opacity > 0.51 ),
		].map( ( e ) => e.dataset.case2 ) );
		shown.forEach( ( c ) => restZeroShown.add( c ) );
	}
	await new Promise( ( r ) => setTimeout( r, 3000 ) );
	// BricksMotion.play() on a loop must leave it looping (checked after more than one cycle).
	let playLoopBroken = false;
	if ( mode === 'default' ) {
		await page.evaluate( () => {
			const el = document.querySelector( '[data-case2="audit-play-loop"]' );
			el.scrollIntoView( { block: 'center' } );
			BricksMotion.play( el );
		} );
		await new Promise( ( r ) => setTimeout( r, 2600 ) );
		playLoopBroken = await page.evaluate( () => {
			const el = document.querySelector( '[data-case2="audit-play-loop"]' );
			return el.dataset.bmeState === 'done' || ! el.getAnimations().length;
		} );
	}
	const res = await page.evaluate( ( mode ) => {
		const fail = [];
		document.querySelectorAll( '[data-bme]' ).forEach( ( e ) => {
			const c = e.dataset.case || e.dataset.case2;
			if ( c === undefined || e.dataset.case2 === 'clipped' ) return;
			if ( /^rest-/.test( e.dataset.case2 || '' ) ) {
				const op = +getComputedStyle( e ).opacity;
				const want = /^rest-half/.test( e.dataset.case2 ) ? 0.5 : 0;
				if ( Math.abs( op - want ) > 0.01 ) fail.push( e.dataset.case2 + ' ended at opacity ' + op + ' (designed ' + want + ')' );
				if ( /opacity|transform/.test( e.getAttribute( 'style' ) || '' ) ) fail.push( e.dataset.case2 + ' left inline styles' );
				return;
			}
			const p = BricksMotion.presets[ e.dataset.bme ];
			const op = +getComputedStyle( e ).opacity;
			if ( op < 0.99 && ! [ 'scroll', 'loop' ].includes( p.group ) ) fail.push( c + ' hidden (opacity ' + op + ')' );
			if ( mode === 'default' && [ 'reveal', 'text', 'special' ].includes( p.group ) && e.dataset.bme !== 'scroll-highlight' ) {
				if ( e.dataset.bmeState !== 'done' ) fail.push( c + ' not finished (' + e.dataset.bmeState + ')' );
				if ( /opacity|transform|filter|clip-path|transition|will-change/.test( e.getAttribute( 'style' ) || '' ) ) fail.push( c + ' left inline styles: ' + e.getAttribute( 'style' ) );
				if ( e.querySelector( '.bme-word, .bme-char, .bme-line, .bme-sr-only' ) ) fail.push( c + ' left split markup' );
			}
		} );
		// Audit regressions.
		const q = ( c ) => document.querySelector( '[data-case2="' + c + '"]' );
		const op = ( c ) => +getComputedStyle( q( c ) ).opacity;
		if ( op( 'audit-transition' ) < 0.99 ) fail.push( 'audit: element with a CSS transition ended at opacity ' + op( 'audit-transition' ) );
		if ( mode === 'default' && q( 'audit-transition' ).dataset.bmeState !== 'done' ) fail.push( 'audit: element with a CSS transition was not animated' );
		if ( ! q( 'audit-clone' ) || op( 'audit-clone' ) < 0.99 ) fail.push( 'audit: clone made after setup ended at opacity ' + ( q( 'audit-clone' ) ? op( 'audit-clone' ) : 'missing' ) );
		const txOf = ( c ) => new DOMMatrix( getComputedStyle( q( c ) ).transform ).m41;
		if ( Math.abs( txOf( 'audit-tx-reveal' ) + 100 ) > 1 ) fail.push( 'audit: reveal lost translateX(-50%): x=' + txOf( 'audit-tx-reveal' ) );
		if ( mode === 'default' && Math.abs( txOf( 'audit-tx-loop' ) + 100 ) > 1 ) fail.push( 'audit: loop lost translateX(-50%): x=' + txOf( 'audit-tx-loop' ) );
		if ( op( 'audit-kid-off' ) > 0.01 ) fail.push( 'audit: invisible-by-design child is visible' );
		if ( window.__xss || window.__xssNode || q( 'audit-xss' ).querySelector( 'img' ) ) fail.push( 'audit: scramble turned text into markup (XSS): ' + ( window.__xssNode || 'script ran' ) );
		if ( ! /onerror/.test( q( 'audit-xss' ).textContent ) ) fail.push( 'audit: scramble changed the text: ' + q( 'audit-xss' ).textContent );

		// Every case that played must have played on the engine it asked for (no silent fallback).
		const notPlayed = [];
		document.querySelectorAll( '[data-case][data-bme-engine]' ).forEach( ( e ) => {
			const p = BricksMotion.presets[ e.dataset.bme ];
			if ( ! p || p.core ) return; // engine-free presets (counter, highlight) report no engine
			const got = ( window.__played || {} )[ e.dataset.case ];
			if ( got !== undefined && got !== e.dataset.bmeEngine ) fail.push( e.dataset.case + ' ran on ' + ( got || 'no engine' ) + ' instead of ' + e.dataset.bmeEngine );
			// Every timed reveal/text/special case must actually have played (scroll/loop presets are
			// driven by scrolling instead and are covered by the "moving" check).
			if ( mode === 'default' && got === undefined && [ 'reveal', 'text', 'special' ].includes( p.group ) ) notPlayed.push( e.dataset.case );
		} );
		if ( notPlayed.length ) fail.push( 'never played: ' + notPlayed.join( ', ' ) );
		const three = [ ...document.querySelectorAll( '[data-case][data-bme-3d]' ) ].filter( ( e ) => ! e.classList.contains( 'bme-3d-ready' ) ).map( ( e ) => e.dataset.case );
		return { fail, three, adapters: Object.keys( BricksMotion.adapters ) };
	}, mode );
	// Timelines.
	const tlFail = await page.evaluate( async ( mode ) => {
		const fail = [];
		const q = ( c ) => document.querySelector( '[data-case3="' + c + '"]' );
		const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
		const go = async ( y ) => { scrollTo( { top: y, behavior: 'instant' } ); await wait( 150 ); };
		const stage = q( 'tl-scroll' ); let top = 0; for ( let n = stage; n; n = n.offsetParent ) top += n.offsetTop;
		const vh = innerHeight, start = top - vh, len = vh + stage.offsetHeight;
		const tx = ( el ) => new DOMMatrix( getComputedStyle( el ).transform );
		const near = ( a, b, tol, what ) => { if ( Math.abs( a - b ) > tol ) fail.push( what + ': ' + a.toFixed( 2 ) + ' (want ' + b + ')' ); };
		await go( start + 0.5 * len );
		near( tx( q( 'tl-a' ) ).m41, 100, 2, 'tl scroll x at 50%' );
		near( q( 'tl-b' ).getBoundingClientRect().width, 60, 2, 'tl scroll width at 50%' );
		const bg = getComputedStyle( q( 'tl-c' ) ).backgroundColor.match( /\d+/g ).map( Number );
		near( bg[ 0 ], 128, 3, 'tl colour red at 50%' ); near( bg[ 2 ], 128, 3, 'tl colour blue at 50%' );
		near( tx( q( 'tl-d' ) ).m42, 25, 2, 'tl y on a designed transform' );
		near( tx( q( 'tl-d' ) ).m41, -50, 2, 'tl keeps the designed translateX(-50%)' );
		near( +getComputedStyle( q( 'tl-e' ) ).opacity, 0.5, 0.05, 'tl keyframes 40..60 at 50%' );
		// custom range: top of stage at the centre → bottom of stage at the centre
		const fStart = top - vh / 2, fLen = stage.offsetHeight;
		await go( fStart + 0.25 * fLen ); near( tx( q( 'tl-f' ) ).m42, 25, 2, 'tl custom range at 25%' );
		await go( start + len + 50 );
		const strip = q( 'tl-strip' ); near( tx( strip ).m41, -( strip.scrollWidth - strip.parentElement.clientWidth ), 2, 'tl -overflow at the end' );
		near( tx( q( 'tl-a' ) ).m41, 200, 2, 'tl holds the last keyframe after the range' );
		await go( 0 ); near( tx( q( 'tl-a' ) ).m41, 0, 2, 'tl holds the first keyframe before the range' );
		if ( tx( q( 'tl-g' ) ).m41 !== 0 ) fail.push( 'tl tablet-only row ran on desktop' );
		// view
		q( 'tl-view' ).scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( 700 );
		near( +getComputedStyle( q( 'tl-view' ) ).opacity, 1, 0.02, 'tl view ends visible' ); near( tx( q( 'tl-view' ) ).m42, 0, 1, 'tl view ends in place' );
		// hover + leave (leave plays forward, it does not reverse)
		const h = q( 'tl-hover' ), ov = q( 'tl-ov' );
		h.scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( 100 );
		near( tx( ov ).m41, -120, 2, 'tl hover rest' );
		h.dispatchEvent( new PointerEvent( 'pointerenter' ) ); await wait( 400 ); near( tx( ov ).m41, 0, 2, 'tl hovered' );
		h.dispatchEvent( new PointerEvent( 'pointerleave' ) ); await wait( 400 ); near( tx( ov ).m41, 120, 2, 'tl hover-out exits the other way' );
		// auto = the designed value
		const au = q( 'tl-auto' ); near( tx( au ).m42, 10, 1, 'tl auto rests at the designed value' );
		au.dispatchEvent( new PointerEvent( 'pointerenter' ) ); await wait( 400 ); near( tx( au ).m42, 30, 1, 'tl auto → 30px' );
		// loop
		const lp = q( 'tl-loop' ); lp.scrollIntoView( { block: 'center', behavior: 'instant' } );
		const a1 = tx( lp ).m41; await wait( 300 ); const a2 = tx( lp ).m41;
		if ( mode === 'default' && a1 === a2 ) fail.push( 'tl loop not moving' );
		if ( mode === 'reduced' && ( a1 !== 0 || a2 !== 0 ) ) fail.push( 'tl loop moves under reduced motion' );
		// exact easing curves (GSAP power1-4 / expo / back)
		const E = window.BricksMotionTimeline && window.BricksMotionTimeline.ease;
		if ( ! E ) fail.push( 'tl not running' );
		else {
			near( E( 'in-out-quad', 0.25 ), 0.125, 1e-9, 'ease in-out-quad' ); near( E( 'out-cubic', 0.5 ), 0.875, 1e-9, 'ease out-cubic' );
			near( E( 'out-quart', 0.3 ), 1 - Math.pow( 0.7, 4 ), 1e-9, 'ease out-quart' ); near( E( 'in-out-expo', 0.5 ), 0.5, 1e-9, 'ease in-out-expo' );
			near( E( 'out-back', 0.5 ), 1 + 2.70158 * Math.pow( -0.5, 3 ) + 1.70158 * 0.25, 1e-9, 'ease out-back' );
		}
		return fail;
	}, mode );
	res.fail.push( ...tlFail );
	// QA regressions (data-case4).
	const qaFail = await page.evaluate( async ( mode ) => {
		const fail = [];
		const q = ( c ) => document.querySelector( '[data-case4="' + c + '"]' );
		const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
		const tx = ( el ) => new DOMMatrix( getComputedStyle( el ).transform );
		const into = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( ms ); };
		const near = ( a, b, tol, what ) => { if ( Math.abs( a - b ) > tol ) fail.push( what + ': ' + ( +a ).toFixed( 2 ) + ' (want ' + b + ')' ); };
		// The main loop already scrolled everything into view: replay to look mid-animation.
		const replay = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); BricksMotion.reset( el ); await wait( 60 ); BricksMotion.play( el ); await wait( ms ); };
		// designed transform kept on a library engine (switches to the built-in engine)
		const gd = q( 'qa-gsap-designed' ); if ( mode === 'default' ) await replay( gd, 900 ); else await into( gd, 900 ); near( tx( gd ).m41, -100, 1, 'gsap reveal keeps translateX(-50%) mid-animation' );
		await wait( 1800 ); near( tx( gd ).m41, -100, 1, 'gsap reveal keeps translateX(-50%) at the end' );
		// set up only once shown: designed transform measured for real
		const hd = q( 'qa-hidden-designed' ); document.getElementById( 'qa-hidden-wrap' ).style.display = 'block';
		await wait( 100 ); await into( hd, 900 );
		if ( mode === 'default' ) near( tx( hd ).m41, -100, 1, 'hidden-at-load reveal keeps translateX(-50%) mid-animation' );
		await wait( 1800 );
		if ( mode === 'default' && hd.dataset.bmeState !== 'done' ) fail.push( 'hidden-at-load reveal never played (' + hd.dataset.bmeState + ')' );
		near( tx( hd ).m41, -100, 1, 'hidden-at-load reveal keeps translateX(-50%)' ); near( +getComputedStyle( hd ).opacity, 1, 0.01, 'hidden-at-load reveal visible' );
		// RTL mixed text is not split into characters
		const rtl = q( 'qa-rtl' ); if ( mode === 'default' ) await replay( rtl, 400 ); else await into( rtl, 400 );
		if ( rtl.querySelector( '.bme-char' ) ) fail.push( 'mixed RTL text was split into characters' );
		await wait( 2500 ); if ( rtl.textContent !== 'Hello שלום עולם' ) fail.push( 'RTL text changed: ' + rtl.textContent );
		// word joiner across an inline tag, removed again afterwards
		const jn = q( 'qa-joiner' ); if ( mode === 'default' ) await replay( jn, 400 ); else await into( jn, 400 );
		if ( mode === 'default' && ! /\u2060/.test( jn.textContent ) ) fail.push( 'no word joiner across the inline tag' + ( jn.querySelector( '.bme-word' ) ? '' : ' (not split)' ) );
		await wait( 2600 ); if ( /\u2060/.test( jn.textContent ) || jn.querySelector( '.bme-word' ) ) fail.push( 'split markup or joiner left behind' );
		// GSAP split-lines: halfway through, lines are partly risen (not still fully under the mask)
		const ln = q( 'qa-lines-gsap' ); if ( mode === 'default' ) await replay( ln, 1000 ); else await into( ln, 1000 );
		if ( mode === 'default' ) {
			const lines = [ ...ln.querySelectorAll( '.bme-line' ) ].filter( ( l ) => l.offsetHeight && ! /mask/.test( l.className ) );
			if ( ! lines.length ) fail.push( 'gsap split-lines: no lines found halfway' );
			const lowered = lines.filter( ( l ) => tx( l ).m42 > l.offsetHeight * 0.95 );
			if ( lines.length && lowered.length === lines.length ) fail.push( 'gsap split-lines still fully masked halfway (double offset)' );
		}
		// marquee: content duplicated (inert copies), strip is one row, parent clips, seamless travel
		const mq = q( 'qa-marquee' ); await into( mq, 200 );
		const copies = mode === 'default' ? mq.querySelectorAll( '[data-bme-clone]' ) : [];
		if ( mode === 'reduced' && mq.querySelector( '[data-bme-clone]' ) ) fail.push( 'marquee set up under reduced motion' );
		if ( mode === 'default' ) {
		if ( copies.length !== 4 ) fail.push( 'marquee copies: ' + copies.length + ' (want 4)' );
		if ( [ ...copies ].some( ( c ) => c.getAttribute( 'aria-hidden' ) !== 'true' || ! c.hasAttribute( 'inert' ) || c.hasAttribute( 'data-bme' ) ) ) fail.push( 'marquee copies not hidden / inert / clean' );
		if ( getComputedStyle( mq.parentElement ).overflowX !== 'clip' ) fail.push( 'marquee parent does not clip' );
		const D = mq.querySelector( ':scope > div:nth-child(4)' ); if ( +getComputedStyle( D ).opacity < 0.99 ) fail.push( 'child inside the marquee hidden' );
		const half = ( mq.scrollWidth ) / 2, firstCopy = copies[ 0 ];
		if ( firstCopy ) near( firstCopy.offsetLeft, half, 1, 'marquee copy starts exactly half way (seamless)' );
		}
		// tilt keeps the designed translateX(-50%), and leaves nothing behind
		const tl = q( 'qa-tilt' ); await into( tl, 50 );
		if ( mode === 'default' ) {
			const r = tl.getBoundingClientRect();
			tl.dispatchEvent( new PointerEvent( 'pointermove', { clientX: r.left + r.width * 0.9, clientY: r.top + r.height * 0.9, bubbles: true, pointerType: 'mouse' } ) );
			await wait( 300 ); near( tx( tl ).m41, -100, 12, 'tilt keeps translateX(-50%)' );
			tl.dispatchEvent( new PointerEvent( 'pointerleave', { pointerType: 'mouse' } ) ); await wait( 1500 );
			if ( tl.getAttribute( 'style' ) && /transform/.test( tl.getAttribute( 'style' ) ) ) fail.push( 'tilt left an inline transform: ' + tl.getAttribute( 'style' ) );
		}
		// timeline: focus moving between links inside the root does not replay the hover
		const fr = q( 'qa-tl-focus' ), fov = q( 'qa-tl-focus-ov' ); await into( fr, 50 );
		fr.querySelector( '.l1' ).focus(); await wait( 300 ); near( tx( fov ).m41, 50, 1, 'tl hover on focus' );
		fr.querySelector( '.l2' ).focus(); await wait( 20 ); near( tx( fov ).m41, 50, 1, 'tl hover not restarted by focus moving inside' );
		fr.querySelector( '.l2' ).blur(); await wait( 300 ); near( tx( fov ).m41, 0, 1, 'tl hover leaves when focus leaves' );
		// timeline: zero-duration rows land on their end state; scale %, colour syntax
		await into( q( 'qa-tl-zero' ), 300 ); near( +getComputedStyle( q( 'qa-tl-zero' ) ).opacity, 0.7, 0.01, 'tl zero-duration view lands' );
		await into( q( 'qa-tl-scale' ), 400 ); near( tx( q( 'qa-tl-scale' ) ).a, 0.8, 0.01, 'tl scale 80%' );
		await into( q( 'qa-tl-colour' ), 300 ); if ( ! /rgba\(0, 0, 0, 0\)/.test( getComputedStyle( q( 'qa-tl-colour' ) ).color ) ) fail.push( 'tl transparent colour: ' + getComputedStyle( q( 'qa-tl-colour' ) ).color );
		// timeline: -overflow respects the parent's padding
		const ov = q( 'qa-tl-ovf' ); await into( ov, 300 );
		const wrap = ov.parentElement.getBoundingClientRect(), last = ov.lastElementChild.getBoundingClientRect();
		near( last.right, wrap.right - 20, 1.5, 'tl -overflow ends at the padded edge' );
		// timeline: view rows inside hidden content wait until shown
		const th = q( 'qa-tl-hidden' ); await wait( 100 );
		near( +getComputedStyle( th ).opacity, 0, 0.01, 'tl hidden view row waits (rests at keyframe 0)' );
		document.getElementById( 'qa-tl-hidden-wrap' ).style.display = 'block'; await into( th, 400 );
		near( +getComputedStyle( th ).opacity, 1, 0.01, 'tl view row plays once shown' );
		// scroll-fade near the page end reaches the end on every engine
		// Anime's scroll sync is smoothed (it eases in after scrolling stops): wait until it settles.
		scrollTo( { top: document.documentElement.scrollHeight, behavior: 'instant' } ); await wait( 1200 );
		for ( let i = 0; i < 28 && [ 'motion', 'anime', 'gsap' ].some( ( e ) => q( 'qa-endfade-' + e ) && +getComputedStyle( q( 'qa-endfade-' + e ) ).opacity < 0.97 ); i++ ) await wait( 100 );
		[ 'motion', 'anime', 'gsap' ].forEach( ( e ) => { const el = q( 'qa-endfade-' + e ); if ( el && mode === 'default' ) near( +getComputedStyle( el ).opacity, 1, 0.03, 'scroll-fade at page end (' + e + ')' ); } );
		return fail;
	}, mode );
	res.fail.push( ...qaFail );
	// QA round 2 regressions (data-case5).
	const c5Fail = await page.evaluate( async ( mode ) => {
		const fail = [];
		const q = ( c ) => document.querySelector( '[data-case5="' + c + '"]' );
		const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
		const tx = ( el ) => new DOMMatrix( getComputedStyle( el ).transform );
		const into = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( ms ); };
		const near = ( a, b, tol, what ) => { if ( ! ( Math.abs( a - b ) <= tol ) ) fail.push( what + ': ' + ( +a ).toFixed( 2 ) + ' (want ' + b + ')' ); };
		const rgba = ( el, p ) => ( getComputedStyle( el )[ p ].match( /[\d.]+/g ) || [] ).map( Number );
		// anti-flash flag is lifted once timelines start
		if ( q( 'tl-flag' ).hasAttribute( 'data-bme-tl-hide' ) ) fail.push( 'timeline hide flag not lifted' );
		// colours: premultiplied mixing, named colours and custom properties
		const pm = q( 'tl-premul' );
		if ( mode === 'default' ) {
			window.BricksMotionTimeline.rebuild(); await into( pm, 2000 );
			const c = rgba( pm, 'backgroundColor' );
			if ( ! ( c[ 0 ] > 240 && c[ 3 ] > 0.2 && c[ 3 ] < 0.8 ) ) fail.push( 'transparent → white mid-way not translucent white: ' + getComputedStyle( pm ).backgroundColor );
		}
		await into( q( 'tl-named' ), 300 );
		if ( getComputedStyle( q( 'tl-named' ) ).color !== 'rgb(0, 128, 0)' ) fail.push( 'var() colour end state: ' + getComputedStyle( q( 'tl-named' ) ).color );
		// a value that does not suit the property drops its row only
		const bu = q( 'tl-badunit' ); await into( bu, 300 );
		near( tx( bu ).a, 0.5, 0.01, 'other rows survive a bad-unit row (scale)' ); near( tx( bu ).m41, 0, 0.01, 'bad-unit row ignored (x)' );
		// "hover out" rows without hover rows still run
		const lv = q( 'tl-leave' ); await into( lv, 50 );
		lv.dispatchEvent( new PointerEvent( 'pointerenter', { pointerType: 'mouse' } ) ); await wait( 50 );
		lv.dispatchEvent( new PointerEvent( 'pointerleave', { pointerType: 'mouse' } ) ); await wait( 400 );
		near( tx( q( 'tl-leave-t' ) ).m41, 30, 0.5, 'leave-only row plays on pointer leave' );
		// zero-length loop lands instead of spinning
		await into( q( 'tl-zeroloop' ), 200 ); if ( mode === 'default' ) near( +getComputedStyle( q( 'tl-zeroloop' ) ).opacity, 0.6, 0.01, 'zero-length loop lands on its end' );
		// view row inside a box with its own scrollbar plays when the box scrolls
		const box = q( 'tl-box' ), ib = q( 'tl-inbox' ); await into( box, 200 );
		near( +getComputedStyle( ib ).opacity, 0, 0.01, 'view row in a box waits for the box' );
		box.scrollTop = box.scrollHeight; await wait( 400 );
		near( +getComputedStyle( ib ).opacity, 1, 0.01, 'view row in a box plays when the box scrolls' );
		// ranges measured inside a pinned (sticky) stage do not depend on when they were measured
		const st = q( 'tl-sticky' ), stT = q( 'tl-sticky-t' );
		const top = st.getBoundingClientRect().top + scrollY;
		scrollTo( { top: top + 500, behavior: 'instant' } ); await wait( 100 );
		window.BricksMotionTimeline.refresh(); await wait( 100 );
		near( tx( stT ).m41, 500 / ( 2000 - innerHeight ) * 1000, 4, 'range measured while pinned' );
		// an element with its own timeline is not also auto-animated
		if ( q( 'tl-auto' ).hasAttribute( 'data-bme-owner' ) || q( 'tl-auto' ).dataset.bmeState === 'done' ) fail.push( 'auto rule animated an element that has a timeline' );
		if ( +getComputedStyle( q( 'tl-auto' ) ).opacity < 0.99 ) fail.push( 'timeline element left hidden by the auto rule' );
		// marquee inside a column flexbox runs in one row
		if ( mode === 'default' ) {
			const mc = q( 'mq-col' ); await into( mc, 200 );
			const kids = [ ...mc.children ];
			if ( kids.length !== 4 || kids.some( ( k ) => k.offsetTop !== kids[ 0 ].offsetTop ) ) fail.push( 'marquee in a column flexbox is not one row' );
		}
		// counter: 0.125 counts as a decimal (never shows 125)
		if ( mode === 'default' ) {
			const cn = q( 'counter-dec' ); cn.scrollIntoView( { block: 'center', behavior: 'instant' } ); BricksMotion.reset( cn ); await wait( 60 ); BricksMotion.play( cn );
			let max = 0;
			for ( let i = 0; i < 12; i++ ) { await wait( 200 ); max = Math.max( max, parseFloat( cn.textContent.replace( ',', '.' ) ) || 0 ); }
			if ( max > 1 ) fail.push( 'counter 0.125 counted past 1: ' + max );
			if ( cn.textContent.trim() !== '0.125' ) fail.push( 'counter end text: ' + cn.textContent );
		}
		// data-bme-replay="true" replays after scrolling away and back
		if ( mode === 'default' ) {
			const rp = q( 'replay-attr' ); await into( rp, 1500 );
			scrollTo( { top: Math.max( 0, rp.getBoundingClientRect().top + scrollY - innerHeight * 3 ), behavior: 'instant' } ); await wait( 600 );
			if ( rp.dataset.bmeState === 'done' ) fail.push( 'data-bme-replay="true" did not reset when scrolled back up' );
		}
		// GSAP line reveal around a link keeps the link element (listeners, focus)
		const ll = q( 'lines-link' ), link = ll.querySelector( '.c5-link' ); await into( ll, 2500 );
		if ( ! link.isConnected ) fail.push( 'line reveal replaced the link inside it' );
		// BricksMotion.reset() leaves scroll-highlight working
		const hl = q( 'highlight' ); await into( hl, 300 ); BricksMotion.reset( hl ); await wait( 300 );
		if ( +getComputedStyle( hl ).opacity < 0.99 ) fail.push( 'reset() hid scroll-highlight text' );
		// printed while hidden, then shown: stays visible
		window.dispatchEvent( new Event( 'beforeprint' ) ); await wait( 50 );
		document.getElementById( 'c5-print-wrap' ).style.display = 'block'; const pw = q( 'print-wait' ); await into( pw, 1500 );
		near( +getComputedStyle( pw ).opacity, 1, 0.01, 'printed-while-hidden reveal visible once shown' );
		// a node inserted by another script that itself has a hover effect gets it
		const ins = document.createElement( 'div' ); ins.setAttribute( 'data-bme-hover', 'lift' ); ins.textContent = 'inserted';
		document.getElementById( 'c5-insert' ).appendChild( ins ); await wait( 300 );
		if ( mode === 'default' && ! ins.classList.contains( 'bme-hover-lift' ) ) fail.push( 'hover effect on an inserted node not set up' );
		return fail;
	}, mode );
	res.fail.push( ...c5Fail );
	// QA round 3 regressions (data-case6).
	const c6Fail = await page.evaluate( async ( mode ) => {
		const fail = [];
		const q = ( c ) => document.querySelector( '[data-case6="' + c + '"]' );
		const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
		const tx = ( el ) => new DOMMatrix( getComputedStyle( el ).transform );
		const into = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( ms ); };
		const near = ( a, b, tol, what ) => { if ( ! ( Math.abs( a - b ) <= tol ) ) fail.push( what + ': ' + ( +a ).toFixed( 2 ) + ' (want ' + b + ')' ); };
		const replay = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); BricksMotion.reset( el ); await wait( 60 ); BricksMotion.play( el ); await wait( ms ); };
		if ( mode === 'default' ) {
			// Anime line reveal: lines start one line-height down (their own height), not hundreds of px
			const la = q( 'lines-anime' ); await replay( la, 150 );
			const pieces = [ ...la.querySelectorAll( '.bme-word, .bme-line' ) ].filter( ( l ) => l.offsetHeight );
			const worst = Math.max( 0, ...pieces.map( ( l ) => tx( l ).m42 / l.offsetHeight ) );
			if ( ! pieces.length ) fail.push( 'anime split-lines: nothing split' );
			else if ( worst > 1.05 ) fail.push( 'anime split-lines start ' + worst.toFixed( 1 ) + ' line heights down (want ≤ 1)' );
			// Motion elastic overshoots past its resting place (not a plain back-out)
			const em = q( 'elastic-motion' ); em.scrollIntoView( { block: 'center', behavior: 'instant' } ); BricksMotion.reset( em ); await wait( 60 ); BricksMotion.play( em );
			let minY = 99, crossings = 0, last = null;
			for ( let i = 0; i < 40; i++ ) { await wait( 50 ); const y = tx( em ).m42; minY = Math.min( minY, y ); if ( last !== null && Math.sign( y ) !== Math.sign( last ) && Math.abs( y ) > 0.3 ) crossings++; last = y; }
			if ( crossings < 2 ) fail.push( 'motion elastic: ' + crossings + ' overshoots (want an elastic wobble)' );
		}
		// colour names / var() resolve correctly on an element with a CSS transition
		await into( q( 'tl-trans' ), 100 );
		if ( getComputedStyle( q( 'tl-trans' ) ).color !== 'rgb(0, 128, 0)' ) fail.push( 'var() colour with a CSS transition: ' + getComputedStyle( q( 'tl-trans' ) ).color );
		// absolutely positioned target inside a pinned stage measures correctly
		const ab = q( 'tl-abs' ), abT = q( 'tl-abs-t' );
		const top = ab.getBoundingClientRect().top + scrollY;
		scrollTo( { top: top + 500, behavior: 'instant' } ); await wait( 100 );
		window.BricksMotionTimeline.refresh(); await wait( 100 );
		near( tx( abT ).m41, ( 500 - 50 ) / ( 2000 - innerHeight - 50 ) * 1000, 6, 'absolute target in a pinned stage' );
		// a timeline aimed only at children leaves the element's auto reveal alone
		const ac = q( 'auto-child-tl' ); await into( ac, 1500 );
		if ( mode === 'default' && ac.dataset.bmeState !== 'done' ) fail.push( 'auto reveal skipped although the timeline only targets children (' + ac.dataset.bmeState + ')' );
		if ( +getComputedStyle( ac ).opacity < 0.99 ) fail.push( 'auto-child-tl left hidden' );
		// marquee in a column flexbox that used row-gap keeps that spacing between items
		if ( mode === 'default' ) {
			const mg = q( 'mq-rowgap' ); await into( mg, 200 );
			const k = [ ...mg.children ];
			near( k[ 1 ].offsetLeft - ( k[ 0 ].offsetLeft + k[ 0 ].offsetWidth ), 30, 1, 'marquee keeps the row-gap as its spacing' );
		}
		// a node with a timeline inserted by another script (no Bricks event) runs
		const ins = document.createElement( 'div' );
		ins.setAttribute( 'data-bme-tl', JSON.stringify( [ { on: 'view', p: 'opacity', k: [ [ 0, '0.2' ], [ 100, '0.6' ] ], d: 0, o: 0 } ] ) );
		ins.setAttribute( 'data-bme-tl-hide', '' ); ins.textContent = 'inserted timeline';
		document.getElementById( 'c6-insert' ).appendChild( ins ); await into( ins, 500 );
		if ( ins.hasAttribute( 'data-bme-tl-hide' ) ) fail.push( 'inserted timeline left hidden' );
		near( +getComputedStyle( ins ).opacity, 0.6, 0.01, 'inserted timeline played' );
		// a 3D model that fails to load gives the poster back
		const m3 = q( '3d-missing' ); await into( m3, 3000 );
		if ( m3.classList.contains( 'bme-3d-ready' ) || ! m3.classList.contains( 'bme-3d-fallback' ) ) fail.push( '3D model 404: poster not shown (' + m3.className + ')' );
		return fail;
	}, mode );
	res.fail.push( ...c6Fail );
	// QA round 4 regressions (data-case7).
	const c7Fail = await page.evaluate( async ( mode ) => {
		const fail = [];
		const q = ( c ) => document.querySelector( '[data-case7="' + c + '"]' );
		const wait = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
		const tx = ( el ) => new DOMMatrix( getComputedStyle( el ).transform );
		const into = async ( el, ms ) => { el.scrollIntoView( { block: 'center', behavior: 'instant' } ); await wait( ms ); };
		// destroy() takes the same targets as play() / reset(), and never throws
		try { BricksMotion.destroy( '#nope-at-all' ); BricksMotion.destroy( null ); } catch ( e ) { fail.push( 'destroy() threw: ' + e.message ); }
		if ( mode === 'default' ) {
			// a focused link that slid out of the clipped marquee is moved back into view
			const mq = q( 'mq-focus' ); await into( mq, 300 );
			const far = mq.querySelector( '.far' ); far.focus( { preventScroll: true } ); await wait( 100 );
			const box = mq.parentElement.getBoundingClientRect(), r = far.getBoundingClientRect();
			if ( r.left < box.left - 1 || r.right > box.right + 1 ) fail.push( 'focused marquee link outside the visible strip' );
			far.blur(); await wait( 50 );
			if ( mq.style.translate ) fail.push( 'marquee focus shift left behind: ' + mq.style.translate );
			// marquee in a grid that used row-gap keeps that spacing
			const mg = q( 'mq-grid' ); await into( mg, 200 );
			const k = [ ...mg.children ];
			if ( k.length < 2 || Math.abs( k[ 1 ].offsetLeft - ( k[ 0 ].offsetLeft + k[ 0 ].offsetWidth ) - 25 ) > 1 ) fail.push( 'grid marquee spacing: ' + ( k[ 1 ] && k[ 1 ].offsetLeft - ( k[ 0 ].offsetLeft + k[ 0 ].offsetWidth ) ) );
			// the pause button stops loops, marquees and timeline loops, and starts them again
			const lp = q( 'loop-pause' ), tlp = q( 'tl-loop-pause' ), btn = q( 'pause-btn' );
			await into( lp, 400 );
			btn.click(); await wait( 100 );
			const a1 = getComputedStyle( lp ).transform, b1 = getComputedStyle( tlp ).transform; await wait( 400 );
			if ( getComputedStyle( lp ).transform !== a1 ) fail.push( 'loop still moving while paused' );
			if ( getComputedStyle( tlp ).transform !== b1 ) fail.push( 'timeline loop still moving while paused' );
			if ( btn.getAttribute( 'aria-pressed' ) !== 'true' ) fail.push( 'pause button aria-pressed not true' );
			btn.click(); await wait( 400 );
			if ( getComputedStyle( lp ).transform === a1 ) fail.push( 'loop did not resume' );
			if ( getComputedStyle( tlp ).transform === b1 ) fail.push( 'timeline loop did not resume' );
			if ( btn.getAttribute( 'aria-pressed' ) !== 'false' ) fail.push( 'pause button aria-pressed not false' );
		}
		// keyboard focus plays a timeline view row that has not been reached yet
		scrollTo( { top: 0, behavior: 'instant' } ); await wait( 100 );
		const tf = document.createElement( 'div' );
		tf.setAttribute( 'data-bme-tl', JSON.stringify( [ { on: 'view', p: 'opacity', k: [ [ 0, '0' ], [ 100, '1' ] ], d: 0, o: 0 } ] ) );
		tf.innerHTML = '<a href="#f" class="c7-f">focus me</a>';
		q( 'tl-focus' ).after( tf ); await wait( 300 ); // picked up by the timeline's watcher, far below the screen
		if ( +getComputedStyle( tf ).opacity > 0.01 ) fail.push( 'inserted view row not waiting below the screen: ' + getComputedStyle( tf ).opacity );
		tf.querySelector( '.c7-f' ).focus( { preventScroll: true } ); await wait( 200 );
		if ( +getComputedStyle( tf ).opacity < 0.99 ) fail.push( 'focus did not play the timeline view row: ' + getComputedStyle( tf ).opacity );
		// a view row whose start line is below the page end still plays when the end is reached
		scrollTo( { top: document.documentElement.scrollHeight, behavior: 'instant' } ); await wait( 500 );
		if ( +getComputedStyle( q( 'tl-end' ) ).opacity < 0.99 ) fail.push( 'view row at the page end never played' );
		return fail;
	}, mode );
	res.fail.push( ...c7Fail );
	// Timeline rebuild across 992px restores only what it wrote (another script's inline style stays).
	if ( mode === 'default' ) {
		await page.evaluate( () => { const k = document.querySelector( '[data-case4="qa-tl-keep"]' ); k.style.outline = '3px solid red'; } );
		await page.setViewport( { width: 900, height: 800 } ); await new Promise( ( r ) => setTimeout( r, 700 ) );
		const keep = await page.evaluate( () => document.querySelector( '[data-case4="qa-tl-keep"]' ).style.outline );
		await page.setViewport( { width: 1280, height: 800 } ); await new Promise( ( r ) => setTimeout( r, 700 ) );
		if ( ! /red/.test( keep ) ) res.fail.push( 'tl rebuild wiped another script\'s inline style' );
	}
	// Crossing the 992px breakpoint rebuilds timelines: tablet-only rows switch on, and switch off
	// again (inline styles restored) on the way back. A layout change must not cancel the rebuild.
	if ( mode === 'default' ) {
		const gX = () => page.evaluate( () => { const g = document.querySelector( '[data-case3="tl-g"]' ); return { x: new DOMMatrix( getComputedStyle( g ).transform ).m41, style: g.getAttribute( 'style' ) || '' }; } );
		await page.evaluate( () => { const s = document.querySelector( '[data-case3="tl-scroll"]' ); s.scrollIntoView( { block: 'start', behavior: 'instant' } ); } );
		await page.setViewport( { width: 900, height: 800 } ); await new Promise( ( r ) => setTimeout( r, 700 ) );
		const on = await gX();
		await page.setViewport( { width: 1280, height: 800 } ); await new Promise( ( r ) => setTimeout( r, 700 ) );
		const off = await gX();
		if ( ! ( on.x > 0 ) ) res.fail.push( 'tl tablet row did not switch on below 992px (x=' + on.x + ')' );
		if ( off.x !== 0 || /transform/.test( off.style ) ) res.fail.push( 'tl tablet row left styles behind on desktop: ' + off.style );
	}
	const still = Object.entries( moving ).filter( ( [ k, v ] ) => /parallax|scroll-(fade|scale|rotate)|float|pulse|sway|spin|marquee/.test( k ) && v.size < 2 ).map( ( [ k ] ) => k );
	if ( mode === 'default' && still.length ) res.fail.push( 'not moving: ' + still.join( ', ' ) );
	if ( mode === 'reduced' && Object.entries( moving ).some( ( [ k, v ] ) => /float|pulse|sway|spin|marquee/.test( k ) && v.size > 1 ) ) res.fail.push( 'loops move under reduced motion' );
	if ( res.three.length ) res.fail.push( '3D not mounted: ' + res.three.join( ', ' ) );
	if ( playLoopBroken ) res.fail.push( 'audit: BricksMotion.play() stopped a loop' );
	if ( zeroStarts ) res.fail.push( zeroStarts + ' hidden start states use opacity 0 (must be .01 for LCP)' );
	if ( restZeroShown.size ) res.fail.push( 'designed opacity exceeded mid-animation: ' + [ ...restZeroShown ].join( ', ' ) );
	if ( [ 'native', 'gsap', 'anime', 'motion' ].some( ( a ) => ! res.adapters.includes( a ) ) ) res.fail.push( 'adapters registered: ' + res.adapters.join( ',' ) );
	res.fail.push( ...errors.map( ( e ) => 'page error: ' + e ) );
	console.log( `${ mode }: ${ res.fail.length ? 'FAIL' : 'PASS' }` );
	res.fail.forEach( ( f ) => console.log( '  - ' + f ) );
	failed += res.fail.length;
	await page.close();
}

await run( 'default' );
await run( 'reduced' );
await browser.close();
server.close();
process.exit( failed ? 1 : 0 );
