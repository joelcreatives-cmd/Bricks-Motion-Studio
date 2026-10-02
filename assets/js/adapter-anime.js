/*!
 * Bricks Motion Studio — Anime.js v4 adapter
 */
( function ( window ) {
	'use strict';

	var BM = window.BricksMotion;
	var anime = window.anime;
	if ( ! BM || ! anime || typeof anime.animate !== 'function' ) {
		return;
	}
	// A theme/plugin already had its own window.anime (often v3, called as anime({...})):
	// keep ours private and give the global back.
	var prev = BM.foreign && BM.foreign.anime;
	if ( prev && prev !== anime ) {
		window.anime = prev;
	}

	var EASE = {
		linear: 'linear',
		soft: 'outQuad',
		smooth: 'outCubic',
		strong: 'outExpo',
		'in-out': 'inOutQuad',
		back: 'outBack(1.6)',
		elastic: 'outElastic(1, .45)',
		bounce: 'outBounce',
		sine: 'inOutSine',
	};

	/** Neutral from/to → Anime.js [from, to] tween values. */
	function params( from, to ) {
		var p = {};
		Object.keys( from ).forEach( function ( k ) {
			var a = from[ k ];
			var b = k in to ? to[ k ] : a;
			switch ( k ) {
				case 'blur':
					p.filter = [ 'blur(' + a + 'px)', 'blur(' + b + 'px)' ];
					break;
				case 'clip':
					p.clipPath = [ BM.util.clipCSS( a ), BM.util.clipCSS( b ) ];
					break;
				case 'perspective':
					p.perspective = [ a + 'px', b + 'px' ];
					break;
				case 'x':
				case 'y':
					p[ k ] = [ typeof a === 'number' ? a + 'px' : a, typeof b === 'number' ? b + 'px' : b ];
					break;
				case 'rotate':
				case 'rotateX':
				case 'rotateY':
				case 'skewY':
					p[ k ] = [ a + 'deg', b + 'deg' ];
					break;
				default:
					p[ k ] = [ a, b ];
			}
		} );
		return p;
	}

	function delayOf( o ) {
		var base = ( o.delay || 0 ) * 1000;
		if ( typeof o.stagger === 'function' ) {
			return function ( el, i ) {
				return base + o.stagger( i ) * 1000;
			};
		}
		if ( o.stagger ) {
			return anime.stagger( o.stagger * 1000, { start: base } );
		}
		return base;
	}

	function control( anim ) {
		var resolve;
		var finished = new Promise( function ( r ) {
			resolve = r;
		} );
		anim.then( function () {
			resolve();
		} );
		return {
			finished: finished,
			pause: function () {
				anim.pause();
			},
			play: function () {
				anim.play();
			},
			revert: function () {
				anim.revert();
				resolve();
			},
		};
	}


	// "Enter" scroll ranges end when the element's top reaches 35% of the screen. Near the page
	// end that line may never be reached: end where the page can actually scroll to instead
	// (the GSAP adapter does the same with clamp()).
	function enterEnd( trigger ) {
		var doc = document.scrollingElement || document.documentElement;
		var vh = window.innerHeight || doc.clientHeight;
		var top = trigger.getBoundingClientRect().top + ( window.scrollY || 0 );
		var maxScroll = Math.max( 0, doc.scrollHeight - vh );
		return Math.min( 1, Math.max( 0.35, ( top - maxScroll ) / vh ) );
	}

	BM.registerAdapter( 'anime', {
		tween: function ( targets, from, to, o ) {
			var p = params( from, to );
			p.duration = Math.max( 1, o.duration * 1000 );
			p.delay = delayOf( o );
			// Only known names: Anime.js throws on some foreign ease strings (e.g. "easeOutBack").
			p.ease = EASE[ o.ease ] || EASE.smooth;
			if ( o.repeat ) {
				p.loop = true;
				p.alternate = !! o.yoyo;
			}
			return control( anime.animate( targets, p ) );
		},

		scrub: function ( trigger, targets, from, to, o ) {
			if ( typeof anime.onScroll !== 'function' ) {
				return null;
			}
			var p = params( from, to );
			p.ease = 'linear';
			p.duration = 1000;
			if ( o.stagger ) {
				p.delay = anime.stagger( o.stagger * 1000 );
			}
			p.autoplay = anime.onScroll( {
				target: trigger,
				// Anime.js thresholds are "containerEdge targetEdge".
				enter: 'end start',
				leave: o.range === 'enter' ? Math.round( enterEnd( trigger ) * 100 ) + '% start' : 'start end',
				sync: 0.4,
			} );
			return control( anime.animate( targets, p ) );
		},

		refresh: function () {
			if ( anime.engine && typeof anime.engine.update === 'function' ) {
				try {
					anime.engine.update();
				} catch ( e ) {
					/* noop */
				}
			}
		},

		special: {},
	} );
} )( window );
