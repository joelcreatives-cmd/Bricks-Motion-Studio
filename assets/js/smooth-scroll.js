/*!
 * Bricks Motion Studio — Lenis smooth scroll
 *
 * - Synced to GSAP's ticker + ScrollTrigger when GSAP is on the page (one rAF loop).
 * - Stops while Bricks locks body scroll (popups / off-canvas add body.no-scroll).
 * - Never hijacks scrolling inside popups, off-canvas, dropdowns or [data-lenis-prevent].
 * - Disabled for visitors who prefer reduced motion.
 */
( function ( window, document ) {
	'use strict';

	var BM = window.BricksMotion;
	var Lenis = window.Lenis;
	var cfg = ( window.BME_CONFIG || {} ).lenis;

	if ( ! BM || ! Lenis || ! cfg ) {
		return;
	}
	if ( window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) {
		return;
	}

	var gsap = window.gsap;
	var ST = window.ScrollTrigger;
	var html = document.documentElement;

	// The theme or another plugin already runs smooth scrolling: two instances double the wheel.
	if ( ( BM.foreign && BM.foreign.lenis ) || html.classList.contains( 'lenis' ) ) {
		return;
	}

	// Native smooth scrolling (e.g. Bricks "Smooth scroll" setting) fights Lenis.
	html.style.scrollBehavior = 'auto';

	var lenis = new Lenis( {
		lerp: cfg.lerp || 0.1,
		wheelMultiplier: cfg.wheel || 1,
		syncTouch: !! cfg.touch,
		anchors: cfg.anchors ? { offset: anchorOffset() } : false,
		autoRaf: ! gsap,
		allowNestedScroll: true,
		prevent: function ( node ) {
			return !! ( node && node.closest && node.closest( '.brx-popup, .brxe-offcanvas, .brx-offcanvas-inner, .brx-dropdown-content, [data-lenis-prevent], .bricks-lightbox, .pswp' ) );
		},
	} );

	/** Offset anchors by the sticky header height, if any. */
	function anchorOffset() {
		var header = document.querySelector( '#brx-header.brx-sticky' );
		return header ? -header.offsetHeight : 0;
	}

	if ( gsap ) {
		if ( ST ) {
			lenis.on( 'scroll', ST.update );
		}
		gsap.ticker.add( function ( time ) {
			lenis.raf( time * 1000 );
		} );
		if ( ! BM.config || BM.config.ownGsap !== false ) {
			gsap.ticker.lagSmoothing( 0 );
		}
	}

	// Pause while Bricks locks the page (popups, off-canvas, mobile menu).
	// Only undo stops we made ourselves, so a lenis.stop() from custom code is respected.
	var stoppedByUs = false;
	function syncLockAll() {
		// Popups add body.no-scroll; off-canvas fires no events, its open state is .brx-open.
		var locked = document.body.classList.contains( 'no-scroll' ) || !! document.querySelector( '.brxe-offcanvas.brx-open' );
		if ( locked && ! stoppedByUs && ! lenis.isStopped ) {
			lenis.stop();
			stoppedByUs = true;
		} else if ( ! locked && stoppedByUs ) {
			lenis.start();
			stoppedByUs = false;
		}
	}
	if ( window.MutationObserver ) {
		new MutationObserver( syncLockAll ).observe( document.body, { attributes: true, attributeFilter: [ 'class' ], subtree: true } );
	}
	syncLockAll();

	BM.on( 'bme:reduced', function () {
		lenis.destroy();
	} );

	// Content height changes (AJAX loops, accordions) → recalculate limits.
	BM.on( 'bme:refresh', function () {
		lenis.resize();
	} );

	BM.lenis = lenis;
	window.dispatchEvent( new CustomEvent( 'bme:lenis', { detail: { lenis: lenis } } ) );
} )( window, document );
