/*!
 * Bricks Motion Studio — GSAP adapter
 * Uses GSAP core + (when loaded) ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin.
 */
( function ( window ) {
	'use strict';

	var BM = window.BricksMotion;
	var gsap = window.gsap;
	if ( ! BM || ! gsap ) {
		return;
	}

	var ST = window.ScrollTrigger;
	var Split = window.SplitText;
	var Scramble = window.ScrambleTextPlugin;
	var Draw = window.DrawSVGPlugin;
	var debug = !! ( BM.config && BM.config.debug );

	// A plugin/core version mismatch must not take the whole adapter down: register one by one.
	[ ST, Split, Scramble, Draw ].forEach( function ( plugin ) {
		if ( plugin ) {
			try {
				gsap.registerPlugin( plugin );
			} catch ( e ) {
				if ( debug ) {
					console.warn( '[Motion Studio] GSAP plugin failed to register', e ); // eslint-disable-line no-console
				}
			}
		}
	} );
	// Global GSAP settings are only ours to change when GSAP is our own bundled copy.
	if ( BM.config && BM.config.ownGsap !== false ) {
		gsap.config( { nullTargetWarn: false } );
		if ( ST ) {
			// Mobile address bar show/hide must not re-trigger layout recalculation mid-scroll.
			ST.config( { ignoreMobileResize: true } );
		}
	}

	var EASE = {
		linear: 'none',
		soft: 'power1.out',
		smooth: 'power3.out',
		strong: 'expo.out',
		'in-out': 'power2.inOut',
		back: 'back.out(1.6)',
		elastic: 'elastic.out(1, 0.45)',
		bounce: 'bounce.out',
		sine: 'sine.inOut',
	};

	var IDENTITY = { xPercent: 0, yPercent: 0, x: 0, y: 0, opacity: 1, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, skewY: 0, filter: 'blur(0px)', clipPath: 'inset(0% 0% 0% 0%)' };

	/** Neutral props → GSAP vars. */
	function vars( p ) {
		var v = {};
		if ( ! p ) {
			return v;
		}
		Object.keys( p ).forEach( function ( k ) {
			var val = p[ k ];
			switch ( k ) {
				case 'x':
				case 'y':
					if ( typeof val === 'string' && /%$/.test( val ) ) {
						v[ k + 'Percent' ] = parseFloat( val );
					} else {
						v[ k ] = val;
					}
					break;
				case 'rotate':
					v.rotation = val;
					break;
				case 'rotateX':
					v.rotationX = val;
					break;
				case 'rotateY':
					v.rotationY = val;
					break;
				case 'perspective':
					v.transformPerspective = val;
					break;
				case 'blur':
					v.filter = 'blur(' + val + 'px)';
					break;
				case 'clip':
					v.clipPath = BM.util.clipCSS( val );
					break;
				default:
					v[ k ] = val;
			}
		} );
		return v;
	}

	/** Make sure every "from" property has a destination (e.g. yPercent → 0). */
	function balance( fromV, toV ) {
		Object.keys( fromV ).forEach( function ( k ) {
			if ( ! ( k in toV ) ) {
				toV[ k ] = k === 'transformPerspective' ? fromV[ k ] : IDENTITY[ k ];
			}
		} );
		if ( 'yPercent' in fromV && toV.y === 0 ) {
			delete toV.y;
		}
		if ( 'xPercent' in fromV && toV.x === 0 ) {
			delete toV.x;
		}
		return toV;
	}

	function staggerOf( s ) {
		if ( typeof s === 'function' ) {
			return function ( i ) {
				return s( i );
			};
		}
		return s || 0;
	}

	function control( tween, onRevert ) {
		var resolve;
		var finished = new Promise( function ( r ) {
			resolve = r;
		} );
		tween.eventCallback( 'onComplete', function () {
			resolve();
		} );
		return {
			_done: function () {
				resolve();
			},
			finished: finished,
			pause: function () {
				tween.pause();
			},
			play: function () {
				tween.play();
			},
			revert: function () {
				if ( tween.scrollTrigger ) {
					tween.scrollTrigger.kill();
				}
				tween.revert();
				if ( onRevert ) {
					onRevert();
				}
				resolve();
			},
		};
	}

	var adapter = {
		tween: function ( targets, from, to, o ) {
			var fromV = vars( from );
			var toV = balance( fromV, vars( to ) );
			toV.duration = o.duration;
			toV.delay = o.delay || 0;
			toV.ease = EASE[ o.ease ] || EASE.smooth;
			toV.stagger = staggerOf( o.stagger );
			toV.overwrite = 'auto';
			if ( o.repeat ) {
				toV.repeat = o.repeat;
				toV.yoyo = !! o.yoyo;
			}
			return control( gsap.fromTo( targets, fromV, toV ) );
		},

		scrub: function ( trigger, targets, from, to, o ) {
			if ( ! ST ) {
				BM.util.log( 'ScrollTrigger missing: scrub preset skipped' );
				return null;
			}
			var fromV = vars( from );
			var toV = balance( fromV, vars( to ) );
			var enter = o.range === 'enter';
			toV.ease = 'none';
			toV.stagger = staggerOf( o.stagger );
			toV.scrollTrigger = {
				trigger: trigger,
				start: 'top bottom',
				// clamp(): elements near the page end still reach their final state.
				end: enter ? 'clamp(top 35%)' : 'bottom top',
				scrub: o.smooth || 0.6,
				invalidateOnRefresh: true,
				markers: debug,
			};
			return control( gsap.fromTo( targets, fromV, toV ) );
		},

		refresh: function () {
			if ( ST ) {
				ST.refresh();
			}
		},

		special: {},
	};

	if ( Split ) {
		adapter.special.split = function ( el, type, mask ) {
			var s = Split.create( el, {
				type: type === 'chars' ? 'words,chars' : type === 'lines' ? 'lines' : 'words',
				mask: mask ? 'lines' : false,
				linesClass: 'bme-line',
				wordsClass: 'bme-word',
				charsClass: 'bme-char',
				aria: 'auto',
			} );
			return {
				native: true,
				pieces: type === 'chars' ? s.chars : type === 'lines' ? s.lines : s.words,
				revert: function () {
					s.revert();
				},
			};
		};
	}

	if ( Scramble ) {
		adapter.special.scramble = function ( el, o ) {
			var text = el.textContent;
			var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
			// Screen readers get the real text while the glyphs shuffle.
			var hadLabel = el.hasAttribute( 'aria-label' );
			if ( ! hadLabel ) {
				el.setAttribute( 'aria-label', text );
			}
			el.textContent = text.replace( /\S/g, function () {
				return glyphs.charAt( Math.floor( Math.random() * glyphs.length ) );
			} );
			// Security: ScrambleTextPlugin writes innerHTML when the target has it, which would turn
			// text such as "&lt;img onerror=…&gt;" (a post title shown as text) back into markup. It
			// animates a plain object instead (textContent only) and every frame is copied as text.
			var proxy = { textContent: el.textContent };
			var tween = gsap.to( proxy, {
				duration: o.duration,
				delay: o.delay || 0,
				ease: 'none',
				scrambleText: { text: text, chars: glyphs, revealDelay: 0.2, speed: 0.6 },
				onUpdate: function () {
					el.textContent = proxy.textContent;
				},
			} );
			var restore = function () {
				el.textContent = text;
				if ( ! hadLabel ) {
					el.removeAttribute( 'aria-label' );
				}
			};
			tween.eventCallback( 'onComplete', null );
			var ctrl = control( tween, restore );
			tween.eventCallback( 'onComplete', function () {
				restore();
				ctrl._done();
			} );
			return ctrl;
		};
	}

	if ( Draw ) {
		adapter.special.draw = function ( el, paths, o ) {
			return control(
				gsap.fromTo(
					paths,
					{ drawSVG: '0%' },
					{ drawSVG: '100%', duration: o.duration, delay: o.delay || 0, ease: EASE[ o.ease ] || EASE[ 'in-out' ], stagger: o.stagger || 0 }
				)
			);
		};
	}

	if ( ST ) {
		/** Pin the element and slide its track (first child, or the "Animate" selector) horizontally. */
		adapter.special[ 'horizontal-scroll' ] = function ( el, c ) {
			var track = null;
			if ( c.scope && c.scope !== 'self' && c.scope !== 'children' ) {
				try {
					track = el.querySelector( c.scope );
				} catch ( e ) {
					track = null;
				}
			}
			track = track || el.firstElementChild;
			if ( ! track ) {
				return null;
			}
			var overflow = el.style.overflow;
			// clip (not hidden): a hidden box can still be scrolled by focus, which would stack
			// with the tween's x and misalign the track.
			el.style.overflow = window.CSS && CSS.supports && CSS.supports( 'overflow', 'clip' ) ? 'clip' : 'hidden';
			var distance = function () {
				return Math.max( 0, track.scrollWidth - el.clientWidth );
			};
			var tween = gsap.to( track, {
				x: function () {
					return -distance();
				},
				ease: 'none',
				scrollTrigger: {
					trigger: el,
					start: 'top top',
					end: function () {
						return '+=' + distance();
					},
					pin: true,
					scrub: 0.8,
					anticipatePin: 1,
					invalidateOnRefresh: true,
					markers: debug,
				},
			} );
			// Keyboard users: tabbing to an off-screen card scrolls the page to where it is in view.
			var onFocus = function ( e ) {
				var st = tween.scrollTrigger;
				if ( ! st || ! track.contains( e.target ) || e.target === track ) {
					return;
				}
				el.scrollLeft = 0;
				var card = e.target;
				while ( card.parentElement && card.parentElement !== track ) {
					card = card.parentElement;
				}
				var d = distance();
				if ( ! d ) {
					return;
				}
				var x = Math.max( 0, Math.min( d, card.offsetLeft - ( el.clientWidth - card.offsetWidth ) / 2 ) );
				window.scrollTo( 0, st.start + ( x / d ) * ( st.end - st.start ) );
			};
			el.addEventListener( 'focusin', onFocus );
			return control( tween, function () {
				el.removeEventListener( 'focusin', onFocus );
				el.style.overflow = overflow;
			} );
		};

		adapter.special.pin = function ( el ) {
			var st = ST.create( { trigger: el, start: 'top top', end: '+=100%', pin: true, markers: debug } );
			return {
				pause: function () {},
				play: function () {},
				revert: function () {
					st.kill( true );
				},
			};
		};
	}

	BM.registerAdapter( 'gsap', adapter );
} )( window );
