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
	// A theme/plugin loaded its own Motion first: keep ours private and give the global back.
	var prev = BM.foreign && BM.foreign.motion;
	if ( prev && prev !== M ) {
		window.Motion = prev;
	}

	var EASE = {
		linear: 'linear',
		soft: 'easeOut',
		smooth: [ 0.215, 0.61, 0.355, 1 ],
		strong: [ 0.16, 1, 0.3, 1 ],
		'in-out': 'easeInOut',
		back: 'backOut',
		elastic: BM.util.ease.elastic,
		bounce: BM.util.ease.bounce,
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


	// "Enter" scroll ranges end when the element's top reaches 35% of the screen. Near the page
	// end that line may never be reached: end where the page can actually scroll to instead
	// (the GSAP adapter does the same with clamp()).
	function enterEnd( trigger ) {
		var doc = document.scrollingElement || document.documentElement;
		var vh = window.innerHeight || doc.clientHeight;
		// Layout position, without the animation's own movement: the same value every time it is
		// measured, so refresh() only rebuilds when the page really changed.
		var top = 0;
		if ( typeof trigger.offsetTop === 'number' ) {
			for ( var n = trigger; n; n = n.offsetParent ) {
				top += n.offsetTop;
			}
		} else {
			top = trigger.getBoundingClientRect().top + ( window.scrollY || 0 ); // SVG elements have no offsetTop
		}
		var maxScroll = Math.max( 0, doc.scrollHeight - vh );
		return Math.min( 1, Math.max( 0.35, ( top - maxScroll ) / vh ) );
	}


	// "Enter" ranges end where the page can scroll to (enterEnd): when the page gets shorter or
	// longer later (filters, accordions, lazy content), refresh() builds those scrubs again.
	var enterScrubs = [];
	function liveScrub( trigger, o, make ) {
		var entry = { trigger: trigger, end: enterEnd( trigger ), make: make, cur: make(), dead: false };
		if ( o.range !== 'enter' ) {
			return entry.cur;
		}
		enterScrubs.push( entry );
		return {
			finished: entry.cur.finished,
			pause: function () {
				entry.cur.pause();
			},
			play: function () {
				entry.cur.play();
			},
			revert: function () {
				entry.dead = true;
				entry.cur.revert();
			},
		};
	}
	function refreshEnterScrubs() {
		enterScrubs = enterScrubs.filter( function ( e ) {
			return ! e.dead && e.trigger.isConnected;
		} );
		enterScrubs.forEach( function ( e ) {
			var end = enterEnd( e.trigger );
			if ( Math.abs( end - e.end ) > 0.01 ) {
				e.end = end;
				e.cur.revert();
				e.cur = e.make();
			}
		} );
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
			return liveScrub( trigger, o, function () {
				var opts = { ease: 'linear', duration: 1 };
				if ( o.stagger ) {
					opts.delay = M.stagger( o.stagger );
				}
				var anim = M.animate( targets, keyframes( from, to ), opts );
				var cancel = M.scroll( anim, {
					target: trigger,
					offset: o.range === 'enter' ? [ 'start end', 'start ' + +enterEnd( trigger ).toFixed( 3 ) ] : [ 'start end', 'end start' ],
				} );
				return control( anim, cancel );
			} );
		},

		refresh: refreshEnterScrubs,

		special: {},
	} );
} )( window );
