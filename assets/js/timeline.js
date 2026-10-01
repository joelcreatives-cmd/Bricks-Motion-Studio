/**
 * Bricks Motion Studio — timelines.
 *
 * Keyframe animations for an element and the elements inside it, set in the builder
 * (Motion Studio → Timeline) and rendered as data-bme-tl='[row, …]'. Each row animates
 * one property of one set of targets:
 *
 *   on   scroll | hover | leave | view | loop
 *          scroll  keyframes are % of the element's trip through the viewport (from its
 *                  top reaching the bottom of the screen to its bottom leaving the top),
 *                  so several rows on one tall section can choreograph a sticky stage
 *          hover   plays forward on pointer enter, back on leave
 *          leave   with hover rows: plays on leave instead of reversing (wipes that exit
 *                  the other way); its first keyframe should be where hover ends
 *          view    plays once when the element reaches the start line
 *          loop    repeats forever (marquees); pauses off-screen
 *   s    targets: '' = the element itself, a selector = matches inside it (and the element
 *        itself if it matches), 'page:<selector>' = matches anywhere on the page
 *   p    x y rotate scale scaleX scaleY opacity width height color backgroundColor
 *   k    [[percent, value], …]  values hold before the first and after the last keyframe;
 *        'auto' is the element's own designed value ("animate from wherever it is");
 *        'overflow' / '-overflow' is how far the element sticks out of its parent (x: width,
 *        y: height), so a strip of cards can slide exactly to its last card at any width
 *   rs re  scroll rows: custom range, ScrollTrigger-style "<element edge> <screen line>",
 *        e.g. rs 'top 15%' re 'bottom bottom'. Edges/lines: top center bottom N% Npx.
 *        Defaults: 'top bottom' → 'bottom top' (the whole trip through the screen)
 *   rse ree  elements the start / end are measured on (same syntax as s; default: the element)
 *   d dl e   duration (s), delay (s) and easing between keyframes (not used by scroll)
 *   o    view start line, % above the bottom of the screen
 *   bp   '' | 'desktop' (992px and up) | 'tablet' (991px and below)
 *
 * No animation library. Like GSAP's x / y / rotate / scale, a row REPLACES that part of the
 * element's designed transform (a designed translateY(100%) animated with y: 0 → -10% ends at
 * -10%, not 90%); parts no row animates keep their designed value. Every inline style written
 * is restored when the page leaves a breakpoint the row applies to. Reduced motion: scroll rows still follow the scrollbar (the visitor
 * drives them, and stacked sections need them for layout); view and hover rows jump to
 * their end state and loops stay parked on their first frame.
 */
( function () {
	'use strict';

	var w = window;
	var d = document;
	var cfg = w.BME_TL || {};
	var PROPS = [ 'x', 'y', 'rotate', 'scale', 'scaleX', 'scaleY', 'opacity', 'width', 'height', 'color', 'backgroundColor' ];
	var TRANSFORM = { x: 1, y: 1, rotate: 1, scale: 1, scaleX: 1, scaleY: 1 };
	var CSS_NAME = { backgroundColor: 'background-color' };

	var reduceQuery = w.matchMedia ? w.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };
	function reduced() {
		return !! ( cfg.reduced !== 'ignore' && reduceQuery.matches ) || /[?&]bme-reduce=1\b/.test( w.location.search );
	}

	/* ---------- easing ------------------------------------------------------ */

	function bezier( x1, y1, x2, y2 ) {
		function a( p1, p2 ) {
			return 1 - 3 * p2 + 3 * p1;
		}
		function b( p1, p2 ) {
			return 3 * p2 - 6 * p1;
		}
		function at( t, p1, p2 ) {
			return ( ( a( p1, p2 ) * t + b( p1, p2 ) ) * t + 3 * p1 ) * t;
		}
		return function ( x ) {
			if ( x <= 0 || x >= 1 ) {
				return x <= 0 ? 0 : 1;
			}
			var lo = 0;
			var hi = 1;
			var t = x;
			for ( var i = 0; i < 24; i++ ) {
				var v = at( t, x1, x2 );
				if ( Math.abs( v - x ) < 1e-5 ) {
					break;
				}
				if ( v < x ) {
					lo = t;
				} else {
					hi = t;
				}
				t = ( lo + hi ) / 2;
			}
			return at( t, y1, y2 );
		};
	}
	var EASE = {
		linear: function ( t ) {
			return t;
		},
		ease: bezier( 0.25, 0.1, 0.25, 1 ),
		in: bezier( 0.42, 0, 1, 1 ),
		out: bezier( 0, 0, 0.58, 1 ),
		'in-out': bezier( 0.42, 0, 0.58, 1 ),
		smooth: bezier( 0.215, 0.61, 0.355, 1 ),
		soft: bezier( 0.25, 0.46, 0.45, 0.94 ),
		strong: bezier( 0.19, 1, 0.22, 1 ),
		back: bezier( 0.34, 1.56, 0.64, 1 ),
		sine: bezier( 0.37, 0, 0.63, 1 ),
	};
	// The classic curves as exact formulas (what GSAP's power1-4 / expo / sine / circ / back
	// compute), so a timeline ported from GSAP or Webflow eases identically:
	// in-quad … out-quint, in-out-expo, out-sine, in-circ, out-back …
	( function () {
		var c1 = 1.70158;
		var c2 = c1 * 1.525;
		var base = {
			quad: function ( t ) {
				return t * t;
			},
			cubic: function ( t ) {
				return t * t * t;
			},
			quart: function ( t ) {
				return t * t * t * t;
			},
			quint: function ( t ) {
				return t * t * t * t * t;
			},
			expo: function ( t ) {
				return t === 0 ? 0 : Math.pow( 2, 10 * t - 10 );
			},
			sine: function ( t ) {
				return 1 - Math.cos( ( t * Math.PI ) / 2 );
			},
			circ: function ( t ) {
				return 1 - Math.sqrt( 1 - t * t );
			},
			back: function ( t ) {
				return ( c1 + 1 ) * t * t * t - c1 * t * t;
			},
		};
		Object.keys( base ).forEach( function ( name ) {
			var fin = base[ name ];
			var fout = function ( t ) {
				return 1 - fin( 1 - t );
			};
			EASE[ 'in-' + name ] = fin;
			EASE[ 'out-' + name ] = fout;
			EASE[ 'in-out-' + name ] =
				name === 'back'
					? function ( t ) {
							return t < 0.5 ? ( Math.pow( 2 * t, 2 ) * ( ( c2 + 1 ) * 2 * t - c2 ) ) / 2 : ( Math.pow( 2 * t - 2, 2 ) * ( ( c2 + 1 ) * ( t * 2 - 2 ) + c2 ) + 2 ) / 2;
					  }
					: function ( t ) {
							return t < 0.5 ? fin( 2 * t ) / 2 : 1 - fin( 2 - 2 * t ) / 2;
					  };
		} );
	} )();
	function easeFn( name ) {
		var m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec( name || '' );
		if ( m ) {
			return bezier( +m[ 1 ], +m[ 2 ], +m[ 3 ], +m[ 4 ] );
		}
		return EASE[ name ] || EASE.smooth;
	}

	/* ---------- values ------------------------------------------------------ */

	// '12.5%' → {n: 12.5, u: '%'}; colours → {c: [r, g, b, a]}.
	function parse( v, prop ) {
		var word = String( v ).trim();
		if ( word === 'auto' ) {
			return { auto: true };
		}
		if ( word === 'overflow' || word === '-overflow' ) {
			return { ovf: word.charAt( 0 ) === '-' ? -1 : 1 };
		}
		if ( prop === 'color' || prop === 'backgroundColor' ) {
			var s = String( v ).trim();
			var m = /^#([0-9a-f]{3,8})$/i.exec( s );
			if ( m ) {
				var h = m[ 1 ];
				if ( h.length < 6 ) {
					h = h.replace( /./g, '$&$&' );
				}
				return { c: [ parseInt( h.slice( 0, 2 ), 16 ), parseInt( h.slice( 2, 4 ), 16 ), parseInt( h.slice( 4, 6 ), 16 ), h.length === 8 ? parseInt( h.slice( 6, 8 ), 16 ) / 255 : 1 ] };
			}
			m = /^rgba?\(([^)]+)\)$/i.exec( s );
			if ( m ) {
				var p = m[ 1 ].split( /[\s,/]+/ ).map( Number );
				return { c: [ p[ 0 ] || 0, p[ 1 ] || 0, p[ 2 ] || 0, p.length > 3 ? p[ 3 ] : 1 ] };
			}
			return { raw: s };
		}
		var n = /^(-?[\d.]+)\s*([a-z%]*)$/i.exec( String( v ).trim() );
		if ( ! n ) {
			return { raw: String( v ) };
		}
		var u = n[ 2 ];
		if ( ! u ) {
			u = prop === 'rotate' ? 'deg' : ( prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height' ? 'px' : '' );
		}
		return { n: parseFloat( n[ 1 ] ), u: u };
	}

	function mix( a, b, t ) {
		if ( a.c && b.c ) {
			var c = [];
			for ( var i = 0; i < 4; i++ ) {
				c.push( a.c[ i ] + ( b.c[ i ] - a.c[ i ] ) * t );
			}
			return { c: c };
		}
		if ( a.n !== undefined && b.n !== undefined ) {
			// A bare 0 takes the other side's unit ('0' → '100%').
			var u = a.u === b.u ? a.u : ( a.n === 0 ? b.u : ( b.n === 0 ? a.u : null ) );
			if ( u !== null ) {
				return { n: a.n + ( b.n - a.n ) * t, u: u };
			}
		}
		return t < 1 ? a : b; // incompatible values step at the next keyframe
	}

	function css( v ) {
		if ( v.c ) {
			return 'rgba(' + Math.round( v.c[ 0 ] ) + ', ' + Math.round( v.c[ 1 ] ) + ', ' + Math.round( v.c[ 2 ] ) + ', ' + +v.c[ 3 ].toFixed( 3 ) + ')';
		}
		return v.n !== undefined ? +v.n.toFixed( 4 ) + v.u : v.raw;
	}

	// Value of a track at progress p (0..1 of its keyframes) for one element, easing each segment.
	function sample( track, p, el, prop ) {
		var k = track.k;
		var val = function ( i ) {
			var v = k[ i ].v;
			if ( v.auto ) {
				return designOf( el, prop );
			}
			return v.ovf ? { n: v.ovf * overflowOf( el, prop ), u: 'px' } : v;
		};
		if ( p < k[ 0 ].at ) {
			return val( 0 );
		}
		// The last keyframe at or before p: when several share a position (a jump), the last wins.
		var i = k.length - 1;
		while ( i > 0 && k[ i ].at > p ) {
			i--;
		}
		if ( i === k.length - 1 || k[ i + 1 ].at === k[ i ].at ) {
			return val( i );
		}
		var t = ( p - k[ i ].at ) / ( k[ i + 1 ].at - k[ i ].at );
		return mix( val( i ), val( i + 1 ), track.ease( t ) );
	}

	/* ---------- per-element state ------------------------------------------- */

	var states = new Map(); // element → {base, parts, inline, vals}

	// Designed 2D transform → its parts, so rows can replace one part and keep the rest.
	// Skewed or 3D transforms can't be split losslessly: rows are then composed after them.
	function decompose( tr ) {
		var m = /^matrix\(([^)]+)\)$/.exec( tr || '' );
		if ( ! m ) {
			return null;
		}
		var v = m[ 1 ].split( ',' ).map( Number );
		var a = v[ 0 ];
		var b = v[ 1 ];
		var c = v[ 2 ];
		var dd = v[ 3 ];
		var sx = Math.sqrt( a * a + b * b );
		if ( ! sx ) {
			return null;
		}
		var sy = ( a * dd - b * c ) / sx;
		if ( Math.abs( a * c + b * dd ) > 1e-6 * sx * sx ) {
			return null; // skew
		}
		return {
			x: { n: v[ 4 ], u: 'px' },
			y: { n: v[ 5 ], u: 'px' },
			rotate: { n: ( Math.atan2( b, a ) * 180 ) / Math.PI, u: 'deg' },
			scaleX: sx,
			scaleY: sy,
		};
	}

	function stateOf( el ) {
		var st = states.get( el );
		if ( ! st ) {
			var tr = w.getComputedStyle( el ).transform;
			tr = tr && tr !== 'none' ? tr : '';
			var parts = tr ? decompose( tr ) : null;
			var cs = w.getComputedStyle( el );
			st = {
				base: tr && ! parts ? tr : '',
				parts: parts,
				inline: el.getAttribute( 'style' ),
				vals: {},
				// Designed values, read before anything is written (the 'auto' keyframe).
				design: {
					opacity: parse( cs.opacity, 'opacity' ),
					width: parse( cs.width, 'width' ),
					height: parse( cs.height, 'height' ),
					color: parse( cs.color, 'color' ),
					backgroundColor: parse( cs.backgroundColor, 'backgroundColor' ),
				},
			};
			states.set( el, st );
		}
		return st;
	}

	// How far an element sticks out of its parent; cached until the next measure().
	function overflowOf( el, prop ) {
		var st = stateOf( el );
		var key = prop === 'y' || prop === 'height' ? 'oy' : 'ox';
		if ( st[ key ] === undefined ) {
			var parent = el.parentElement;
			st[ key ] = parent ? Math.max( 0, key === 'oy' ? el.scrollHeight - parent.clientHeight : el.scrollWidth - parent.clientWidth ) : 0;
		}
		return st[ key ];
	}

	function designOf( el, prop ) {
		var st = stateOf( el );
		if ( st.design[ prop ] ) {
			return st.design[ prop ];
		}
		var b = st.parts;
		if ( prop === 'x' || prop === 'y' ) {
			return b ? b[ prop ] : { n: 0, u: 'px' };
		}
		if ( prop === 'rotate' ) {
			return b ? b.rotate : { n: 0, u: 'deg' };
		}
		if ( prop === 'scaleX' || prop === 'scaleY' ) {
			return { n: b ? b[ prop ] : 1, u: '' };
		}
		return { n: 1, u: '' }; // scale
	}

	function write( el, prop, v ) {
		var st = stateOf( el );
		st.vals[ prop ] = v;
		if ( ! TRANSFORM[ prop ] ) {
			el.style.setProperty( CSS_NAME[ prop ] || prop, css( v ) );
			return;
		}
		var s = st.vals;
		var b = st.parts || { x: null, y: null, rotate: null, scaleX: 1, scaleY: 1 };
		var x = s.x || b.x;
		var y = s.y || b.y;
		var r = s.rotate || b.rotate;
		// scale multiplies both axes; scaleX / scaleY replace one axis. Unanimated axes keep the design.
		var k = s.scale ? s.scale.n : 1;
		var sx = ( s.scaleX ? s.scaleX.n : ( s.scale ? 1 : b.scaleX ) ) * k;
		var sy = ( s.scaleY ? s.scaleY.n : ( s.scale ? 1 : b.scaleY ) ) * k;
		var out = st.base ? [ st.base ] : [];
		if ( ( x && x.n ) || ( y && y.n ) ) {
			out.push( 'translate(' + ( x ? css( x ) : '0px' ) + ', ' + ( y ? css( y ) : '0px' ) + ')' );
		}
		if ( r && r.n ) {
			out.push( 'rotate(' + css( r ) + ')' );
		}
		if ( sx !== 1 || sy !== 1 ) {
			out.push( 'scale(' + +sx.toFixed( 5 ) + ', ' + +sy.toFixed( 5 ) + ')' );
		}
		el.style.transform = out.length ? out.join( ' ' ) : 'none';
	}

	function restoreAll() {
		states.forEach( function ( st, el ) {
			if ( st.inline === null ) {
				el.removeAttribute( 'style' );
			} else {
				el.setAttribute( 'style', st.inline );
			}
		} );
		states.clear();
	}

	/* ---------- building ---------------------------------------------------- */

	function targets( root, s ) {
		if ( ! s ) {
			return [ root ];
		}
		try {
			if ( s.indexOf( 'page:' ) === 0 ) {
				return Array.prototype.slice.call( d.querySelectorAll( s.slice( 5 ) ) );
			}
			var list = Array.prototype.slice.call( root.querySelectorAll( s ) );
			if ( root.matches( s ) ) {
				list.unshift( root );
			}
			return list;
		} catch ( e ) {
			return []; // an invalid selector skips its row, never the page
		}
	}

	function applies( row ) {
		if ( row.bp === 'desktop' ) {
			return w.innerWidth >= 992;
		}
		if ( row.bp === 'tablet' ) {
			return w.innerWidth <= 991;
		}
		return true;
	}

	function trackFor( row ) {
		var k = ( row.k || [] )
			.map( function ( pair ) {
				return { at: Math.min( 100, Math.max( 0, +pair[ 0 ] || 0 ) ) / 100, v: parse( pair[ 1 ], row.p ) };
			} )
			.sort( function ( a, b ) {
				return a.at - b.at;
			} );
		return k.length ? { k: k, ease: row.on === 'scroll' ? EASE.linear : easeFn( row.e ) } : null;
	}

	// One timeline per (element, trigger). Timed timelines run on seconds: each row spans
	// its own delay + duration inside the timeline, keyframes being % of that row.
	function build( root, rows ) {
		var groups = {};
		rows.forEach( function ( row ) {
			if ( ! row || PROPS.indexOf( row.p ) === -1 || ! applies( row ) ) {
				return;
			}
			var tr = trackFor( row );
			var els = tr && targets( root, row.s || '' );
			if ( ! els || ! els.length ) {
				return;
			}
			var g = groups[ row.on ] || ( groups[ row.on ] = { on: row.on, root: root, rows: [], span: 0, o: 0 } );
			var dl = Math.max( 0, +row.dl || 0 );
			var du = Math.max( 0, +row.d || 0 );
			var item = { els: els, p: row.p, tr: tr, dl: dl, du: du };
			if ( row.on === 'scroll' && ( row.rs || row.re || row.rse || row.ree ) ) {
				item.range = {
					rs: row.rs || 'top bottom',
					re: row.re || 'bottom top',
					se: targets( root, row.rse || '' )[ 0 ] || root,
					ee: targets( root, row.ree || '' )[ 0 ] || root,
				};
			}
			g.rows.push( item );
			g.span = Math.max( g.span, dl + du );
			if ( row.o ) {
				g.o = Math.max( g.o, +row.o || 0 );
			}
		} );
		return Object.keys( groups ).map( function ( k ) {
			var g = groups[ k ];
			g.ranged = g.rows.some( function ( r ) {
				return !! r.range;
			} );
			return g;
		} );
	}

	// Progress of a whole timeline → every row. Scroll timelines pass 0..1, timed ones seconds.
	function render( g, at ) {
		g.rows.forEach( function ( r ) {
			var p;
			if ( g.on === 'scroll' ) {
				p = r.range ? Math.min( 1, Math.max( 0, ( ( w.scrollY || w.pageYOffset ) - r.range.start ) / r.range.len ) ) : at;
			} else if ( r.du > 0 ) {
				p = ( at - r.dl ) / r.du;
			} else {
				p = at >= r.dl && at > 0 ? 1 : 0;
			}
			p = Math.min( 1, Math.max( 0, p ) );
			r.els.forEach( function ( el ) {
				write( el, r.p, sample( r.tr, p, el, r.p ) );
			} );
		} );
	}

	/* ---------- scroll ------------------------------------------------------ */

	var scrollers = [];
	var viewers = []; // view timelines waiting for their start line
	var ticking = false;

	// Document-space top from the layout tree, ignoring transforms: a timeline that moves its
	// own root must not move the range it is measured against.
	function layoutTop( el ) {
		var y = 0;
		for ( var n = el; n; n = n.offsetParent ) {
			y += n.offsetTop;
		}
		return y;
	}

	// "<element edge> <screen line>" → the scroll position where they meet.
	function offsetIn( word, size ) {
		if ( word === 'top' ) {
			return 0;
		}
		if ( word === 'center' ) {
			return size / 2;
		}
		if ( word === 'bottom' ) {
			return size;
		}
		var m = /^(-?[\d.]+)(px|%)?$/.exec( word || '' );
		return m ? ( m[ 2 ] === 'px' ? +m[ 1 ] : ( size * m[ 1 ] ) / 100 ) : 0;
	}
	function meet( el, spec, vh ) {
		var parts = String( spec ).trim().split( /\s+/ );
		return layoutTop( el ) + offsetIn( parts[ 0 ], el.offsetHeight ) - offsetIn( parts[ 1 ] || 'bottom', vh );
	}

	function measure() {
		var vh = w.innerHeight;
		states.forEach( function ( st ) {
			st.ox = st.oy = undefined; // overflow distances follow the layout
		} );
		scrollers.forEach( function ( g ) {
			var top = layoutTop( g.root );
			g.start = top - vh;
			g.len = Math.max( 1, vh + g.root.offsetHeight );
			g.last = -1; // re-render: ranges or overflow distances may have changed
			g.rows.forEach( function ( r ) {
				if ( r.range ) {
					r.range.start = meet( r.range.se, r.range.rs, vh );
					r.range.len = Math.max( 1, meet( r.range.ee, r.range.re, vh ) - r.range.start );
				}
			} );
		} );
		// View start lines come from the layout box too: a reveal that starts 100px lower
		// must still fire when its real position reaches the line, not 100px later.
		viewers.forEach( function ( g ) {
			g.trig = layoutTop( g.root ) - vh * ( 1 - Math.min( 90, g.o ) / 100 );
		} );
	}

	function onScroll() {
		ticking = false;
		var y = w.scrollY || w.pageYOffset;
		viewers = viewers.filter( function ( g ) {
			if ( y >= g.trig ) {
				g.play();
				return false;
			}
			return true;
		} );
		scrollers.forEach( function ( g ) {
			var p = Math.min( 1, Math.max( 0, ( y - g.start ) / g.len ) );
			if ( p !== g.last || g.ranged ) {
				g.last = p;
				render( g, p );
			}
		} );
	}

	function requestScroll() {
		if ( ! ticking ) {
			ticking = true;
			w.requestAnimationFrame( onScroll );
		}
	}

	/* ---------- timed (hover, view, loop) ----------------------------------- */

	function player( g ) {
		var raf = 0;
		var t = 0; // seconds into the timeline
		var stamp = 0;
		var dir = 0;
		var self = {
			restart: function () {
				self.stop();
				t = 0;
				render( g, 0 );
				self.to( 1 );
			},
			reset: function () {
				self.stop();
				t = 0;
			},
			to: function ( target, loop ) {
				if ( reduced() && ! loop ) {
					t = target ? g.span : 0;
					render( g, t );
					return;
				}
				dir = target ? 1 : -1;
				self.loop = !! loop;
				if ( ! raf ) {
					stamp = 0;
					raf = w.requestAnimationFrame( step );
				}
			},
			stop: function () {
				if ( raf ) {
					w.cancelAnimationFrame( raf );
				}
				raf = 0;
			},
		};
		function step( now ) {
			var dt = stamp ? ( now - stamp ) / 1000 : 0;
			stamp = now;
			t += dir * dt;
			if ( self.loop && t >= g.span ) {
				t = g.span > 0 ? t % g.span : 0;
			}
			t = Math.min( g.span, Math.max( 0, t ) );
			render( g, t );
			var done = ! self.loop && ( dir > 0 ? t >= g.span : t <= 0 );
			raf = done ? 0 : w.requestAnimationFrame( step );
		}
		return self;
	}

	/* ---------- binding ----------------------------------------------------- */

	var cleanups = [];

	function bind( g, leaveGroup ) {
		if ( g.on === 'leave' ) {
			return; // played by its hover group
		}
		render( g, 0 ); // the first keyframe is the resting state until the trigger fires
		if ( g.on === 'scroll' ) {
			scrollers.push( g );
			return;
		}
		var pl = player( g );
		if ( g.on === 'hover' ) {
			var out = leaveGroup ? player( leaveGroup ) : null;
			var enter = function () {
				if ( out ) {
					out.reset();
					pl.restart();
				} else {
					pl.to( 1 );
				}
			};
			var leave = function () {
				if ( out ) {
					pl.reset();
					out.restart();
				} else {
					pl.to( 0 );
				}
			};
			g.root.addEventListener( 'pointerenter', enter );
			g.root.addEventListener( 'pointerleave', leave );
			g.root.addEventListener( 'focusin', enter );
			g.root.addEventListener( 'focusout', leave );
			cleanups.push( function () {
				pl.stop();
				if ( out ) {
					out.stop();
				}
				g.root.removeEventListener( 'pointerenter', enter );
				g.root.removeEventListener( 'pointerleave', leave );
				g.root.removeEventListener( 'focusin', enter );
				g.root.removeEventListener( 'focusout', leave );
			} );
			return;
		}
		if ( g.on === 'view' ) {
			g.play = function () {
				pl.to( 1 );
			};
			viewers.push( g );
			cleanups.push( function () {
				pl.stop();
			} );
			return;
		}
		if ( ! ( 'IntersectionObserver' in w ) ) {
			if ( ! reduced() ) {
				pl.to( 1, true );
			}
			return;
		}
		var io = new w.IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( e ) {
					if ( e.isIntersecting && ! reduced() ) {
						pl.to( 1, true );
					} else {
						pl.stop(); // loops rest while off-screen
					}
				} );
			},
			{ rootMargin: '100px 0px' }
		);
		io.observe( g.root );
		cleanups.push( function () {
			io.disconnect();
			pl.stop();
		} );
	}

	var roots = [];

	function init() {
		roots = Array.prototype.slice.call( d.querySelectorAll( '[data-bme-tl]' ) );
		roots.forEach( function ( root ) {
			var rows;
			try {
				rows = JSON.parse( root.getAttribute( 'data-bme-tl' ) );
			} catch ( e ) {
				return;
			}
			var groups = build( root, Array.isArray( rows ) ? rows : [] );
			var leave = groups.filter( function ( g ) {
				return g.on === 'leave';
			} )[ 0 ];
			groups.forEach( function ( g ) {
				bind( g, leave );
			} );
		} );
		if ( scrollers.length || viewers.length ) {
			measure();
			onScroll();
		}
	}

	function teardown() {
		cleanups.forEach( function ( fn ) {
			fn();
		} );
		cleanups = [];
		scrollers = [];
		viewers = [];
		restoreAll();
	}

	var band = '';
	function bandNow() {
		return w.innerWidth >= 992 ? 'desktop' : 'tablet';
	}

	function boot() {
		// "Turn animations off below N px" switches the page off (bme-off without reduced motion).
		if ( d.documentElement.classList.contains( 'bme-off' ) && ! reduceQuery.matches ) {
			return;
		}
		band = bandNow();
		init();
		w.addEventListener( 'scroll', requestScroll, { passive: true } );
		var remeasure = function () {
			measure();
			requestScroll();
		};
		w.addEventListener( 'load', remeasure );
		// Separate timers: a layout change (ResizeObserver) must never cancel a pending
		// breakpoint rebuild, or rows for the old screen size would stay applied.
		var resizeTimer = 0;
		var layoutTimer = 0;
		w.addEventListener( 'resize', function () {
			clearTimeout( resizeTimer );
			resizeTimer = setTimeout( function () {
				// Crossing 992px changes which rows apply: rebuild from the designed styles.
				if ( bandNow() !== band ) {
					band = bandNow();
					teardown();
					init();
				} else {
					remeasure();
				}
			}, 150 );
		} );
		// Late layout changes (fonts, images without dimensions) move the scroll ranges.
		if ( 'ResizeObserver' in w ) {
			var ro = new w.ResizeObserver( function () {
				clearTimeout( layoutTimer );
				layoutTimer = setTimeout( remeasure, 100 );
			} );
			ro.observe( d.body );
		}
		w.BricksMotionTimeline = {
			refresh: remeasure,
			rebuild: function () {
				teardown();
				init();
			},
			ease: function ( name, t ) {
				return easeFn( name )( t ); // exposed for tests and custom code
			},
		};
	}

	if ( d.readyState === 'loading' ) {
		d.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}
} )();
