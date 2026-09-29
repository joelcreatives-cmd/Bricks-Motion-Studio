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
		const three = [ ...document.querySelectorAll( '[data-bme-3d]' ) ].filter( ( e ) => ! e.classList.contains( 'bme-3d-ready' ) ).map( ( e ) => e.dataset.case );
		return { fail, three, adapters: Object.keys( BricksMotion.adapters ) };
	}, mode );
	const still = Object.entries( moving ).filter( ( [ k, v ] ) => /parallax|scroll-(fade|scale|rotate)|float|pulse|sway|spin/.test( k ) && v.size < 2 ).map( ( [ k ] ) => k );
	if ( mode === 'default' && still.length ) res.fail.push( 'not moving: ' + still.join( ', ' ) );
	if ( mode === 'reduced' && Object.entries( moving ).some( ( [ k, v ] ) => /float|pulse|sway|spin/.test( k ) && v.size > 1 ) ) res.fail.push( 'loops move under reduced motion' );
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
