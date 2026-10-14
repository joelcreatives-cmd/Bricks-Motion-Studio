/**
 * Bricks Motion Studio — Lottie element player.
 *
 * Every .bme-lottie[data-bme-lottie] gets the light SVG Lottie player (window.lottie):
 *   { src, trigger: autoplay | view | hover | click | scroll, loop, speed, still: first | last, static }
 * - autoplay: plays when loaded (loops pause while off screen)
 * - view: plays once (or loops) when a third of it is on screen
 * - hover: plays forward on pointer enter / focus, back on leave
 * - click: a toggle button (Enter / Space too), aria-pressed follows
 * - scroll: frame = its trip through the screen (top at the bottom → bottom at the top)
 * Reduced motion and "static" (Motion Studio off here): the still frame, no playback.
 * Pause animations (the button or BricksMotion.pauseAll): loops stop until resumed.
 */
( function ( w, d ) {
	'use strict';

	var reduce = w.matchMedia ? w.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };
	var players = [];
	var paused = false;
	try {
		paused = !! w.sessionStorage.getItem( 'bme-paused' );
	} catch ( e ) {
		/* storage blocked */
	}

	function config( el ) {
		try {
			var c = JSON.parse( el.getAttribute( 'data-bme-lottie' ) || '{}' );
			return c && typeof c === 'object' ? c : {};
		} catch ( e ) {
			return {};
		}
	}

	function still( p ) {
		var a = p.anim;
		if ( ! a || ! a.totalFrames ) {
			return;
		}
		a.goToAndStop( p.c.still === 'last' ? a.totalFrames - 1 : 0, true );
	}

	function canMove( p ) {
		return ! p.c.static && ! reduce.matches;
	}

	function fitBox( p ) {
		// The animation's own proportions, unless the element has a height of its own.
		var a = p.anim;
		var el = p.el;
		if ( a && a.animationData && a.animationData.w && a.animationData.h && ! el.style.height ) {
			var cs = w.getComputedStyle( el );
			if ( ( cs.height === '0px' || el.offsetHeight < 2 ) && cs.aspectRatio === 'auto' ) {
				el.style.aspectRatio = a.animationData.w + ' / ' + a.animationData.h;
			}
		}
	}

	function scrollFrame( p ) {
		var r = p.el.getBoundingClientRect();
		var vh = w.innerHeight || d.documentElement.clientHeight;
		var t = Math.min( 1, Math.max( 0, ( vh - r.top ) / ( vh + r.height ) ) );
		p.anim.goToAndStop( t * ( p.anim.totalFrames - 1 ), true );
	}

	var scrollers = [];
	var raf = 0;
	function onScroll() {
		if ( raf ) {
			return;
		}
		raf = w.requestAnimationFrame( function () {
			raf = 0;
			scrollers.forEach( function ( p ) {
				if ( p.visible ) {
					scrollFrame( p );
				}
			} );
		} );
	}

	var io = 'IntersectionObserver' in w ? new w.IntersectionObserver( function ( entries ) {
		entries.forEach( function ( e ) {
			var p = e.target.__bmeLottie;
			if ( ! p ) {
				return;
			}
			p.visible = e.isIntersecting;
			if ( ! canMove( p ) || ! p.ready ) {
				return;
			}
			var c = p.c;
			if ( c.trigger === 'scroll' ) {
				if ( p.visible ) {
					scrollFrame( p );
				}
			} else if ( c.trigger === 'view' ) {
				if ( p.visible && e.intersectionRatio >= 0.3 && ! p.played ) {
					p.played = true;
					if ( ! paused ) {
						p.anim.play();
					}
				} else if ( ! p.visible && c.loop && p.played ) {
					p.anim.pause(); // a looping one rests off screen
				} else if ( p.visible && c.loop && p.played && ! paused ) {
					p.anim.play();
				}
			} else if ( c.trigger === 'autoplay' ) {
				if ( p.visible && ! paused ) {
					p.anim.play();
				} else {
					p.anim.pause();
				}
			}
		} );
	}, { threshold: [ 0, 0.3 ] } ) : null;

	function bind( p ) {
		var el = p.el;
		var c = p.c;
		var a = p.anim;
		a.setSpeed( c.speed > 0 ? c.speed : 1 );
		if ( ! canMove( p ) ) {
			still( p );
			return;
		}
		if ( c.trigger === 'hover' ) {
			var fwd = function () {
				a.setDirection( 1 );
				a.play();
			};
			var back = function () {
				a.setDirection( -1 );
				a.play();
			};
			el.addEventListener( 'pointerenter', fwd );
			el.addEventListener( 'pointerleave', back );
			el.addEventListener( 'focusin', fwd );
			el.addEventListener( 'focusout', back );
		} else if ( c.trigger === 'click' ) {
			var toggle = function () {
				if ( a.isPaused ) {
					if ( a.currentFrame >= a.totalFrames - 1 && ! c.loop ) {
						a.goToAndStop( 0, true );
					}
					a.play();
				} else {
					a.pause();
				}
				el.setAttribute( 'aria-pressed', a.isPaused ? 'false' : 'true' );
			};
			el.addEventListener( 'click', toggle );
			el.addEventListener( 'keydown', function ( e ) {
				if ( e.key === 'Enter' || e.key === ' ' ) {
					e.preventDefault();
					toggle();
				}
			} );
			a.addEventListener( 'complete', function () {
				el.setAttribute( 'aria-pressed', 'false' );
			} );
		} else if ( c.trigger === 'scroll' ) {
			scrollers.push( p );
			if ( scrollers.length === 1 ) {
				w.addEventListener( 'scroll', onScroll, { passive: true } );
				w.addEventListener( 'resize', onScroll );
			}
			scrollFrame( p );
		}
		if ( io ) {
			io.observe( el );
		} else if ( c.trigger === 'autoplay' || c.trigger === 'view' ) {
			a.play();
		}
	}

	function mount( el ) {
		if ( el.__bmeLottie || ! w.lottie || ! w.lottie.loadAnimation ) {
			return;
		}
		var c = config( el );
		if ( ! c.src ) {
			return;
		}
		var p = { el: el, c: c, anim: null, ready: false, visible: false, played: false };
		el.__bmeLottie = p;
		try {
			p.anim = w.lottie.loadAnimation( {
				container: el,
				renderer: 'svg',
				loop: !! c.loop,
				autoplay: false,
				path: c.src,
				rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
			} );
		} catch ( e ) {
			el.classList.add( 'bme-lottie-failed' );
			return;
		}
		players.push( p );
		p.anim.addEventListener( 'DOMLoaded', function () {
			p.ready = true;
			fitBox( p );
			bind( p );
			el.classList.add( 'bme-lottie-ready' );
		} );
		p.anim.addEventListener( 'data_failed', function () {
			el.classList.add( 'bme-lottie-failed' );
		} );
	}

	// Players whose element left the page (the builder re-renders an element on every change):
	// stop them and let them go.
	function prune() {
		for ( var i = players.length - 1; i >= 0; i-- ) {
			var p = players[ i ];
			if ( ! p.el.isConnected ) {
				try {
					p.anim.destroy();
				} catch ( e ) {
					/* already gone */
				}
				if ( io ) {
					io.unobserve( p.el );
				}
				var k = scrollers.indexOf( p );
				if ( k !== -1 ) {
					scrollers.splice( k, 1 );
				}
				players.splice( i, 1 );
			}
		}
	}

	function scan( root ) {
		prune();
		Array.prototype.forEach.call( ( root || d ).querySelectorAll( '.bme-lottie[data-bme-lottie]' ), mount );
	}

	// Pause animations (WCAG 2.2.2): loops and running animations stop until resumed.
	function setPaused( on ) {
		paused = on;
		players.forEach( function ( p ) {
			if ( ! p.ready || ! canMove( p ) || p.c.trigger === 'scroll' ) {
				return;
			}
			if ( on ) {
				p.anim.pause();
			} else if ( p.c.trigger === 'autoplay' ? p.visible : p.c.trigger === 'view' && p.played && p.c.loop && p.visible ) {
				p.anim.play();
			}
		} );
	}
	d.addEventListener( 'bme:paused', function () {
		setPaused( true );
	} );
	// A page whose only moving content is Lottie loads neither the runtime nor timeline.js: the
	// pause button works through this script then (same storage, same aria-pressed).
	d.addEventListener( 'click', function ( e ) {
		var b = e.target.closest && e.target.closest( '[data-bme-pause-toggle]' );
		if ( ! b || w.BricksMotion || w.BricksMotionTimeline ) {
			return;
		}
		setPaused( ! paused );
		try {
			w.sessionStorage.setItem( 'bme-paused', paused ? '1' : '' );
		} catch ( err ) {
			/* storage blocked: just this page */
		}
		Array.prototype.forEach.call( d.querySelectorAll( '[data-bme-pause-toggle]' ), function ( t ) {
			t.setAttribute( 'aria-pressed', paused ? 'true' : 'false' );
			Array.prototype.forEach.call( t.querySelectorAll( '[data-bme-icon]' ), function ( icon ) {
				icon.toggleAttribute( 'hidden', icon.getAttribute( 'data-bme-icon' ) !== ( paused ? 'play' : 'pause' ) );
			} );
		} );
	} );
	d.addEventListener( 'bme:resumed', function () {
		setPaused( false );
	} );

	// Visitor turns on reduced motion while the page is open: still frames.
	if ( reduce.addEventListener ) {
		reduce.addEventListener( 'change', function () {
			if ( reduce.matches ) {
				players.forEach( function ( p ) {
					if ( p.ready ) {
						still( p );
					}
				} );
			}
		} );
	}

	function start() {
		scan( d );
		[ 'bricks/ajax/nodes_added', 'bricks/ajax/query_result/displayed', 'bricks/ajax/popup/loaded' ].forEach( function ( evt ) {
			d.addEventListener( evt, function () {
				scan( d );
			} );
		} );
		// Elements added later by any script (the builder canvas, filters, custom code).
		if ( 'MutationObserver' in w && d.body ) {
			var timer = 0;
			new w.MutationObserver( function ( list ) {
				for ( var i = 0; i < list.length; i++ ) {
					var nodes = list[ i ].addedNodes;
					for ( var j = 0; j < nodes.length; j++ ) {
						var n = nodes[ j ];
						if ( n.nodeType === 1 && ( n.matches( '.bme-lottie' ) || n.querySelector( '.bme-lottie' ) ) ) {
							clearTimeout( timer );
							timer = setTimeout( function () {
								scan( d );
							}, 30 );
							return;
						}
					}
				}
			} ).observe( d.body, { childList: true, subtree: true } );
		}
	}

	w.BricksMotionLottie = { scan: scan, players: players };

	if ( d.readyState === 'loading' ) {
		d.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
}( window, document ) );
