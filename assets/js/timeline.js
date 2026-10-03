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
 * is restored when the page leaves a breakpoint the row applies to (only the properties the
 * timeline wrote: styles other scripts set are left alone). Reduced motion: scroll rows still
 * follow the scrollbar (the visitor drives them, and stacked sections need them for layout);
 * view and hover rows jump to their end state and loops stay parked on their first frame.
 * Content added later (Bricks AJAX loops, popups) is picked up; view rows inside hidden content
 * (closed popups, tabs, accordions) wait until it is shown.
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
		if ( m && [ m[ 1 ], m[ 2 ], m[ 3 ], m[ 4 ] ].every( function ( x ) {
			return isFinite( +x );
		} ) ) {
			return bezier( Math.min( 1, Math.max( 0, +m[ 1 ] ) ), +m[ 2 ], Math.min( 1, Math.max( 0, +m[ 3 ] ) ), +m[ 4 ] );
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
			if ( s === 'transparent' ) {
				return { c: [ 0, 0, 0, 0 ] };
			}
			m = /^rgba?\(([^)]+)\)$/i.exec( s );
			if ( m ) {
				// rgb(1, 2, 3, .5) and rgb(1 2 3 / 50%); channels may be percentages too.
				var p = m[ 1 ].trim().split( /\s*[,/]\s*|\s+/ ).map( function ( x, i ) {
					var f = parseFloat( x );
					if ( /%$/.test( x ) ) {
						f = i < 3 ? f * 2.55 : f / 100;
					}
					return isFinite( f ) ? f : 0;
				} );
				return { c: [ p[ 0 ] || 0, p[ 1 ] || 0, p[ 2 ] || 0, p.length > 3 ? Math.min( 1, Math.max( 0, p[ 3 ] ) ) : 1 ] };
			}
			return { raw: s, col: true }; // named, hsl(), var(): resolved on the element (resolveColour)
		}
		var n = /^(-?[\d.]+)\s*([a-z%]*)$/i.exec( String( v ).trim() );
		if ( ! n ) {
			return { raw: String( v ) };
		}
		var u = n[ 2 ].toLowerCase();
		var num = parseFloat( n[ 1 ] );
		if ( prop === 'opacity' || prop === 'scale' || prop === 'scaleX' || prop === 'scaleY' ) {
			// Unitless properties: 80% means 0.8; anything else carries no unit.
			return { n: u === '%' ? num / 100 : num, u: '' };
		}
		if ( ! u ) {
			u = prop === 'rotate' ? 'deg' : 'px';
		}
		return { n: num, u: u };
	}

	var ANGLE = { deg: 1, turn: 360 };
	var LENGTH = /^(px|%|vw|vh|vmin|vmax|svh|dvh|lvh|svw|dvw|lvw|em|rem)$/;

	function mix( a, b, t ) {
		if ( a.c && b.c ) {
			// Mixed with premultiplied alpha, like a CSS transition: transparent → white fades
			// through translucent white, not grey.
			var a1 = a.c[ 3 ];
			var a2 = b.c[ 3 ];
			var al = a1 + ( a2 - a1 ) * t;
			var c = [];
			for ( var i = 0; i < 3; i++ ) {
				c.push( al > 0 ? ( a.c[ i ] * a1 + ( b.c[ i ] * a2 - a.c[ i ] * a1 ) * t ) / al : a.c[ i ] + ( b.c[ i ] - a.c[ i ] ) * t );
			}
			c.push( al );
			return { c: c };
		}
		if ( a.n !== undefined && b.n !== undefined ) {
			// A bare 0 takes the other side's unit ('0' → '100%').
			var u = a.u === b.u ? a.u : ( a.n === 0 ? b.u : ( b.n === 0 ? a.u : null ) );
			if ( u !== null ) {
				return { n: a.n + ( b.n - a.n ) * t, u: u };
			}
			// deg ↔ turn: the same quantity.
			if ( ANGLE[ a.u ] && ANGLE[ b.u ] ) {
				return { n: a.n * ANGLE[ a.u ] + ( b.n * ANGLE[ b.u ] - a.n * ANGLE[ a.u ] ) * t, u: 'deg' };
			}
			// Two lengths in different units (10vh → 50px, -100% → the designed px): CSS blends them.
			if ( LENGTH.test( a.u ) && LENGTH.test( b.u ) ) {
				return { n: 1, u: '', calc: 'calc(' + +( a.n * ( 1 - t ) ).toFixed( 4 ) + a.u + ' + ' + +( b.n * t ).toFixed( 4 ) + b.u + ')' };
			}
		}
		return t < 1 ? a : b; // incompatible values step at the next keyframe
	}

	function css( v ) {
		if ( v.calc ) {
			return v.calc;
		}
		if ( v.c ) {
			return 'rgba(' + Math.round( v.c[ 0 ] ) + ', ' + Math.round( v.c[ 1 ] ) + ', ' + Math.round( v.c[ 2 ] ) + ', ' + +v.c[ 3 ].toFixed( 3 ) + ')';
		}
		return v.n !== undefined ? +v.n.toFixed( 4 ) + v.u : v.raw;
	}

	var CSS_PROP = function ( prop ) {
		return TRANSFORM[ prop ] ? 'transform' : CSS_NAME[ prop ] || prop;
	};

	// Value of a track at progress p (0..1 of its keyframes) for one element, easing each segment.
	function sample( track, p, el, prop ) {
		var k = track.k;
		var val = function ( i ) {
			var v = k[ i ].v;
			if ( v.auto ) {
				var dv = designOf( el, prop );
				return { n: dv.n, u: dv.u, c: dv.c, raw: dv.raw, isAuto: true };
			}
			if ( v.col ) {
				return resolveColour( el, v.raw, prop ) || v;
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
		var out = mix( val( i ), val( i + 1 ), track.ease( t ) );
		return out.isAuto && t < 1 ? { n: out.n, u: out.u, c: out.c, raw: out.raw } : out;
	}

	/* ---------- per-element state ------------------------------------------- */

	var states = new Map(); // element → {base, parts, saved, vals, design}

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
		// A mirrored design (scaleX(-1)) keeps its reflection on x, not as rotate(180) + scaleY(-1):
		// a rotate row replaces the rotation, and the flip must survive it.
		if ( a * dd - b * c < 0 ) {
			sx = -sx;
		}
		var sy = ( a * dd - b * c ) / sx;
		if ( Math.abs( a * c + b * dd ) > 1e-6 * sx * sx ) {
			return null; // skew
		}
		return {
			x: { n: v[ 4 ], u: 'px' },
			y: { n: v[ 5 ], u: 'px' },
			rotate: { n: ( Math.atan2( b / sx, a / sx ) * 180 ) / Math.PI, u: 'deg' },
			scaleX: sx,
			scaleY: sy,
		};
	}

	// Designed values, read while none of the timeline's own inline styles are applied.
	function readDesign( st, el ) {
		var cs = w.getComputedStyle( el );
		var tr = cs.transform && cs.transform !== 'none' ? cs.transform : '';
		var parts = tr ? decompose( tr ) : null;
		st.base = tr && ! parts ? tr : '';
		st.parts = parts;
		st.design = {
			opacity: parse( cs.opacity, 'opacity' ),
			width: parse( cs.width, 'width' ),
			height: parse( cs.height, 'height' ),
			color: parse( cs.color, 'color' ),
			backgroundColor: parse( cs.backgroundColor, 'backgroundColor' ),
		};
		st.ox = st.oy = undefined;
		st.cols = null;
		st.prim = null;
		st.last = {}; // inline styles were taken off: the next render writes everything again
	}

	function stateOf( el ) {
		var st = states.get( el );
		if ( ! st ) {
			st = { saved: {}, vals: {}, last: {} };
			readDesign( st, el );
			states.set( el, st );
		}
		return st;
	}

	// The element's own inline value for a CSS property, saved the first time we write it.
	function save( st, el, cssProp ) {
		if ( ! ( cssProp in st.saved ) ) {
			st.saved[ cssProp ] = [ el.style.getPropertyValue( cssProp ), el.style.getPropertyPriority( cssProp ) ];
		}
	}

	function restoreProps( st, el ) {
		st.last = {};
		Object.keys( st.saved ).forEach( function ( cssProp ) {
			var o = st.saved[ cssProp ];
			if ( o[ 0 ] ) {
				el.style.setProperty( cssProp, o[ 0 ], o[ 1 ] );
			} else {
				el.style.removeProperty( cssProp );
			}
		} );
		if ( el.getAttribute( 'style' ) === '' ) {
			el.removeAttribute( 'style' );
		}
	}

	// A colour CSS understands but the timeline can't read (red, hsl(), var(--brand)) → rgba,
	// computed on the element itself so custom properties resolve where they are used.
	function resolveColour( el, raw, prop ) {
		var st = stateOf( el );
		if ( raw === 'currentcolor' && prop === 'backgroundColor' ) {
			return st.design.color; // the element's own (designed) text colour
		}
		var cols = st.cols || ( st.cols = {} );
		if ( ! ( raw in cols ) ) {
			var keep = [ 'color', 'transition' ].map( function ( p ) {
				return [ p, el.style.getPropertyValue( p ), el.style.getPropertyPriority( p ) ];
			} );
			// A running CSS transition would report where it starts, not the colour asked for.
			el.style.setProperty( 'transition', 'none', 'important' );
			el.style.setProperty( 'color', raw, 'important' );
			var ok = el.style.getPropertyValue( 'color' ) !== '';
			var got = ok ? parse( w.getComputedStyle( el ).color, 'color' ) : null;
			cols[ raw ] = got && got.c ? got : null;
			var put = function ( k ) {
				if ( k[ 1 ] ) {
					el.style.setProperty( k[ 0 ], k[ 1 ], k[ 2 ] );
				} else {
					el.style.removeProperty( k[ 0 ] );
				}
			};
			put( keep[ 0 ] );
			w.getComputedStyle( el ).color; // eslint-disable-line no-unused-expressions -- settle on the real colour while transitions are still off
			put( keep[ 1 ] );
			if ( el.getAttribute( 'style' ) === '' ) {
				el.removeAttribute( 'style' );
			}
		}
		return cols[ raw ];
	}

	// How far an element sticks out of its parent; cached until the next measure().
	function overflowOf( el, prop ) {
		var st = stateOf( el );
		var key = prop === 'y' || prop === 'height' ? 'oy' : 'ox';
		if ( st[ key ] === undefined ) {
			var parent = el.parentElement;
			if ( ! parent ) {
				st[ key ] = 0;
			} else {
				// From the element's untransformed start to its far edge, against the parent's
				// content box (padding respected): exactly far enough to show the last item.
				var er = el.getBoundingClientRect();
				var pr = parent.getBoundingClientRect();
				var pcs = w.getComputedStyle( parent );
				var shift = st.vals[ key === 'oy' ? 'y' : 'x' ];
				var moved = 0;
				if ( shift && shift.n && el.style.transform ) {
					var m = new w.DOMMatrix( w.getComputedStyle( el ).transform );
					moved = key === 'oy' ? m.m42 - ( st.parts ? st.parts.y.n : 0 ) : m.m41 - ( st.parts ? st.parts.x.n : 0 );
				}
				st[ key ] = key === 'oy'
					? Math.max( 0, er.top - moved + el.scrollHeight - ( pr.top + parent.clientTop + parent.clientHeight - parseFloat( pcs.paddingBottom ) ) )
					: Math.max( 0, er.left - moved + el.scrollWidth - ( pr.left + parent.clientLeft + parent.clientWidth - parseFloat( pcs.paddingRight ) ) );
			}
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

	function put( st, el, cssProp, value ) {
		if ( st.last[ cssProp ] !== value ) {
			st.last[ cssProp ] = value;
			el.style.setProperty( cssProp, value );
		}
	}

	function write( el, prop, v ) {
		var st = stateOf( el );
		var cssProp = CSS_PROP( prop );
		save( st, el, cssProp );
		if ( v.isAuto ) {
			// Resting on the designed value: hand the property back to the stylesheet.
			delete st.vals[ prop ];
			if ( ! TRANSFORM[ prop ] ) {
				var o = st.saved[ cssProp ];
				delete st.last[ cssProp ];
				if ( o[ 0 ] ) {
					el.style.setProperty( cssProp, o[ 0 ], o[ 1 ] );
				} else {
					el.style.removeProperty( cssProp );
				}
				return;
			}
		} else {
			st.vals[ prop ] = v;
		}
		if ( ! TRANSFORM[ prop ] ) {
			put( st, el, cssProp, css( v ) );
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
		put( st, el, 'transform', out.length ? out.join( ' ' ) : 'none' );
	}

	function restoreAll() {
		states.forEach( restoreProps );
		states.clear();
	}

	// Re-read designed values (after a resize the design may differ): take our inline styles
	// off, read everything in one pass. Returns the function that puts them back, so layout can
	// be measured on the design too (a row that resizes its own element must not feed back).
	// CSS transitions are off meanwhile: with `transition: all` taking a style off would start a
	// transition, and the computed value would still be ours, read as the "design".
	function refreshDesigns() {
		var list = [];
		states.forEach( function ( st, el ) {
			if ( ! el.isConnected ) {
				states.delete( el ); // removed by Bricks AJAX, a closed popup…
				return;
			}
			list.push( [ st, el, Object.keys( st.saved ).map( function ( cp ) {
				return [ cp, el.style.getPropertyValue( cp ), el.style.getPropertyPriority( cp ) ];
			} ), [ el.style.getPropertyValue( 'transition' ), el.style.getPropertyPriority( 'transition' ) ] ] );
			restoreProps( st, el );
			el.style.setProperty( 'transition', 'none', 'important' );
		} );
		list.forEach( function ( item ) {
			readDesign( item[ 0 ], item[ 1 ] );
		} );
		return function () {
			list.forEach( function ( item ) {
				item[ 2 ].forEach( function ( c ) {
					if ( c[ 1 ] ) {
						item[ 1 ].style.setProperty( c[ 0 ], c[ 1 ], c[ 2 ] );
					}
				} );
			} );
			if ( list.length ) {
				w.getComputedStyle( list[ 0 ][ 1 ] ).opacity; // eslint-disable-line no-unused-expressions -- settle on our values while transitions are still off
			}
			list.forEach( function ( item ) {
				var el = item[ 1 ];
				if ( item[ 3 ][ 0 ] ) {
					el.style.setProperty( 'transition', item[ 3 ][ 0 ], item[ 3 ][ 1 ] );
				} else {
					el.style.removeProperty( 'transition' );
				}
				if ( el.getAttribute( 'style' ) === '' ) {
					el.removeAttribute( 'style' );
				}
			} );
		};
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

	// Can this value be written to this property? (translate(10deg) or width: 1turn would make the
	// browser drop the whole declaration, taking the element's other transform parts with it.)
	var ANGLE = { deg: 1, turn: 1 };
	function fits( v, prop ) {
		var colour = prop === 'color' || prop === 'backgroundColor';
		if ( v.auto ) {
			return true;
		}
		if ( v.c || v.col ) {
			return colour;
		}
		if ( v.ovf ) {
			return prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height';
		}
		if ( v.n === undefined || ! isFinite( v.n ) || colour ) {
			return false;
		}
		return prop === 'rotate' ? !! ANGLE[ v.u ] : ! ANGLE[ v.u ];
	}

	function trackFor( row ) {
		// Hand-written attributes can hold anything: only [percent, value] pairs count.
		var k = ( Array.isArray( row.k ) ? row.k : [] )
			.filter( function ( pair ) {
				return Array.isArray( pair ) && pair.length > 1 && pair[ 1 ] !== null && pair[ 1 ] !== undefined;
			} )
			.map( function ( pair ) {
				return { at: Math.min( 100, Math.max( 0, +pair[ 0 ] || 0 ) ) / 100, v: parse( pair[ 1 ], row.p ) };
			} )
			.sort( function ( a, b ) {
				return a.at - b.at;
			} );
		var ok = k.every( function ( key ) {
			return fits( key.v, row.p );
		} );
		return k.length && ok ? { k: k, ease: row.on === 'scroll' ? EASE.linear : easeFn( row.e ) } : null;
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
			var els = tr && targets( root, typeof row.s === 'string' ? row.s : '' );
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
					se: targets( root, typeof row.rse === 'string' ? row.rse : '' )[ 0 ] || root,
					ee: targets( root, typeof row.ree === 'string' ? row.ree : '' )[ 0 ] || root,
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

	// Progress of a whole timeline → every row. Scroll timelines pass 0..1, timed ones seconds;
	// `end` is true once a timed timeline has played through (so zero-length rows land).
	// Several rows may drive the same element + property (a sequence of ranges or delays):
	// the row that has most recently started wins, before any has started the earliest one does.
	function render( g, at, end ) {
		var y = w.scrollY || w.pageYOffset;
		var pick = new Map();
		g.rows.forEach( function ( r ) {
			var p;
			var start;
			if ( g.on === 'scroll' ) {
				p = r.range ? ( y - r.range.start ) / r.range.len : at;
				// Scroll position where the row's first keyframe is reached (one unit for every row).
				start = r.range ? r.range.start + r.tr.k[ 0 ].at * r.range.len : g.start + r.tr.k[ 0 ].at * g.len;
			} else {
				start = r.dl;
				p = r.du > 0 ? ( at - r.dl ) / r.du : ( at > r.dl || ( at === r.dl && ( at > 0 || end ) ) ? 1 : 0 );
			}
			var started = g.on === 'scroll' ? ( r.range ? p >= r.tr.k[ 0 ].at && p > 0 : at >= r.tr.k[ 0 ].at ) : at > r.dl || ( end && at >= r.dl ) || ( r.du > 0 && at >= r.dl && at > 0 );
			p = Math.min( 1, Math.max( 0, p ) );
			r.els.forEach( function ( el ) {
				var byProp = pick.get( el ) || ( pick.set( el, {} ), pick.get( el ) );
				var cur = byProp[ r.p ];
				var better = ! cur || ( started && ( ! cur.started || start >= cur.start ) ) || ( ! started && ! cur.started && start < cur.start );
				if ( better ) {
					byProp[ r.p ] = { r: r, p: p, start: start, started: started };
				}
			} );
		} );
		var primary = g.on === 'view' || g.on === 'scroll';
		pick.forEach( function ( byProp, el ) {
			Object.keys( byProp ).forEach( function ( prop ) {
				var c = byProp[ prop ];
				var st = stateOf( el );
				// A hover / loop row at rest leaves a property a view or scroll row on the same element
				// drives to that row (its last value): a reveal must not flash its end state first.
				if ( ! primary && ! c.started && st.prim && prop in st.prim ) {
					write( el, prop, st.prim[ prop ] );
					return;
				}
				var v = sample( c.r.tr, c.p, el, prop );
				if ( primary ) {
					( st.prim || ( st.prim = {} ) )[ prop ] = v;
				}
				write( el, prop, v );
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

	// A pinned (position: sticky) ancestor reports where it is pinned right now, not where it sits
	// in the page: measure with every sticky element on the way up un-stuck, then put them back
	// (same task, nothing is painted in between).
	var UNSTICK = [ 'position', 'top', 'bottom', 'left', 'right' ];
	function unstick( els ) {
		var undo = [];
		var seen = new Set();
		els.forEach( function ( el ) {
			for ( var n = el; n && n !== d.body && ! seen.has( n ); n = n.parentElement ) {
				seen.add( n );
				if ( w.getComputedStyle( n ).position === 'sticky' ) {
					// relative with no offsets: sits exactly where it would without sticking, and
					// stays the containing block of absolutely positioned layers inside it.
					var saved = UNSTICK.map( function ( p ) {
						return [ p, n.style.getPropertyValue( p ), n.style.getPropertyPriority( p ) ];
					} );
					undo.push( [ n, saved ] );
					n.style.setProperty( 'position', 'relative', 'important' );
					[ 'top', 'bottom', 'left', 'right' ].forEach( function ( p ) {
						n.style.setProperty( p, 'auto', 'important' );
					} );
				}
			}
		} );
		return function () {
			undo.forEach( function ( u ) {
				u[ 1 ].forEach( function ( k ) {
					if ( k[ 1 ] ) {
						u[ 0 ].style.setProperty( k[ 0 ], k[ 1 ], k[ 2 ] );
					} else {
						u[ 0 ].style.removeProperty( k[ 0 ] );
					}
				} );
				if ( u[ 0 ].getAttribute( 'style' ) === '' ) {
					u[ 0 ].removeAttribute( 'style' );
				}
			} );
		};
	}

	function sized( el ) {
		return !! ( el.offsetWidth || el.offsetHeight || el.getClientRects().length );
	}

	function measure() {
		var vh = w.innerHeight;
		var putBack = refreshDesigns();
		scrollers = scrollers.filter( function ( g ) {
			return g.root.isConnected;
		} );
		viewers = viewers.filter( function ( g ) {
			return g.root.isConnected;
		} );
		// Content removed by Bricks AJAX (pagination, filters, a re-opened AJAX popup): let it go.
		redraw = redraw.filter( function ( item ) {
			return item.g.root.isConnected;
		} );
		cleanups = cleanups.filter( function ( item ) {
			if ( item.root && ! item.root.isConnected ) {
				item.fn();
				return false;
			}
			return true;
		} );
		var measured = [];
		scrollers.forEach( function ( g ) {
			measured.push( g.root );
			g.rows.forEach( function ( r ) {
				if ( r.range ) {
					measured.push( r.range.se, r.range.ee );
				}
			} );
		} );
		viewers.forEach( function ( g ) {
			measured.push( g.root );
		} );
		var restick = unstick( measured );
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
		// Hidden content (closed popup, tab, accordion) has no position yet: wait until it is shown.
		viewers.forEach( function ( g ) {
			g.trig = sized( g.root ) ? layoutTop( g.root ) - vh * ( 1 - Math.min( 90, g.o ) / 100 ) : Infinity;
			if ( g.trig === Infinity && sizeWatch ) {
				sizeWatch.observe( g.root );
			}
		} );
		restick();
		putBack();
		redraw.forEach( function ( item ) {
			item.fn(); // timed timelines re-render at their current time with the fresh designs
		} );
	}

	// Elements that get a size later (shown popup / tab / accordion) re-measure.
	var sizeWatch = 'ResizeObserver' in w ? new w.ResizeObserver( function ( entries ) {
		entries.forEach( function ( e ) {
			if ( e.contentRect.width || e.contentRect.height ) {
				sizeWatch.unobserve( e.target );
				measureSoon();
			}
		} );
	} ) : null;
	var measureTimer = 0;
	function measureSoon() {
		clearTimeout( measureTimer );
		measureTimer = setTimeout( function () {
			measure();
			requestScroll();
		}, 60 );
	}
	var redraw = [];

	function onScroll() {
		ticking = false;
		var y = w.scrollY || w.pageYOffset;
		var doc = d.scrollingElement || d.documentElement;
		var atEnd = y + w.innerHeight >= doc.scrollHeight - 2;
		viewers = viewers.filter( function ( g ) {
			// At the page end a start line near the bottom can never be reached: play what is on screen.
			if ( y >= g.trig || ( atEnd && g.trig !== Infinity && sized( g.root ) && g.root.getBoundingClientRect().top < w.innerHeight ) ) {
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
				render( g, 0, false );
				self.to( 1 );
			},
			redraw: function () {
				render( g, t, t >= g.span && dir > 0 );
			},
			reset: function () {
				self.stop();
				t = 0;
			},
			seek: function ( to ) {
				self.stop();
				t = Math.min( g.span, Math.max( 0, to ) );
				render( g, t, false );
			},
			to: function ( target, loop ) {
				if ( ( reduced() && ! loop ) || g.span <= 0 ) {
					// Reduced motion, or nothing to animate over: land on the end (or start) state.
					t = target ? g.span : 0;
					dir = target ? 1 : -1;
					render( g, t, !! target );
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
			var done = ! self.loop && ( dir > 0 ? t >= g.span : t <= 0 );
			render( g, t, done && dir > 0 );
			raf = done ? 0 : w.requestAnimationFrame( step );
		}
		return self;
	}

	/* ---------- binding ----------------------------------------------------- */

	var cleanups = [];
	var loopers = []; // loop timelines: { g, go } (BricksMotion.pauseAll / data-bme-pause-toggle)
	var loopsPaused = false;

	function bind( g, leaveGroup ) {
		if ( g.on === 'leave' ) {
			return; // played by its hover group
		}
		render( g, 0, false ); // the first keyframe is the resting state until the trigger fires
		if ( g.on === 'scroll' ) {
			scrollers.push( g );
			return;
		}
		var pl = player( g );
		redraw.push( { g: g, fn: pl.redraw } );
		var later = function ( fn ) {
			cleanups.push( { root: g.root, fn: fn } );
		};
		if ( g.on === 'hover' ) {
			var out = leaveGroup ? player( leaveGroup ) : null;
			var inside = false;
			// Touch has no hover: a tap would play enter and leave back to back.
			var isTouch = function ( e ) {
				return e && e.pointerType === 'touch';
			};
			// focusin / focusout bubble: moving focus between links inside the root is not leaving it.
			var within = function ( e ) {
				return e && e.relatedTarget && g.root.contains( e.relatedTarget );
			};
			var visible = function ( el ) {
				try {
					return el.matches( ':focus-visible' );
				} catch ( err ) {
					return false;
				}
			};
			var enter = function ( e ) {
				// Focus moving between links inside the root is not entering it, unless the pointer
				// already left and the visitor is now tabbing (keyboard focus shows the hover state).
				if ( inside || isTouch( e ) || ( e && e.type === 'focusin' && within( e ) && ! visible( e.target ) ) ) {
					return;
				}
				inside = true;
				if ( out ) {
					out.reset();
					pl.restart();
				} else {
					pl.to( 1 );
				}
			};
			var leave = function ( e ) {
				if ( ! inside || isTouch( e ) || ( e && e.type === 'focusout' && within( e ) ) ) {
					return;
				}
				// Pointer still over the root while focus leaves (or the reverse): stay entered.
				if ( e && e.type === 'focusout' && g.root.matches( ':hover' ) ) {
					return;
				}
				if ( e && e.type === 'pointerleave' && g.root.contains( d.activeElement ) && visible( d.activeElement ) ) {
					return;
				}
				inside = false;
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
			later( function () {
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
			var played = false;
			var onFocus = function () {
				g.play(); // keyboard users must never land on content still waiting to fade in
			};
			g.play = function () {
				if ( ! played ) {
					played = true;
					g.root.removeEventListener( 'focusin', onFocus );
					pl.to( 1 );
				}
			};
			g.root.addEventListener( 'focusin', onFocus );
			later( function () {
				g.root.removeEventListener( 'focusin', onFocus );
			} );
			if ( inBox( g.root ) && 'IntersectionObserver' in w ) {
				// A popup or a scrolling box moves without the page scrolling: the observer sees
				// that scrolling too (the start line is then measured on the drawn box).
				var vio = new w.IntersectionObserver(
					function ( entries ) {
						if ( entries.some( function ( e ) {
							return e.isIntersecting;
						} ) ) {
							vio.disconnect();
							g.play();
						}
					},
					{ rootMargin: '0px 0px -' + Math.min( 90, g.o ) + '% 0px' }
				);
				vio.observe( g.root );
				later( function () {
					vio.disconnect();
					pl.stop();
				} );
				return;
			}
			viewers.push( g );
			later( function () {
				pl.stop();
			} );
			return;
		}
		later( pl.stop );
		var onScreen = true;
		var go = function () {
			if ( onScreen && ! reduced() && ! loopsPaused ) {
				pl.to( 1, true );
			} else if ( ! onScreen ) {
				pl.stop(); // loops rest while off-screen
			} else {
				// Paused, or reduced motion: rest where the loop is most visible (a pulse that
				// starts at opacity 0 must not stay hidden behind the pause button).
				pl.seek( restAt( g ) );
			}
		};
		loopers.push( { g: g, go: go } );
		if ( ! ( 'IntersectionObserver' in w ) ) {
			go();
			return;
		}
		var io = new w.IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( e ) {
					onScreen = e.isIntersecting;
					go();
				} );
			},
			{ rootMargin: '100px 0px' }
		);
		io.observe( g.root );
		later( function () {
			io.disconnect();
			pl.stop();
		} );
	}

	// The time a parked loop rests on: where its opacity rows are most visible (0 without any).
	function restAt( g ) {
		var rows = g.rows.filter( function ( r ) {
			return r.p === 'opacity';
		} );
		if ( ! rows.length || g.span <= 0 ) {
			return 0;
		}
		var best = 0;
		var bestOpacity = -1;
		for ( var i = 0; i <= 40; i++ ) {
			var t = ( g.span * i ) / 40;
			var least = 1;
			rows.forEach( function ( r ) {
				var p = r.du > 0 ? ( t - r.dl ) / r.du : t >= r.dl ? 1 : 0;
				p = Math.min( 1, Math.max( 0, p ) );
				r.els.forEach( function ( el ) {
					var v = sample( r.tr, p, el, 'opacity' );
					var n = v && typeof v.n === 'number' ? ( v.u === '%' ? v.n / 100 : v.n ) : 1;
					least = Math.min( least, n );
				} );
			} );
			if ( least > bestOpacity + 1e-6 ) {
				bestOpacity = least;
				best = t;
			}
		}
		return best;
	}

	// Inside a fixed layer (a popup) or a box with its own scrollbar?
	function inBox( el ) {
		for ( var n = el.parentElement; n && n !== d.body && n !== d.documentElement; n = n.parentElement ) {
			var cs = w.getComputedStyle( n );
			// overflow-x: hidden turns overflow-y into auto too: only a box that really scrolls counts.
			if ( cs.position === 'fixed' || ( /(auto|scroll|overlay)/.test( cs.overflowY ) && n.scrollHeight > n.clientHeight + 1 ) ) {
				return true;
			}
		}
		return false;
	}

	var bound = typeof WeakSet === 'function' ? new WeakSet() : null;

	// Binds every timeline root not bound yet (all of them on first run; Bricks AJAX content later).
	// The "start invisible" flag (no flash before this script runs) comes off before any design is
	// read, and the first frame is written in the same task: nothing is painted in between.
	function unhide() {
		Array.prototype.forEach.call( d.querySelectorAll( '[data-bme-tl-hide]' ), function ( el ) {
			el.removeAttribute( 'data-bme-tl-hide' );
		} );
	}

	function init() {
		unhide();
		var fresh = [];
		Array.prototype.forEach.call( d.querySelectorAll( '[data-bme-tl]' ), function ( root ) {
			if ( bound && bound.has( root ) ) {
				return;
			}
			if ( bound ) {
				bound.add( root );
			}
			var rows;
			try {
				rows = JSON.parse( root.getAttribute( 'data-bme-tl' ) );
			} catch ( e ) {
				return;
			}
			var off = root.getAttribute( 'data-bme-off-on' );
			if ( off && ( ' ' + off + ' ' ).indexOf( ' ' + sizeName() + ' ' ) !== -1 ) {
				return; // "Turn off on" this screen size (rebuilt when the size changes)
			}
			var groups;
			try {
				groups = build( root, Array.isArray( rows ) ? rows : [] );
			} catch ( e ) {
				return; // one broken timeline never stops the others
			}
			fresh.push( groups );
			// Read every designed value before the first write (no forced layout per element).
			groups.forEach( function ( g ) {
				g.rows.forEach( function ( r ) {
					r.els.forEach( stateOf );
				} );
			} );
		} );
		fresh.forEach( function ( groups ) {
			var leave = groups.filter( function ( g ) {
				return g.on === 'leave';
			} )[ 0 ];
			// "Hover out" rows alone still need something listening for the pointer.
			if ( leave && ! groups.some( function ( g ) {
				return g.on === 'hover';
			} ) ) {
				groups.push( { on: 'hover', root: leave.root, rows: [], span: 0, o: 0 } );
			}
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
		cleanups.forEach( function ( item ) {
			item.fn();
		} );
		cleanups = [];
		loopers = [];
		scrollers = [];
		viewers = [];
		redraw = [];
		if ( bound ) {
			bound = new WeakSet();
		}
		restoreAll();
	}

	var band = '';
	var running = false;
	// "Turn animations off below N px" (Motion Studio → Accessibility).
	function allowed() {
		return ! ( +cfg.minWidth > 0 && w.innerWidth < +cfg.minWidth );
	}
	// phone < 768px ≤ tablet < 992px ≤ desktop ("Turn off on"; rows' own bp split at 992px).
	function sizeName() {
		return w.innerWidth < 768 ? 'phone' : w.innerWidth < 992 ? 'tablet' : 'desktop';
	}
	function bandNow() {
		return sizeName() + ( allowed() ? '' : '-off' ) + ( reduced() ? '-reduced' : '' );
	}
	function start() {
		if ( allowed() ) {
			running = true;
			init();
		} else {
			unhide();
		}
	}
	function rebuild() {
		teardown();
		running = false;
		start();
	}

	function boot() {
		// Paused earlier in this visit (BricksMotion.pauseAll / a data-bme-pause-toggle button).
		try {
			loopsPaused = !! w.sessionStorage.getItem( 'bme-paused' );
		} catch ( e ) {
			loopsPaused = false;
		}
		// Pages with timelines only (no runtime): the pause buttons work here too.
		var pressed = function () {
			if ( ! w.BricksMotion ) {
				Array.prototype.forEach.call( d.querySelectorAll( '[data-bme-pause-toggle]' ), function ( btn ) {
					btn.setAttribute( 'aria-pressed', loopsPaused ? 'true' : 'false' );
					Array.prototype.forEach.call( btn.querySelectorAll( '[data-bme-icon]' ), function ( icon ) {
						icon.toggleAttribute( 'hidden', icon.getAttribute( 'data-bme-icon' ) !== ( loopsPaused ? 'play' : 'pause' ) );
					} );
				} );
			}
		};
		pressed();
		d.addEventListener( 'click', function ( e ) {
			var b = ! w.BricksMotion && e.target.closest && e.target.closest( '[data-bme-pause-toggle]' );
			if ( b ) {
				e.preventDefault();
				w.BricksMotionTimeline.pauseLoops( ! loopsPaused );
				pressed();
				try {
					w.sessionStorage.setItem( 'bme-paused', loopsPaused ? '1' : '' );
				} catch ( err ) {
					/* storage blocked */
				}
			}
		} );
		band = bandNow();
		start();
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
		var lastWidth = w.innerWidth;
		var lastHeight = w.innerHeight;
		var coarse = w.matchMedia ? w.matchMedia( '(pointer: coarse)' ) : { matches: false };
		w.addEventListener( 'resize', function () {
			// The mobile address bar showing / hiding changes only the height, by a little:
			// re-measuring then would make every scroll range jump mid-scroll (GSAP's
			// ignoreMobileResize). Real height changes (split screen, a resized window) still count.
			if ( coarse.matches && w.innerWidth === lastWidth && Math.abs( w.innerHeight - lastHeight ) < 160 ) {
				return;
			}
			lastWidth = w.innerWidth;
			lastHeight = w.innerHeight;
			clearTimeout( resizeTimer );
			resizeTimer = setTimeout( function () {
				// Crossing 992px changes which rows apply: rebuild from the designed styles.
				if ( bandNow() !== band ) {
					band = bandNow();
					rebuild();
				} else if ( running ) {
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
		// Visitor switches reduced motion on or off while the page is open.
		var onReduce = function () {
			band = bandNow();
			rebuild();
		};
		if ( reduceQuery.addEventListener ) {
			reduceQuery.addEventListener( 'change', onReduce );
		} else if ( reduceQuery.addListener ) {
			reduceQuery.addListener( onReduce );
		}
		// Bricks: AJAX content brings new timelines; shown popups / tabs / accordions move things.
		var scanNow = function () {
			if ( running ) {
				init();
			} else {
				unhide(); // switched off (small screen): new content is simply shown
			}
		};
		[ 'bricks/ajax/nodes_added', 'bricks/ajax/query_result/displayed', 'bricks/ajax/load_page/completed', 'bricks/ajax/pagination/completed', 'bricks/ajax/popup/loaded' ].forEach( function ( evt ) {
			d.addEventListener( evt, scanNow );
		} );
		// Content other scripts insert (filter plugins, custom fetch) fires no Bricks event.
		if ( 'MutationObserver' in w && d.body ) {
			var addedTimer = 0;
			new w.MutationObserver( function ( list ) {
				for ( var i = 0; i < list.length; i++ ) {
					for ( var j = 0; j < list[ i ].addedNodes.length; j++ ) {
						var n = list[ i ].addedNodes[ j ];
						if ( n.nodeType === 1 && ( n.hasAttribute( 'data-bme-tl' ) || n.querySelector( '[data-bme-tl]' ) ) ) {
							clearTimeout( addedTimer );
							addedTimer = setTimeout( scanNow, 30 );
							return;
						}
					}
				}
			} ).observe( d.body, { childList: true, subtree: true } );
		}
		[ 'bricks/popup/open', 'bricks/accordion/open', 'bricks/accordion/close', 'bricks/tabs/changed' ].forEach( function ( evt ) {
			d.addEventListener( evt, function () {
				if ( running ) {
					measureSoon();
				}
			} );
		} );
		w.BricksMotionTimeline = {
			refresh: remeasure,
			rebuild: rebuild,
			scan: scanNow,
			pauseLoops: function ( on ) {
				loopsPaused = !! on;
				loopers = loopers.filter( function ( l ) {
					return l.g.root.isConnected;
				} );
				loopers.forEach( function ( l ) {
					l.go();
				} );
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
