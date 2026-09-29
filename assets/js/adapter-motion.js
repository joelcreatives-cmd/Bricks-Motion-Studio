/*!
 * Bricks Motion Studio — Motion (motion.dev) adapter
 * Motion runs transforms/opacity/filter/clip-path through the Web Animations API where possible.
 */
( function ( window ) {
	'use strict';

	var BM = window.BricksMotion;
	var M = window.Motion;
	if ( ! BM || ! M || typeof M.animate !== 'function' ) {
		return;
	}

	var EASE = {
		linear: 'linear',
		soft: 'easeOut',
		smooth: [ 0.215, 0.61, 0.355, 1 ],
		strong: [ 0.16, 1, 0.3, 1 ],
		'in-out': 'easeInOut',
		back: 'backOut',
		elastic: 'backOut',
		bounce: 'backOut',
		sine: [ 0.37, 0, 0.63, 1 ],
	};

	/** Neutral from/to → Motion keyframes. */
	function keyframes( from, to ) {
		var k = {};
		Object.keys( from ).forEach( function ( key ) {
			var a = from[ key ];
			var b = key in to ? to[ key ] : a;
			switch ( key ) {
				case 'blur':
					k.filter = [ 'blur(' + a + 'px)', 'blur(' + b + 'px)' ];
					break;
				case 'clip':
					k.clipPath = [ BM.util.clipCSS( a ), BM.util.clipCSS( b ) ];
					break;
				case 'perspective':
					k.transformPerspective = [ a, b ];
					break;
				default:
					k[ key ] = [ a, b ];
			}
		} );
		return k;
	}

	function delayOf( o ) {
		var base = o.delay || 0;
		if ( typeof o.stagger === 'function' ) {
			return function ( i ) {
				return base + o.stagger( i );
			};
		}
		if ( o.stagger ) {
			return M.stagger( o.stagger, { startDelay: base } );
		}
		return base;
	}

	function control( anim, cancelScroll ) {
		var resolve;
		var finished = new Promise( function ( r ) {
			resolve = r;
		} );
		// Motion commits WAAPI end values (opacity, filter, clip-path) inline right after
		// `finished` settles; report completion a beat later so the runtime's cleanup runs last.
		var settled = false;
		var later = function () {
			settled = true;
			setTimeout( resolve, 50 );
		};
		if ( anim && anim.finished ) {
			anim.finished.then( later, later );
		} else if ( anim && typeof anim.then === 'function' ) {
			anim.then( later, later );
		}
		return {
			finished: finished,
			pause: function () {
				if ( anim && anim.pause ) {
					anim.pause();
				}
			},
			play: function () {
				if ( anim && anim.play ) {
					anim.play();
				}
			},
			revert: function () {
				if ( cancelScroll ) {
					cancelScroll();
				}
				// cancel() on a finished animation re-renders the end keyframe a frame later, after
				// the runtime restored the author's inline styles, so only stop running ones.
				if ( ! settled ) {
					if ( anim && anim.cancel ) {
						anim.cancel();
					} else if ( anim && anim.stop ) {
						anim.stop();
					}
				}
				resolve();
			},
		};
	}

	BM.registerAdapter( 'motion', {
		tween: function ( targets, from, to, o ) {
			var opts = {
				duration: Math.max( 0.001, o.duration ),
				delay: delayOf( o ),
				ease: EASE[ o.ease ] || EASE.smooth,
			};
			if ( o.repeat ) {
				opts.repeat = Infinity;
				opts.repeatType = o.yoyo ? 'reverse' : 'loop';
			}
			return control( M.animate( targets, keyframes( from, to ), opts ) );
		},

		scrub: function ( trigger, targets, from, to, o ) {
			if ( typeof M.scroll !== 'function' ) {
				return null;
			}
			var opts = { ease: 'linear', duration: 1 };
			if ( o.stagger ) {
				opts.delay = M.stagger( o.stagger );
			}
			var anim = M.animate( targets, keyframes( from, to ), opts );
			var cancel = M.scroll( anim, {
				target: trigger,
				offset: o.range === 'enter' ? [ 'start end', 'start 0.35' ] : [ 'start end', 'end start' ],
			} );
			return control( anim, cancel );
		},

		special: {},
	} );
} )( window );
