/**
 * Bricks Motion Studio — Image sequence element (scroll-scrubbed frames on a canvas).
 *
 * data-bme-seq='{"frames":[urls],"mode":"view|pin","fit":"cover|contain","still":"first|last","static":false}'
 * - view: plays while the element crosses the screen (top reaches the bottom → bottom leaves the top)
 * - pin:  the stage is sticky inside the element; plays over the element's own scroll length
 * Frames load in passes (a coarse set first, then the rest), so it plays at once and gets smoother.
 * The nearest loaded frame is drawn. Reduced motion / Motion Studio off: the still frame stays.
 *
 * @package BricksMotionStudio
 */
( function ( w, d ) {
	'use strict';

	if ( w.BricksMotionSequence ) {
		return;
	}
	var reduceQuery = w.matchMedia ? w.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };
	var players = [];
	var ticking = false;

	function parse( el ) {
		try {
			var o = JSON.parse( el.getAttribute( 'data-bme-seq' ) || '{}' );
			return o && Array.isArray( o.frames ) ? o : null;
		} catch ( e ) {
			return null;
		}
	}

	function progress( P ) {
		var r = P.el.getBoundingClientRect();
		var vh = w.innerHeight || 1;
		var p;
		if ( P.c.mode === 'pin' ) {
			var run = r.height - vh;
			p = run > 0 ? -r.top / run : ( r.top <= 0 ? 1 : 0 );
		} else {
			p = ( vh - r.top ) / ( vh + r.height );
		}
		return Math.max( 0, Math.min( 1, p ) );
	}

	function size( P ) {
		var dpr = Math.min( 2, w.devicePixelRatio || 1 );
		var r = P.stage.getBoundingClientRect();
		var cw = Math.max( 1, Math.round( r.width * dpr ) );
		var ch = Math.max( 1, Math.round( r.height * dpr ) );
		if ( P.canvas.width !== cw || P.canvas.height !== ch ) {
			P.canvas.width = cw;
			P.canvas.height = ch;
			P.drawn = -1;
		}
	}

	// The loaded frame nearest to i (frames arrive in passes).
	function nearest( P, i ) {
		for ( var k = 0; k < P.imgs.length; k++ ) {
			var a = P.imgs[ i - k ];
			if ( a && a.ok ) {
				return i - k;
			}
			var b = P.imgs[ i + k ];
			if ( b && b.ok ) {
				return i + k;
			}
		}
		return -1;
	}

	function draw( P ) {
		size( P );
		var want = Math.round( progress( P ) * ( P.imgs.length - 1 ) );
		var i = nearest( P, want );
		if ( i < 0 || i === P.drawn ) {
			return;
		}
		var img = P.imgs[ i ].img;
		var cw = P.canvas.width;
		var ch = P.canvas.height;
		var iw = img.naturalWidth || 1;
		var ih = img.naturalHeight || 1;
		var k = P.c.fit === 'contain' ? Math.min( cw / iw, ch / ih ) : Math.max( cw / iw, ch / ih );
		var dw = iw * k;
		var dh = ih * k;
		P.ctx.clearRect( 0, 0, cw, ch );
		P.ctx.drawImage( img, ( cw - dw ) / 2, ( ch - dh ) / 2, dw, dh );
		P.drawn = i;
		if ( ! P.ready ) {
			P.ready = true;
			P.el.classList.add( 'is-ready' );
		}
	}

	function frame() {
		ticking = false;
		players.forEach( function ( P ) {
			if ( P.on && P.el.isConnected ) {
				draw( P );
			}
		} );
	}

	function request() {
		if ( ! ticking ) {
			ticking = true;
			w.requestAnimationFrame( frame );
		}
	}

	function load( P ) {
		if ( P.loading ) {
			return;
		}
		P.loading = true;
		var n = P.c.frames.length;
		// Passes: every 16th frame, then every 4th, then all (playable quickly, smoother as it loads).
		var order = [];
		var seen = {};
		[ 16, 4, 1 ].forEach( function ( step ) {
			for ( var i = 0; i < n; i += step ) {
				if ( ! seen[ i ] ) {
					seen[ i ] = true;
					order.push( i );
				}
			}
			if ( ! seen[ n - 1 ] ) {
				seen[ n - 1 ] = true;
				order.push( n - 1 );
			}
		} );
		var next = 0;
		var active = 0;
		var pump = function () {
			while ( active < 6 && next < order.length ) {
				( function ( i ) {
					active++;
					var img = new Image();
					img.decoding = 'async';
					var done = function ( ok ) {
						active--;
						P.imgs[ i ] = { img: img, ok: ok };
						if ( ok ) {
							request();
						}
						pump();
					};
					img.onload = function () {
						done( true );
					};
					img.onerror = function () {
						done( false );
					};
					img.src = P.c.frames[ i ];
				} )( order[ next++ ] );
			}
		};
		pump();
	}

	function setup( el ) {
		if ( el.__bmeSeq ) {
			return;
		}
		var c = parse( el );
		el.__bmeSeq = true;
		if ( ! c || c.frames.length < 2 || c.static || reduceQuery.matches ) {
			return; // the still frame is already in place
		}
		var stage = el.querySelector( '.bme-seq__stage' );
		var canvas = d.createElement( 'canvas' );
		canvas.setAttribute( 'aria-hidden', 'true' );
		var ctx = canvas.getContext && canvas.getContext( '2d' );
		if ( ! stage || ! ctx ) {
			return;
		}
		stage.appendChild( canvas );
		var P = { el: el, c: c, stage: stage, canvas: canvas, ctx: ctx, imgs: new Array( c.frames.length ), drawn: -1, on: false };
		players.push( P );
		if ( 'IntersectionObserver' in w ) {
			new IntersectionObserver(
				function ( entries ) {
					P.on = entries[ entries.length - 1 ].isIntersecting;
					if ( P.on ) {
						load( P );
						request();
					}
				},
				{ rootMargin: '50% 0px 50% 0px' }
			).observe( el );
		} else {
			P.on = true;
			load( P );
		}
	}

	function scan( root ) {
		Array.prototype.forEach.call( ( root || d ).querySelectorAll( '[data-bme-seq]' ), setup );
	}

	function start() {
		scan( d );
		w.addEventListener( 'scroll', request, { passive: true } );
		w.addEventListener( 'resize', function () {
			players.forEach( function ( P ) {
				P.drawn = -1;
			} );
			request();
		} );
		// Reduced motion switched on mid-visit: back to the still frame.
		if ( reduceQuery.addEventListener ) {
			reduceQuery.addEventListener( 'change', function () {
				if ( reduceQuery.matches ) {
					players.forEach( function ( P ) {
						P.on = false;
						P.el.classList.remove( 'is-ready' );
						if ( P.canvas.parentNode ) {
							P.canvas.parentNode.removeChild( P.canvas );
						}
					} );
					players = [];
				}
			} );
		}
		if ( w.MutationObserver ) {
			new MutationObserver( function ( list ) {
				list.forEach( function ( m ) {
					Array.prototype.forEach.call( m.addedNodes, function ( n ) {
						if ( n.nodeType === 1 ) {
							if ( n.matches( '[data-bme-seq]' ) ) {
								setup( n );
							}
							scan( n );
						}
					} );
				} );
			} ).observe( d.body, { childList: true, subtree: true } );
		}
	}

	w.BricksMotionSequence = { scan: scan, players: players };
	if ( d.readyState === 'loading' ) {
		d.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
} )( window, document );
