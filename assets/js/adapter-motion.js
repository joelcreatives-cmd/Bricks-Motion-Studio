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


	// Motion measures the trigger with offsetTop, which leaves out a margin on <html> (WordPress
	// adds 32 / 46px for the admin bar): its scroll ranges would run that much early. Shift the
	// trigger edges back by it, in pixels (Motion has no "end + px", so the full range's end edge
	// is the trigger's layout height plus the shift).
	function htmlShift() {
		var r = document.documentElement.getBoundingClientRect();
		return Math.round( r.top + ( window.scrollY || 0 ) );
	}
	function scrubOffset( trigger, o, end, shift ) {
		if ( ! shift ) {
			return o.range === 'enter' ? [ 'start end', 'start ' + end ] : [ 'start end', 'end start' ];
		}
		var h = typeof trigger.offsetHeight === 'number' ? trigger.offsetHeight : trigger.getBoundingClientRect().height;
		return o.range === 'enter' ? [ shift + 'px end', shift + 'px ' + end ] : [ shift + 'px end', h + shift + 'px start' ];
	}
	// What the scroll range depends on: when it changes (the page got shorter or longer, the
	// admin bar changed height, the trigger was resized), refresh() builds the scrub again.
	function scrubKey( trigger, o ) {
		var shift = htmlShift();
		return [ o.range === 'enter' ? +enterEnd( trigger ).toFixed( 2 ) : 0, shift, shift ? trigger.offsetHeight : 0 ].join( '|' );
	}
	var liveScrubs = [];
	function liveScrub( trigger, o, make ) {
		var entry = { trigger: trigger, o: o, key: scrubKey( trigger, o ), make: make, cur: make(), dead: false };
		if ( o.range !== 'enter' && entry.key === '0|0|0' ) {
			return entry.cur; // nothing that can move: Motion keeps it up to date by itself
		}
		liveScrubs.push( entry );
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
	function refreshScrubs() {
		liveScrubs = liveScrubs.filter( function ( e ) {
			return ! e.dead && e.trigger.isConnected;
		} );
		liveScrubs.forEach( function ( e ) {
			var key = scrubKey( e.trigger, e.o );
			if ( key !== e.key ) {
				e.key = key;
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
					offset: scrubOffset( trigger, o, +enterEnd( trigger ).toFixed( 3 ), htmlShift() ),
				} );
				return control( anim, cancel );
			} );
		},

		refresh: refreshScrubs,

		special: {},
	} );
} )( window );
