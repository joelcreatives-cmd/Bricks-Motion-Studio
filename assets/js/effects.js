/**
 * Bricks Motion Studio — site-wide effects: custom cursor and scroll progress variables.
 *
 * window.BME_FX: { cursor: '' | 'dot' | 'ring' | 'both', color, hide, pageProgress }
 *
 * Cursor: only with a real mouse (hover + fine pointer). The dot follows the pointer exactly;
 * the ring trails it and grows over links, buttons and anything with data-bme-cursor (whose
 * text it shows: "View"). Reduced motion: no trailing. Hidden over iframes and when the pointer
 * leaves the window. Never in the way: pointer-events none, aria-hidden.
 *
 * Progress: --bme-page-progress on <html> (0 at the top, 1 at the bottom of the page) and
 * --bme-progress on [data-bme-progress] elements (0 when the element's top reaches the bottom of
 * the screen, 1 when its bottom leaves the top). Written once per frame, only for elements on
 * screen.
 */
( function ( w, d ) {
	'use strict';

	var fx = w.BME_FX || {};
	var html = d.documentElement;
	var reduce = w.matchMedia ? w.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };

	/* ---------- scroll progress ------------------------------------------------ */

	var tracked = [];
	var visible = new Set();
	var frame = 0;

	function clamp01( v ) {
		return v < 0 ? 0 : v > 1 ? 1 : v;
	}

	function writeProgress() {
		frame = 0;
		var vh = w.innerHeight || html.clientHeight;
		if ( fx.pageProgress ) {
			var max = Math.max( 1, html.scrollHeight - vh );
			html.style.setProperty( '--bme-page-progress', clamp01( ( w.scrollY || html.scrollTop ) / max ).toFixed( 4 ) );
		}
		visible.forEach( function ( el ) {
			var r = el.getBoundingClientRect();
			el.style.setProperty( '--bme-progress', clamp01( ( vh - r.top ) / ( vh + r.height ) ).toFixed( 4 ) );
		} );
	}

	function requestProgress() {
		if ( ! frame ) {
			frame = w.requestAnimationFrame( writeProgress );
		}
	}

	var io = 'IntersectionObserver' in w ? new w.IntersectionObserver( function ( entries ) {
		entries.forEach( function ( e ) {
			if ( e.isIntersecting ) {
				visible.add( e.target );
			} else {
				visible.delete( e.target );
				// Off screen: settle on the end it left by.
				e.target.style.setProperty( '--bme-progress', e.boundingClientRect.top < 0 ? '1' : '0' );
			}
		} );
		requestProgress();
	} ) : null;

	function watchProgress( root ) {
		Array.prototype.forEach.call( ( root || d ).querySelectorAll( '[data-bme-progress]' ), function ( el ) {
			if ( tracked.indexOf( el ) !== -1 ) {
				return;
			}
			tracked.push( el );
			el.style.setProperty( '--bme-progress', '0' );
			if ( io ) {
				io.observe( el );
			} else {
				visible.add( el );
			}
		} );
	}

	function startProgress() {
		watchProgress( d );
		if ( fx.pageProgress || tracked.length ) {
			w.addEventListener( 'scroll', requestProgress, { passive: true } );
			w.addEventListener( 'resize', requestProgress );
			requestProgress();
		}
		// Content added later (load more, filters, popups).
		[ 'bricks/ajax/nodes_added', 'bricks/ajax/query_result/displayed', 'bricks/ajax/popup/loaded' ].forEach( function ( evt ) {
			d.addEventListener( evt, function () {
				var before = tracked.length;
				watchProgress( d );
				if ( tracked.length && ! before && ! fx.pageProgress ) {
					w.addEventListener( 'scroll', requestProgress, { passive: true } );
					w.addEventListener( 'resize', requestProgress );
				}
				requestProgress();
			} );
		} );
	}

	/* ---------- cursor --------------------------------------------------------- */

	var INTERACTIVE = 'a[href], button, [role="button"], input[type="submit"], input[type="button"], label[for], select, summary, [data-bme-cursor]';
	var TEXT_INPUT = 'input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';

	function startCursor() {
		var kind = fx.cursor;
		if ( ! kind || ! w.matchMedia || ! w.matchMedia( '(hover: hover) and (pointer: fine)' ).matches ) {
			return;
		}
		var color = fx.color || '';
		var style = d.createElement( 'style' );
		style.id = 'bme-cursor-css';
		style.textContent =
			'.bme-cursor,.bme-cursor-ring{position:fixed;left:0;top:0;z-index:2147483600;pointer-events:none;border-radius:50%;opacity:0;transition:opacity .2s;will-change:transform}' +
			'.bme-cursor{width:8px;height:8px;margin:-4px 0 0 -4px;background:' + ( color || '#fff' ) + '}' +
			'.bme-cursor-ring{width:36px;height:36px;margin:-18px 0 0 -18px;border:1.5px solid ' + ( color || '#fff' ) + ';display:grid;place-items:center;transition:opacity .2s,width .25s cubic-bezier(.2,.7,.2,1),height .25s cubic-bezier(.2,.7,.2,1),margin .25s cubic-bezier(.2,.7,.2,1),background-color .25s}' +
			( color ? '' : '.bme-cursor,.bme-cursor-ring{mix-blend-mode:difference}' ) +
			'.bme-cursor-ring span{font:600 11px/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:' + ( color ? '#fff' : '#000' ) + ';opacity:0;transition:opacity .2s}' +
			'html.bme-cursor-on .bme-cursor,html.bme-cursor-on .bme-cursor-ring{opacity:1}' +
			'html.bme-cursor-hover .bme-cursor-ring{width:56px;height:56px;margin:-28px 0 0 -28px}' +
			'html.bme-cursor-label .bme-cursor-ring{width:76px;height:76px;margin:-38px 0 0 -38px;background:' + ( color || '#fff' ) + '}' +
			'html.bme-cursor-label .bme-cursor-ring span{opacity:1}html.bme-cursor-label .bme-cursor{opacity:0}' +
			'html.bme-cursor-text .bme-cursor,html.bme-cursor-text .bme-cursor-ring{opacity:0}' +
			( fx.hide ? 'html.bme-cursor-on,html.bme-cursor-on *{cursor:none!important}html.bme-cursor-on :is(' + TEXT_INPUT + '){cursor:text!important}' : '' ) +
			'@media print{.bme-cursor,.bme-cursor-ring{display:none}}';
		d.head.appendChild( style );

		var dot = null;
		var ring = null;
		var label = null;
		if ( kind === 'dot' || kind === 'both' ) {
			dot = d.createElement( 'div' );
			dot.className = 'bme-cursor';
			dot.setAttribute( 'aria-hidden', 'true' );
			d.body.appendChild( dot );
		}
		if ( kind === 'ring' || kind === 'both' ) {
			ring = d.createElement( 'div' );
			ring.className = 'bme-cursor-ring';
			ring.setAttribute( 'aria-hidden', 'true' );
			label = d.createElement( 'span' );
			ring.appendChild( label );
			d.body.appendChild( ring );
		}

		var x = -100;
		var y = -100;
		var rx = -100;
		var ry = -100;
		var raf = 0;
		var place = function () {
			raf = 0;
			if ( dot ) {
				dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
			}
			if ( ring ) {
				// Trails the pointer (none for reduced motion).
				var k = reduce.matches ? 1 : 0.22;
				rx += ( x - rx ) * k;
				ry += ( y - ry ) * k;
				ring.style.transform = 'translate3d(' + rx.toFixed( 2 ) + 'px,' + ry.toFixed( 2 ) + 'px,0)';
				if ( Math.abs( x - rx ) > 0.1 || Math.abs( y - ry ) > 0.1 ) {
					raf = w.requestAnimationFrame( place );
				}
			}
		};
		var schedule = function () {
			if ( ! raf ) {
				raf = w.requestAnimationFrame( place );
			}
		};
		var lastTarget = null;
		var setState = function ( target ) {
			if ( target === lastTarget ) {
				return;
			}
			lastTarget = target;
			var el = target && target.closest ? target : null;
			var labelled = el && el.closest( '[data-bme-cursor]' );
			var text = labelled ? labelled.getAttribute( 'data-bme-cursor' ) : '';
			html.classList.toggle( 'bme-cursor-text', !! ( el && el.closest( TEXT_INPUT ) ) );
			html.classList.toggle( 'bme-cursor-label', !! ( ring && text ) );
			html.classList.toggle( 'bme-cursor-hover', !! ( el && el.closest( INTERACTIVE ) ) );
			if ( label ) {
				label.textContent = text || '';
			}
		};

		d.addEventListener( 'pointermove', function ( e ) {
			if ( e.pointerType && e.pointerType !== 'mouse' ) {
				return;
			}
			x = e.clientX;
			y = e.clientY;
			if ( ! html.classList.contains( 'bme-cursor-on' ) ) {
				// First move: start where the pointer is (no slide in from the corner).
				rx = x;
				ry = y;
				html.classList.add( 'bme-cursor-on' );
			}
			setState( e.target );
			schedule();
		}, { passive: true } );
		d.addEventListener( 'pointerdown', function ( e ) {
			if ( e.pointerType && e.pointerType !== 'mouse' ) {
				// Touch on a hybrid device: hand back to the system pointer.
				html.classList.remove( 'bme-cursor-on' );
			}
		}, { passive: true } );
		// Out of the window or over an iframe (its own document gets the pointer): hide.
		d.addEventListener( 'mouseout', function ( e ) {
			if ( ! e.relatedTarget || e.relatedTarget.nodeName === 'IFRAME' ) {
				html.classList.remove( 'bme-cursor-on' );
			}
		} );
		w.addEventListener( 'blur', function () {
			html.classList.remove( 'bme-cursor-on' );
		} );
	}

	function start() {
		startProgress();
		startCursor();
	}

	if ( d.readyState === 'loading' ) {
		d.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
}( window, document ) );
