/*!
 * Bricks Motion Studio — runtime
 *
 * Engine-agnostic orchestrator. It reads the data attributes printed by the PHP side,
 * decides which registered engine adapter (GSAP / Anime.js / Motion) owns each element,
 * triggers animations (one shared IntersectionObserver per offset, batched cascades),
 * and runs the engine-free features itself (text splitting fallback, counters, SVG
 * drawing fallback, scroll highlight, hover effects, Three.js scene mounting).
 *
 * Conflict rules
 *  - one owner per element: the first animation that claims an element wins,
 *    ancestors claim their scoped children before those children are processed;
 *  - reveals restore the element's original inline styles when finished, so no
 *    transform/opacity/filter lingers to create stacking contexts or containing blocks;
 *  - CSS transitions are suspended on an element while an engine animates it;
 *  - Three.js renders into its own canvas and never touches element styles.
 */
( function ( window, document ) {
	'use strict';

	if ( window.BricksMotion && window.BricksMotion.version ) {
		return;
	}

	var cfg = window.BME_CONFIG || {};
	var html = document.documentElement;
	// Built-in catalog ships inside runtime.min.js; the page config only carries it when a site
	// customizes presets (bme/presets filter) or loads the unminified script (SCRIPT_DEBUG).
	var presets = cfg.presets || window.BME_PRESETS || {};
	var D = assign(
		{ duration: 0.8, delay: 0, ease: 'smooth', distance: 40, stagger: 0.08, offset: 12, batch: 0.08, speed: 0.3, replay: 0 },
		cfg.defaults || {}
	);

	var adapters = {};
	var records = new Set();
	var byEl = new WeakMap();
	var claimed = new WeakSet();
	var claimedBy = new WeakMap(); // scoped child → the record animating it
	var observers = {};
	var listeners = {};
	var started = false;
	var threeModule = null;

	var mqReduced = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };
	var finePointer = window.matchMedia ? window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches : true;

	/* ------------------------------------------------------------------
	 * Helpers
	 * ---------------------------------------------------------------- */

	function assign( target ) {
		for ( var i = 1; i < arguments.length; i++ ) {
			var src = arguments[ i ];
			if ( src ) {
				for ( var k in src ) {
					if ( Object.prototype.hasOwnProperty.call( src, k ) ) {
						target[ k ] = src[ k ];
					}
				}
			}
		}
		return target;
	}

	function log() {
		if ( cfg.debug && window.console ) {
			var args = Array.prototype.slice.call( arguments );
			args.unshift( '%c[Motion Studio]', 'color:#7c5cff;font-weight:600' );
			window.console.log.apply( window.console, args );
		}
	}

	function parseJSON( str ) {
		if ( ! str ) {
			return {};
		}
		try {
			var v = JSON.parse( str );
			return v && typeof v === 'object' ? v : {};
		} catch ( e ) {
			log( 'Invalid JSON', str );
			return {};
		}
	}

	function num( v, fallback ) {
		var n = parseFloat( v );
		return isFinite( n ) ? n : fallback;
	}

	function toArray( list ) {
		return Array.prototype.slice.call( list || [] );
	}

	function debounce( fn, wait ) {
		var t;
		return function () {
			clearTimeout( t );
			t = setTimeout( fn, wait );
		};
	}

	function emit( name, detail, target ) {
		( target || document ).dispatchEvent( new CustomEvent( name, { detail: detail, bubbles: true } ) );
		( listeners[ name ] || [] ).forEach( function ( fn ) {
			try {
				fn( detail );
			} catch ( e ) {
				log( e );
			}
		} );
	}

	/** Motion is off entirely (reduced motion "respect", or below min width). */
	function motionOff() {
		return html.classList.contains( 'bme-off' ) ||
			( cfg.reduced === 'respect' && mqReduced.matches ) ||
			( cfg.minWidth && window.innerWidth < cfg.minWidth );
	}

	/** Reduced motion "fade" mode: every animation becomes a gentle opacity fade. */
	function fadeOnly() {
		return cfg.reduced === 'fade' && mqReduced.matches;
	}

	function inViewport( el ) {
		var r = el.getBoundingClientRect();
		return r.bottom > 0 && r.top < ( window.innerHeight || html.clientHeight );
	}

	/* ------------------------------------------------------------------
	 * Easing (for engine-free effects)
	 * ---------------------------------------------------------------- */

	var EASE_FN = {
		linear: function ( t ) { return t; },
		soft: function ( t ) { return 1 - ( 1 - t ) * ( 1 - t ); },
		smooth: function ( t ) { return 1 - Math.pow( 1 - t, 3 ); },
		strong: function ( t ) { return t === 1 ? 1 : 1 - Math.pow( 2, -10 * t ); },
		'in-out': function ( t ) { return t < 0.5 ? 2 * t * t : 1 - Math.pow( -2 * t + 2, 2 ) / 2; },
		sine: function ( t ) { return -( Math.cos( Math.PI * t ) - 1 ) / 2; },
		back: function ( t ) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow( t - 1, 3 ) + c1 * Math.pow( t - 1, 2 ); },
		elastic: function ( t ) { return t === 0 || t === 1 ? t : Math.pow( 2, -10 * t ) * Math.sin( ( t * 10 - 0.75 ) * ( ( 2 * Math.PI ) / 3 ) ) + 1; },
		bounce: function ( t ) {
			var n1 = 7.5625, d1 = 2.75;
			if ( t < 1 / d1 ) { return n1 * t * t; }
			if ( t < 2 / d1 ) { return n1 * ( t -= 1.5 / d1 ) * t + 0.75; }
			if ( t < 2.5 / d1 ) { return n1 * ( t -= 2.25 / d1 ) * t + 0.9375; }
			return n1 * ( t -= 2.625 / d1 ) * t + 0.984375;
		},
	};

	/**
	 * Minimal rAF tween used by engine-free effects (counter, SVG draw fallback).
	 */
	function coreTween( o ) {
		var ease = EASE_FN[ o.ease ] || EASE_FN.smooth;
		var dur = Math.max( 0.001, o.duration ) * 1000;
		var delay = ( o.delay || 0 ) * 1000;
		var start = 0;
		var raf = 0;
		var done = false;
		var resolve;
		var finished = new Promise( function ( r ) { resolve = r; } );

		function frame( now ) {
			if ( ! start ) {
				start = now + delay;
			}
			var t = Math.min( 1, Math.max( 0, ( now - start ) / dur ) );
			o.update( ease( t ), t );
			if ( t < 1 ) {
				raf = requestAnimationFrame( frame );
			} else {
				done = true;
				resolve();
				if ( o.complete ) {
					o.complete();
				}
			}
		}
		raf = requestAnimationFrame( frame );

		return {
			finished: finished,
			pause: function () { cancelAnimationFrame( raf ); },
			play: function () { if ( ! done ) { raf = requestAnimationFrame( frame ); } },
			revert: function () { cancelAnimationFrame( raf ); done = true; resolve(); },
		};
	}

	/* ------------------------------------------------------------------
	 * Neutral props
	 * ---------------------------------------------------------------- */

	var IDENTITY = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewY: 0, blur: 0, clip: [ 0, 0, 0, 0 ] };
	// Includes the individual transform properties: GSAP writes `translate/rotate/scale: none`
	// inline, which would otherwise outlive the reveal and cancel CSS hover effects or author styles.
	var STYLE_PROPS = [ 'transform', 'translate', 'rotate', 'scale', 'opacity', 'filter', 'clip-path', 'transform-origin', 'transform-box', 'will-change', 'transition', 'visibility' ];

	/** Replace distance tokens: d / -d (distance), hd / -hd (half), p / -p (parallax travel). */
	function resolveToken( v, ctx ) {
		if ( typeof v !== 'string' ) {
			return v;
		}
		var neg = v.charAt( 0 ) === '-';
		var key = neg ? v.slice( 1 ) : v;
		var out;
		if ( key === 'd' ) {
			out = ctx.distance;
		} else if ( key === 'hd' ) {
			out = ctx.distance / 2;
		} else if ( key === 'p' ) {
			out = ctx.speed * 200;
		} else {
			return v;
		}
		return neg ? -out : out;
	}

	/**
	 * Hidden start states use opacity .01, never 0 (same as the boot CSS): invisible to the eye, but
	 * Chrome only counts an element for Largest Contentful Paint if it was painted above 0 — and
	 * compositor fades (Web Animations) don't repaint, so a 0 start would drop the hero image from LCP.
	 */
	var HIDDEN = 0.01;

	function lcpSafe( from ) {
		if ( from && from.opacity === 0 ) {
			from.opacity = HIDDEN;
		}
		return from;
	}

	function resolveProps( props, ctx ) {
		var out = {};
		for ( var k in props ) {
			if ( Object.prototype.hasOwnProperty.call( props, k ) ) {
				out[ k ] = resolveToken( props[ k ], ctx );
			}
		}
		return out;
	}

	/** Target values: preset "to" or the identity value for each animated property. */
	function toProps( from, presetTo, ctx ) {
		var to = {};
		for ( var k in from ) {
			if ( k === 'perspective' ) {
				to[ k ] = from[ k ];
			} else if ( presetTo && k in presetTo ) {
				to[ k ] = resolveToken( presetTo[ k ], ctx );
			} else if ( k in IDENTITY ) {
				to[ k ] = IDENTITY[ k ];
			}
		}
		if ( presetTo ) {
			for ( var t in presetTo ) {
				if ( ! ( t in to ) ) {
					to[ t ] = resolveToken( presetTo[ t ], ctx );
				}
			}
		}
		return to;
	}

	function unit( v ) {
		return typeof v === 'number' ? v + 'px' : v;
	}

	function clipCSS( c ) {
		return 'inset(' + c[ 0 ] + '% ' + c[ 1 ] + '% ' + c[ 2 ] + '% ' + c[ 3 ] + '%)';
	}

	/** Neutral props → inline CSS (engine-independent "set"). */
	/** The element's own stylesheet transform, kept under our offsets (built-in engine only). */
	function baseTransform( rec, t ) {
		return rec.engine === nativeAdapter && restOf( t ) ? restOf( t ).t : '';
	}

	function applyStyle( el, p, base ) {
		var t = base ? base + ' ' : '';
		if ( p.perspective ) {
			t += 'perspective(' + p.perspective + 'px) ';
		}
		if ( p.x !== undefined || p.y !== undefined ) {
			t += 'translate(' + unit( p.x || 0 ) + ',' + unit( p.y || 0 ) + ') ';
		}
		if ( p.rotate ) {
			t += 'rotate(' + p.rotate + 'deg) ';
		}
		if ( p.rotateX ) {
			t += 'rotateX(' + p.rotateX + 'deg) ';
		}
		if ( p.rotateY ) {
			t += 'rotateY(' + p.rotateY + 'deg) ';
		}
		if ( p.skewY ) {
			t += 'skewY(' + p.skewY + 'deg) ';
		}
		if ( p.scale !== undefined && p.scale !== 1 ) {
			t += 'scale(' + p.scale + ') ';
		}
		if ( t ) {
			el.style.transform = t.trim();
		}
		if ( p.opacity !== undefined ) {
			el.style.opacity = p.opacity;
		}
		if ( p.blur !== undefined ) {
			el.style.filter = p.blur ? 'blur(' + p.blur + 'px)' : '';
		}
		if ( p.clip ) {
			el.style.clipPath = clipCSS( p.clip );
		}
	}

	var INLINE_ATTR = 'data-bme-inline';

	/**
	 * Remember the author's inline styles before animating. They are also kept in an attribute
	 * so a node cloned mid-animation (slider loops, marquees) restores the author's values,
	 * not the hidden start state it was copied in.
	 */
	function saveInline( el ) {
		if ( el.__bmeInline ) {
			return;
		}
		var saved = {};
		var copied = el.getAttribute( INLINE_ATTR );
		if ( copied !== null ) {
			saved = parseJSON( copied );
		} else {
			STYLE_PROPS.forEach( function ( prop ) {
				var v = el.style.getPropertyValue( prop );
				if ( v ) {
					saved[ prop ] = v;
				}
			} );
			el.setAttribute( INLINE_ATTR, JSON.stringify( saved ) );
		}
		el.__bmeInline = saved;
	}

	function restoreInline( el ) {
		var saved = el.__bmeInline;
		if ( ! saved ) {
			return;
		}
		STYLE_PROPS.forEach( function ( prop ) {
			if ( typeof saved[ prop ] === 'string' && saved[ prop ] ) {
				el.style.setProperty( prop, saved[ prop ] );
			} else {
				el.style.removeProperty( prop );
			}
		} );
		delete el.__bmeInline;
		el.removeAttribute( INLINE_ATTR );
	}

	/* ------------------------------------------------------------------
	 * Core text splitter (fallback for Anime.js / Motion; GSAP uses SplitText)
	 * ---------------------------------------------------------------- */

	var segmenter = window.Intl && Intl.Segmenter ? new Intl.Segmenter( undefined, { granularity: 'grapheme' } ) : null;

	function graphemes( str ) {
		if ( segmenter ) {
			return Array.from( segmenter.segment( str ), function ( s ) { return s.segment; } );
		}
		return Array.from( str );
	}

	/**
	 * Split an element's text into words (+ chars), preserving nested inline markup.
	 * Lines are derived by grouping words by their vertical position.
	 *
	 * Non-destructive: only text nodes are replaced, and revert() unwraps exactly what was
	 * added, so existing elements keep their identity, listeners and focus.
	 *
	 * @param {Element} el
	 * @param {string}  type  'words' | 'chars' | 'lines'
	 * @param {boolean} mask  wrap words in overflow masks (line reveals)
	 * @param {Object}  opt   { inline: keep words display:inline, aria: false to skip the SR copy }
	 * Returns { words, chars, lines, pieces, revert }.
	 */
	function splitText( el, type, mask, opt ) {
		opt = opt || {};
		var label = el.textContent.replace( /\s+/g, ' ' ).trim();
		var words = [];
		var chars = [];
		var groups = [];
		var walker = document.createTreeWalker( el, NodeFilter.SHOW_TEXT, null );
		var nodes = [];
		var n;

		while ( ( n = walker.nextNode() ) ) {
			if ( n.nodeValue && n.nodeValue.trim() && ! ( n.parentNode && n.parentNode.closest && n.parentNode.closest( 'script,style,svg,textarea,.bme-sr-only' ) ) ) {
				nodes.push( n );
			}
		}

		nodes.forEach( function ( node ) {
			var created = [];
			var frag = document.createDocumentFragment();
			node.nodeValue.split( /(\s+)/ ).forEach( function ( part ) {
				if ( ! part ) {
					return;
				}
				var out;
				if ( /^\s+$/.test( part ) ) {
					out = document.createTextNode( part );
				} else {
					var word = document.createElement( 'span' );
					word.className = 'bme-word' + ( opt.inline ? ' bme-word--inline' : '' );
					if ( type === 'chars' ) {
						graphemes( part ).forEach( function ( g ) {
							var c = document.createElement( 'span' );
							c.className = 'bme-char';
							c.textContent = g;
							word.appendChild( c );
							chars.push( c );
						} );
					} else {
						word.textContent = part;
					}
					out = word;
					if ( mask ) {
						out = document.createElement( 'span' );
						out.className = 'bme-mask';
						out.appendChild( word );
					}
					words.push( word );
				}
				frag.appendChild( out );
				created.push( out );
			} );
			groups.push( { text: node.nodeValue, nodes: created, endsMid: ! /\s$/.test( node.nodeValue ), startsMid: ! /^\s/.test( node.nodeValue ) } );
			node.parentNode.replaceChild( frag, node );
		} );

		// A word that runs across an inline tag (bbb<em>bbb</em>bbb) became several inline-blocks,
		// and the browser may wrap between them. A word joiner (U+2060) forbids that break.
		for ( var gi = 1; gi < groups.length; gi++ ) {
			var prev = groups[ gi - 1 ];
			if ( prev.endsMid && groups[ gi ].startsMid && prev.nodes.length ) {
				var last = prev.nodes[ prev.nodes.length - 1 ];
				var joiner = document.createTextNode( '\u2060' );
				last.parentNode.insertBefore( joiner, last.nextSibling );
				prev.nodes.push( joiner );
			}
		}

		// Screen readers read the intact sentence and skip the pieces. Not done when the element
		// contains focusable content: aria-hidden must never hide something keyboard users reach.
		var sr = null;
		var hidden = [];
		var focusable = el.querySelector( 'a[href], button, input, select, textarea, [tabindex]' );
		if ( opt.aria !== false && ! focusable && label ) {
			sr = document.createElement( 'span' );
			sr.className = 'bme-sr-only';
			sr.textContent = label;
			toArray( el.childNodes ).forEach( function ( child ) {
				if ( child.nodeType === 1 && ! child.hasAttribute( 'aria-hidden' ) ) {
					child.setAttribute( 'aria-hidden', 'true' );
					hidden.push( child );
				}
			} );
			el.insertBefore( sr, el.firstChild );
		}

		// Line index per word (for line-staggered reveals).
		var lines = [];
		var lastTop = null;
		words.forEach( function ( w ) {
			var top = Math.round( w.getBoundingClientRect().top );
			if ( lastTop === null || Math.abs( top - lastTop ) > 3 ) {
				lines.push( [] );
				lastTop = top;
			}
			w.__bmeLine = lines.length - 1;
			lines[ lines.length - 1 ].push( w );
		} );

		return {
			words: words,
			chars: chars,
			lines: lines,
			native: false,
			pieces: type === 'chars' ? chars : words,
			revert: function () {
				groups.forEach( function ( g ) {
					var first = g.nodes[ 0 ];
					if ( first && first.parentNode ) {
						first.parentNode.insertBefore( document.createTextNode( g.text ), first );
					}
					g.nodes.forEach( function ( node ) {
						if ( node.parentNode ) {
							node.parentNode.removeChild( node );
						}
					} );
				} );
				hidden.forEach( function ( child ) {
					child.removeAttribute( 'aria-hidden' );
				} );
				if ( sr && sr.parentNode ) {
					sr.parentNode.removeChild( sr );
				}
				el.normalize();
				groups = [];
				hidden = [];
			},
		};
	}

	/* ------------------------------------------------------------------
	 * Adapters
	 * ---------------------------------------------------------------- */

	/**
	 * Adapter contract (see adapter-*.js):
	 *   tween(targets, from, to, o) → ctrl  o: {duration, delay, ease, stagger (s|fn(i)), repeat, yoyo, onComplete}
	 *   scrub(trigger, targets, from, to, o) → ctrl  o: {range: 'full'|'enter', smooth}
	 *   special: { split(el, type, mask), scramble(el, o), draw(el, paths, o), 'horizontal-scroll'(el, o), pin(el, o) }
	 *   refresh()
	 * ctrl: { pause(), play(), revert(), finished: Promise }
	 */
	function registerAdapter( name, adapter ) {
		adapter.name = name;
		adapters[ name ] = adapter;
		log( 'Adapter registered:', name );
		if ( started ) {
			scan( document );
		}
	}

	var has = function ( obj, key ) {
		return typeof key === 'string' && Object.prototype.hasOwnProperty.call( obj, key );
	};

	function pickEngine( slug, preferred ) {
		var p = has( presets, slug ) ? presets[ slug ] : null;
		if ( ! p ) {
			return null;
		}
		// SVG drawing runs on the core tween unless GSAP (DrawSVG) is there: no other library needed.
		var supported = ( p.engines || [ 'gsap', 'anime', 'motion' ] ).concat( nativeOk( p ) || p.draw ? [ 'native' ] : [] );
		// No engine chosen for this element: the built-in engine handles what it can (no library needed).
		var auto = ! preferred && cfg.native !== false && ! ( p.draw && has( adapters, 'gsap' ) ) ? 'native' : '';
		var order = [ preferred, auto, cfg.engine ].concat( cfg.engines || [] ).concat( Object.keys( adapters ) );
		for ( var i = 0; i < order.length; i++ ) {
			var e = order[ i ];
			if ( e && has( adapters, e ) && supported.indexOf( e ) !== -1 ) {
				return e;
			}
		}
		return null;
	}

	/**
	 * Presets the built-in Web Animations engine renders exactly like the libraries: reveals, loops
	 * and word/character text. Scroll-linked, pinned, SVG drawing, scramble and line splitting keep
	 * using a library. Mirrors Presets::native_ok() in PHP.
	 */
	function nativeOk( p ) {
		return !! p && ! p.engines && ! p.core && ! p.plugins && ! p.draw && p.split !== 'lines' && /^(reveal|text|loop)$/.test( p.group );
	}

	/* ------------------------------------------------------------------
	 * Element config
	 * ---------------------------------------------------------------- */

	/* ------------------------------------------------------------------
	 * Built-in engine (Web Animations API): no library download, and transform / opacity
	 * animations run on the compositor instead of the main thread.
	 * ---------------------------------------------------------------- */

	var NATIVE_EASE = {
		linear: 'linear',
		soft: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
		smooth: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
		strong: 'cubic-bezier(0.19, 1, 0.22, 1)',
		'in-out': 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
		back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
		sine: 'cubic-bezier(0.445, 0.05, 0.55, 0.95)',
	};

	/** Elastic / bounce as CSS linear() sampled from the same curves the other engines use. */
	function nativeEase( name ) {
		if ( has( NATIVE_EASE, name ) ) {
			return NATIVE_EASE[ name ];
		}
		if ( ( name === 'elastic' || name === 'bounce' ) && window.CSS && CSS.supports && CSS.supports( 'animation-timing-function', 'linear(0, 1)' ) ) {
			var pts = [];
			for ( var i = 0; i <= 40; i++ ) {
				pts.push( +EASE_FN[ name ]( i / 40 ).toFixed( 4 ) );
			}
			NATIVE_EASE[ name ] = 'linear(' + pts.join( ', ' ) + ')';
			return NATIVE_EASE[ name ];
		}
		return name === 'elastic' || name === 'bounce' ? NATIVE_EASE.back : NATIVE_EASE.smooth;
	}

	/** Neutral props → one keyframe. `keys` is the union of both frames, so every function interpolates. */
	function nativeFrame( p, keys, base ) {
		var f = {};
		var t = base ? [ base ] : [];
		if ( keys.perspective ) {
			t.push( 'perspective(' + ( p.perspective || keys.perspective ) + 'px)' );
		}
		if ( keys.x || keys.y ) {
			t.push( 'translate(' + unit( p.x || 0 ) + ', ' + unit( p.y || 0 ) + ')' );
		}
		[ 'rotate', 'rotateX', 'rotateY', 'skewY' ].forEach( function ( k ) {
			if ( keys[ k ] ) {
				t.push( k + '(' + ( p[ k ] || 0 ) + 'deg)' );
			}
		} );
		if ( keys.scale ) {
			t.push( 'scale(' + ( p.scale === undefined ? 1 : p.scale ) + ')' );
		}
		if ( t.length ) {
			f.transform = t.join( ' ' );
		}
		if ( keys.opacity ) {
			f.opacity = p.opacity === undefined ? 1 : p.opacity;
		}
		if ( keys.blur ) {
			f.filter = 'blur(' + ( p.blur || 0 ) + 'px)';
		}
		if ( keys.clip ) {
			f.clipPath = clipCSS( p.clip || [ 0, 0, 0, 0 ] );
		}
		return f;
	}

	var nativeAdapter = {
		tween: function ( targets, from, to, o ) {
			var keys = {};
			[ from, to ].forEach( function ( p ) {
				for ( var k in p ) {
					if ( Object.prototype.hasOwnProperty.call( p, k ) ) {
						keys[ k ] = k === 'perspective' ? p[ k ] : true;
					}
				}
			} );
			var anims = [];
			targets.forEach( function ( t, i ) {
				if ( typeof t.animate !== 'function' ) {
					return;
				}
				// Composed on top of the element's own transform, ending at its designed opacity.
				var rest = restOf( t );
				var end = to;
				if ( rest && rest.o < 0.999 && typeof to.opacity === 'number' && to.opacity > rest.o ) {
					end = Object.assign( {}, to, { opacity: rest.o } );
				}
				var frames = [ nativeFrame( from, keys, rest && rest.t ), nativeFrame( end, keys, rest && rest.t ) ];
				var stagger = typeof o.stagger === 'function' ? o.stagger( i ) : ( o.stagger || 0 ) * i;
				anims.push( t.animate( frames, {
					duration: Math.max( 1, o.duration * 1000 ),
					delay: ( ( o.delay || 0 ) + stagger ) * 1000,
					easing: nativeEase( o.ease ),
					fill: 'both',
					iterations: o.repeat ? Infinity : 1,
					direction: o.repeat && o.yoyo ? 'alternate' : 'normal',
				} ) );
			} );
			var finished = Promise.all( anims.map( function ( a ) {
				return a.finished;
			} ) ).then( function () {}, function () {} );
			return {
				finished: finished,
				pause: function () {
					anims.forEach( function ( a ) {
						a.pause();
					} );
				},
				play: function () {
					anims.forEach( function ( a ) {
						a.play();
					} );
				},
				revert: function () {
					anims.forEach( function ( a ) {
						a.cancel();
					} );
				},
			};
		},
		special: {},
	};

	if ( typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' ) {
		nativeAdapter.name = 'native';
		adapters.native = nativeAdapter;
	}

	var CLASS_PREFIX = 'bme-';

	/** distance, duration, stagger multipliers per level (mirrors Levels::SCALE in PHP). */
	var LEVEL_SCALE = {
		basic: [ 0.5, 0.8, 0.7 ],
		moderate: [ 1, 1, 1 ],
		advanced: [ 1.4, 1.15, 1.3 ],
	};

	function readConfig( el ) {
		var slug = el.getAttribute( 'data-bme' );
		if ( ! slug ) {
			// Class shorthand: class="bme-fade-up"
			toArray( el.classList ).some( function ( c ) {
				if ( c.indexOf( CLASS_PREFIX ) === 0 && has( presets, c.slice( CLASS_PREFIX.length ) ) ) {
					slug = c.slice( CLASS_PREFIX.length );
					return true;
				}
				return false;
			} );
		}
		if ( ! slug || ! has( presets, slug ) ) {
			return null;
		}

		var o = parseJSON( el.getAttribute( 'data-bme-opts' ) );
		// Individual attribute overrides: data-bme-duration="1.2" etc.
		[ 'duration', 'delay', 'stagger', 'distance', 'offset', 'speed', 'ease', 'trigger', 'scope', 'replay' ].forEach( function ( k ) {
			var v = el.getAttribute( 'data-bme-' + k );
			// A bare data-bme-replay (no value) switches replay on.
			if ( v !== null && ( v !== '' || k === 'replay' ) ) {
				o[ k ] = v;
			}
		} );

		var p = presets[ slug ];
		// Animation level (auto rules): scales values the element did not set itself.
		var lv = has( LEVEL_SCALE, o.level ) ? LEVEL_SCALE[ o.level ] : LEVEL_SCALE.moderate;
		return {
			slug: slug,
			preset: p,
			engine: el.getAttribute( 'data-bme-engine' ) || o.engine || '',
			duration: num( o.duration, num( p.duration, D.duration ) * lv[ 1 ] ),
			delay: num( o.delay, D.delay ),
			stagger: num( o.stagger, num( p.stagger, D.stagger ) * lv[ 2 ] ),
			distance: num( o.distance, D.distance * lv[ 0 ] ),
			offset: num( o.offset, D.offset ),
			speed: num( o.speed, D.speed ),
			ease: o.ease || p.ease || D.ease,
			trigger: o.trigger === 'load' || o.trigger === 'manual' ? o.trigger : 'scroll',
			scope: o.scope || 'self',
			replay: o.replay !== undefined ? flag( o.replay ) : !! D.replay,
			minWidth: num( o.minWidth, 0 ),
			auto: !! o.auto,
		};
	}

	/** "", true, "true", "yes", "on", 1 → true; "false", "no", "0" → false. */
	function flag( v ) {
		if ( v === '' || v === true ) {
			return true;
		}
		var s = String( v ).trim().toLowerCase();
		return s === 'true' || s === 'yes' || s === 'on' || !! num( s, 0 );
	}

	function targetsFor( el, scope ) {
		if ( ! scope || scope === 'self' ) {
			return [ el ];
		}
		var list;
		if ( scope === 'children' ) {
			list = toArray( el.children );
		} else {
			try {
				list = toArray( el.querySelectorAll( scope ) );
			} catch ( e ) {
				log( 'Invalid scope selector', scope );
				list = [];
			}
		}
		list = list.filter( function ( c ) {
			return c.nodeType === 1 && ! /^(SCRIPT|STYLE|TEMPLATE|LINK|META|BR)$/.test( c.tagName ) && ! c.classList.contains( 'bme-3d-canvas' );
		} );
		return list.length ? list : [ el ];
	}

	function excluded( el ) {
		if ( el.hasAttribute( 'data-bme-skip' ) ) {
			return true;
		}
		if ( ! cfg.exclude ) {
			return false;
		}
		try {
			var hit = el.parentElement && el.parentElement.closest( cfg.exclude );
			return !! hit;
		} catch ( e ) {
			return false;
		}
	}

	function unhide( el ) {
		el.removeAttribute( 'data-bme-hide' );
	}

	/* ------------------------------------------------------------------
	 * Triggering (IntersectionObserver, batched)
	 * ---------------------------------------------------------------- */

	var pendingBatch = [];
	var batchScheduled = false;

	function flushBatch() {
		batchScheduled = false;
		var items = pendingBatch.splice( 0 ).filter( function ( rec ) {
			return ! rec.played;
		} );
		// One read per element (not two per comparison), all before any animation starts.
		var pos = new Map();
		items.forEach( function ( rec ) {
			var r = rec.el.getBoundingClientRect();
			pos.set( rec, [ Math.round( r.top ), r.left ] );
		} );
		items.sort( function ( a, b ) {
			var pa = pos.get( a ), pb = pos.get( b );
			return pa[ 0 ] - pb[ 0 ] || pa[ 1 ] - pb[ 1 ];
		} );
		items.forEach( function ( rec, i ) {
			safePlay( rec, Math.min( i, 8 ) * D.batch );
		} );
	}

	function observerFor( offset ) {
		var key = String( offset );
		if ( observers[ key ] ) {
			return observers[ key ];
		}
		observers[ key ] = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					var rec = byEl.get( entry.target );
					if ( ! rec ) {
						return;
					}
					if ( entry.isIntersecting ) {
						if ( rec.kind === 'loop' ) {
							try {
								resumeLoop( rec );
							} catch ( e ) {
								log( 'Loop resume failed', rec.el, e );
							}
						} else if ( ! rec.played ) {
							pendingBatch.push( rec );
							if ( ! batchScheduled ) {
								batchScheduled = true;
								setTimeout( flushBatch, 16 );
							}
						}
					} else if ( rec.kind === 'loop' ) {
						try {
							pauseLoop( rec );
						} catch ( e ) {
							log( 'Loop pause failed', rec.el, e );
						}
					} else if ( rec.played && rec.cfg.replay && entry.boundingClientRect.top > 0 ) {
						reset( rec );
					}
				} );
			},
			{ rootMargin: '0px 0px -' + Math.max( 0, Math.min( 50, offset ) ) + '% 0px', threshold: 0 }
		);
		return observers[ key ];
	}

	/**
	 * Geometric safety net, run on scroll (debounced) and on load. IntersectionObserver never
	 * reports elements clipped by an overflow:hidden ancestor, can miss elements on very fast
	 * scrolls, and elements at the end of the page may never cross the offset line. Anything
	 * whose box has reached its trigger line is played; anything already scrolled past is shown
	 * without animation. Zero-size boxes (display:none — closed tabs, popups) are left alone.
	 */
	/** Vertical entrance offset applied to the observed element itself (0 when it animates children). */
	function restOffsetY( rec ) {
		var y = rec.from && rec.targets && rec.targets[ 0 ] === rec.el ? rec.from.y : 0;
		return typeof y === 'number' && isFinite( y ) ? y : 0;
	}

	/** Inside a position:fixed container (back-to-top, fixed bars): it never scrolls into view. */
	function inFixed( rec ) {
		if ( rec.fixed === undefined ) {
			rec.fixed = false;
			for ( var n = rec.el; n && n !== document.body; n = n.parentElement ) {
				if ( getComputedStyle( n ).position === 'fixed' ) {
					rec.fixed = true;
					break;
				}
			}
		}
		return rec.fixed;
	}

	var sweepNow = function () {
		var vh = window.innerHeight || html.clientHeight;
		var vw = window.innerWidth || html.clientWidth;
		var doc = document.scrollingElement || html;
		var atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
		// Read every position first, then act: starting an animation writes styles, and reading
		// the next box after a write would force a fresh style + layout pass per element.
		var passed = [];
		var reached = [];
		records.forEach( function ( rec ) {
			if ( rec.played || rec.inert || ! rec.observer || ! /^(reveal|text|draw|counter)$/.test( rec.kind ) || ! rec.el.isConnected ) {
				return;
			}
			var r = rec.el.getBoundingClientRect();
			if ( ! r.width && ! r.height ) {
				return;
			}
			var line = vh * ( 1 - rec.cfg.offset / 100 );
			// Measure where the element rests, not where its entrance offset pushed it.
			var top = r.top - restOffsetY( rec );
			if ( r.right < 0 || r.left > vw ) {
				return; // off to the side (a slider or horizontal track): its own scroll reveals it
			}
			if ( r.bottom < 0 ) {
				passed.push( rec );
			} else if ( top < line || ( ( atBottom || inFixed( rec ) ) && top < vh ) ) {
				reached.push( rec );
			}
		} );
		passed.forEach( function ( rec ) {
			if ( ! rec.cfg.replay ) {
				unwatch( rec ); // replays keep their observer: they play again when scrolled back to
			}
			finish( rec );
		} );
		reached.forEach( function ( rec ) {
			safePlay( rec, 0 );
		} );
	};

	// Debounced (after scrolling, load, resize) and throttled while scrolling: IntersectionObserver
	// never reports some start states (Chrome: fully clipped + scaled, e.g. reveal-image), so the
	// geometric check must also run during a long, fast scroll, not only once it stops.
	var sweep = debounce( sweepNow, 150 );
	var lastSweep = 0;
	function sweepWhileScrolling() {
		var now = Date.now();
		if ( now - lastSweep > 120 ) {
			lastSweep = now;
			sweepNow();
		}
		sweep();
	}


	// Elements inside display:none containers (closed tabs, hover panels) get a size when shown.
	var sizeWatcher = window.ResizeObserver ? new ResizeObserver( function ( entries ) {
		entries.forEach( function ( entry ) {
			if ( entry.contentRect.width || entry.contentRect.height ) {
				sizeWatcher.unobserve( entry.target );
				sweep();
			}
		} );
	} ) : null;

	function watch( rec ) {
		var offset = rec.kind === 'loop' ? 0 : rec.cfg.offset;
		rec.observer = observerFor( offset );
		rec.observer.observe( rec.el );
		var rest = restOf( rec.el );
		var sized = rest ? rest.sized : !! ( rec.el.offsetWidth || rec.el.offsetHeight );
		if ( sizeWatcher && rec.kind !== 'loop' && ! sized ) {
			sizeWatcher.observe( rec.el );
		}
	}

	function unwatch( rec ) {
		if ( rec.observer ) {
			rec.observer.unobserve( rec.el );
			rec.observer = null;
		}
	}

	/* ------------------------------------------------------------------
	 * Records
	 * ---------------------------------------------------------------- */

	function kindOf( p ) {
		if ( p.group === 'loop' ) {
			return 'loop';
		}
		if ( p.group === 'scroll' ) {
			return p.pin ? 'pin' : 'scrub';
		}
		if ( p.split || p.group === 'text' ) {
			return 'text';
		}
		if ( p.draw ) {
			return 'draw';
		}
		if ( p.core && p.group === 'special' ) {
			return 'counter';
		}
		return 'reveal';
	}

	// A timeline row that animates the element itself (no target selector): an auto animation
	// would write the same transform / opacity. Rows aimed at children leave it free.
	function ownTimeline( el ) {
		var rows = parseJSON( el.getAttribute( 'data-bme-tl' ) );
		return Array.isArray( rows ) && rows.some( function ( r ) {
			return r && ! r.s;
		} );
	}

	function create( el ) {
		if ( byEl.has( el ) ) {
			return null;
		}
		var c = readConfig( el );
		if ( ! c ) {
			unhide( el );
			return null;
		}

		// Everything inside a marquee travels with the strip (and is copied by it): no own animation.
		if ( el.closest( '[data-bme-clone]' ) || ( el.parentElement && el.parentElement.closest( '[data-bme="marquee"], .bme-marquee' ) ) ) {
			log( 'Skipped', el, '(inside a marquee)' );
			unhide( el );
			byEl.set( el, { el: el, skipped: true } );
			return null;
		}

		if ( claimed.has( el ) || ( c.auto && ( excluded( el ) || interactionTargets.has( el ) || ownTimeline( el ) ) ) || ( c.minWidth && window.innerWidth < c.minWidth ) ) {
			log( 'Skipped', el, claimed.has( el ) ? '(animated by an ancestor)' : interactionTargets.has( el ) ? '(Bricks interaction animates it)' : ownTimeline( el ) ? '(has its own timeline)' : '(excluded)' );
			unhide( el );
			byEl.set( el, { el: el, skipped: true } );
			return null;
		}

		if ( restOf( el ) && restOf( el ).o < 0.02 ) {
			log( 'Skipped', el, '(invisible by design: opacity ' + restOf( el ).o + ')' );
			unhide( el );
			byEl.set( el, { el: el, skipped: true } );
			return null;
		}

		var p = c.preset;
		var kind = kindOf( p );
		var engineName = p.core ? null : pickEngine( c.slug, c.engine );

		// Fallback preset when no loaded engine can run this one (e.g. scramble without GSAP).
		if ( ! p.core && ! engineName && p.fallback && has( presets, p.fallback ) ) {
			c.slug = p.fallback;
			c.preset = p = presets[ p.fallback ];
			kind = kindOf( p );
			engineName = pickEngine( c.slug, c.engine );
		}

		if ( ! p.core && ! engineName && kind !== 'draw' && kind !== 'counter' ) {
			log( 'No engine available for', c.slug, el );
			unhide( el );
			return null;
		}

		var rec = {
			el: el,
			cfg: c,
			kind: kind,
			engine: engineName ? adapters[ engineName ] : null,
			targets: targetsFor( el, kind === 'text' || kind === 'counter' || kind === 'pin' || p.marquee ? 'self' : c.scope ),
			ctrl: null,
			played: false,
			busy: false,
		};

		// Scoped children: same design rules as the element itself (skip invisible-by-design ones).
		if ( rec.targets.length && rec.targets[ 0 ] !== el ) {
			rec.targets.forEach( function ( t ) {
				if ( ! resting.has( t ) ) {
					resting.set( t, readRest( t ) );
				}
			} );
			var visible = rec.targets.filter( function ( t ) {
				return restOf( t ).o >= 0.02;
			} );
			if ( ! visible.length ) {
				log( 'Skipped', el, '(all animated children are invisible by design)' );
				unhide( el );
				byEl.set( el, { el: el, skipped: true } );
				return null;
			}
			rec.targets = visible;
			// Children with a partial designed opacity (e.g. a 50% overlay) each need their own end
			// value. The built-in engine supports that and renders the same preset identically.
			if ( rec.engine && rec.engine !== nativeAdapter && adapters.native && nativeOk( p ) && ( kind === 'reveal' || kind === 'loop' ) && visible.some( function ( t ) {
				return restOf( t ).o < 0.999;
			} ) ) {
				log( 'Using the built-in engine for', el, '(children with their own designed opacity)' );
				rec.engine = nativeAdapter;
			}
		}

		// A designed transform (centring translate(-50%), a rotation): the libraries write their own
		// transform over it and the element jumps at the end. The built-in engine composes on top.
		if ( rec.engine && rec.engine !== nativeAdapter && adapters.native && nativeOk( p ) && ( kind === 'reveal' || kind === 'loop' ) && rec.targets.some( function ( t ) {
			return restOf( t ) && restOf( t ).t;
		} ) ) {
			log( 'Using the built-in engine for', el, '(keeps its designed transform)' );
			rec.engine = nativeAdapter;
		}

		rec.targets.forEach( function ( t ) {
			if ( t !== el ) {
				claimed.add( t );
				claimedBy.set( t, rec );
			}
		} );

		// Scoped targets inside the element are claimed: drop records they already own.
		rec.targets.forEach( function ( t ) {
			var existing = t !== el && byEl.get( t );
			if ( existing && ! existing.skipped ) {
				destroy( t );
				byEl.set( t, { el: t, skipped: true } );
			}
		} );

		byEl.set( el, rec );
		records.add( rec );
		el.setAttribute( 'data-bme-state', 'ready' );
		if ( rec.engine ) {
			el.setAttribute( 'data-bme-owner', rec.engine.name );
		}
		return rec;
	}

	function setup( rec ) {
		var c = rec.cfg;
		var p = c.preset;
		var el = rec.el;

		if ( fadeOnly() && rec.kind !== 'counter' ) {
			if ( rec.kind === 'scrub' || rec.kind === 'loop' || rec.kind === 'pin' ) {
				unhide( el );
				rec.inert = true;
				return;
			}
			// Gentle fade instead of motion.
			rec.fade = true;
		}

		if ( rec.kind === 'scrub' ) {
			var fromS = lcpSafe( resolveProps( p.from || {}, c ) );
			var toS = toProps( fromS, p.to, c );
			// Scroll fades end at the designed opacity too (a 60% overlay stays at 60%).
			if ( rec.targets.length === 1 && typeof toS.opacity === 'number' && restOf( rec.targets[ 0 ] ) && restOf( rec.targets[ 0 ] ).o < 0.999 ) {
				toS.opacity = restOf( rec.targets[ 0 ] ).o;
			}
			rec.targets.forEach( saveInline );
			rec.ctrl = rec.engine.scrub( el, rec.targets, fromS, toS, { range: p.range || 'full', stagger: rec.targets.length > 1 ? c.stagger : 0 } );
			unhide( el );
			return;
		}

		if ( rec.kind === 'pin' ) {
			var fn = rec.engine.special && rec.engine.special[ c.slug ];
			if ( fn ) {
				rec.ctrl = fn( el, c );
			}
			unhide( el );
			return;
		}

		if ( c.slug === 'scroll-highlight' ) {
			setupHighlight( rec );
			return;
		}

		if ( rec.kind === 'counter' ) {
			setupCounter( rec );
		} else if ( rec.kind === 'reveal' || rec.kind === 'loop' ) {
			if ( p.marquee ) {
				prepareMarquee( rec );
			}
			var from = lcpSafe( rec.fade ? { opacity: 0 } : resolveProps( p.from || {}, c ) );
			rec.from = from;
			rec.to = toProps( from, rec.fade ? null : p.to, c );
			// End at the designed opacity (e.g. a 60% overlay), not a hard-coded 1.
			if ( rec.targets.length === 1 && typeof rec.to.opacity === 'number' && restOf( rec.targets[ 0 ] ) && restOf( rec.targets[ 0 ] ).o < 0.999 ) {
				rec.to.opacity = restOf( rec.targets[ 0 ] ).o;
			}
			rec.targets.forEach( function ( t ) {
				saveInline( t );
				if ( p.origin ) {
					t.style.transformOrigin = p.origin;
				}
				if ( rec.kind === 'reveal' ) {
					applyStyle( t, from, baseTransform( rec, t ) );
				}
			} );
		} else if ( rec.kind === 'draw' ) {
			rec.paths = toArray( el.querySelectorAll( 'path, line, polyline, polygon, circle, ellipse, rect' ) ).filter( function ( s ) {
				return typeof s.getTotalLength === 'function';
			} );
			if ( ! rec.paths.length ) {
				unhide( el );
				rec.inert = true;
				return;
			}
			// Hidden-stroke start state (engine plugins such as DrawSVG take over from here).
			rec.paths.forEach( function ( s ) {
				var len = s.getTotalLength();
				s.__bmeLen = len;
				s.style.strokeDasharray = len + ' ' + len;
				s.style.strokeDashoffset = len;
			} );
		} else if ( rec.kind === 'text' ) {
			// Text is split lazily at play time (accurate line breaks); keep the element transparent until then.
			saveInline( el );
			el.style.opacity = String( HIDDEN );
			rec.textHidden = true;
		}

		unhide( el );

		if ( rec.kind === 'loop' ) {
			watch( rec );
			return;
		}

		// Already failed-safe (content visible): only animate what the visitor has not seen yet.
		if ( html.classList.contains( 'bme-failsafe' ) && inViewport( el ) ) {
			finish( rec );
			return;
		}

		if ( c.trigger === 'load' ) {
			// Split text measures line breaks: wait (briefly) for web fonts so lines are right.
			if ( rec.kind === 'text' && document.fonts && document.fonts.status !== 'loaded' ) {
				var go = function () {
					if ( ! rec.played ) {
						safePlay( rec, 0 );
					}
				};
				document.fonts.ready.then( go, go );
				setTimeout( go, 1200 );
			} else {
				safePlay( rec, 0 );
			}
		} else if ( c.trigger !== 'manual' ) {
			watch( rec );
		}
	}

	/** play() that can never leave an element hidden: any engine error reveals it. */
	function safePlay( rec, extraDelay ) {
		// Queued in a batch or a font wait, then destroyed (reduced motion switched on, node removed).
		if ( ! records.has( rec ) ) {
			return;
		}
		try {
			play( rec, extraDelay );
		} catch ( e ) {
			log( 'Animation failed, showing element', rec.el, e );
			finish( rec );
		}
	}

	/** Watchdog: if an engine never reports completion (tween killed elsewhere), clean up anyway. */
	function watchdog( rec, extraDelay ) {
		var c = rec.cfg;
		var n = Math.max( 1, rec.targets.length, rec.split ? rec.split.pieces.length : 1 );
		// Real piece count: a 400-character typewriter legitimately runs for many seconds.
		var ms = ( c.duration + c.delay + ( extraDelay === undefined ? rec.lastExtra || 0 : extraDelay ) + c.stagger * n ) * 1000 + 1500;
		clearTimeout( rec.watchdog );
		rec.watchdog = setTimeout( function () {
			if ( rec.busy && rec.el.isConnected ) {
				log( 'Watchdog finished a stalled animation', rec.el );
				finish( rec );
			}
		}, Math.min( ms, 120000 ) );
	}

	function suspendTransitions( targets ) {
		targets.forEach( function ( t ) {
			t.style.setProperty( 'transition', 'none', 'important' );
		} );
	}

	function play( rec, extraDelay ) {
		if ( rec.played || rec.inert ) {
			return;
		}
		rec.played = true;
		rec.busy = true;
		rec.lastExtra = extraDelay || 0;
		var c = rec.cfg;
		var delay = c.delay + ( extraDelay || 0 );

		if ( ! c.replay && rec.kind !== 'loop' ) {
			unwatch( rec );
		}

		emit( 'bme:play', { element: rec.el, preset: c.slug, engine: rec.engine && rec.engine.name }, rec.el );

		if ( rec.kind === 'counter' ) {
			rec.ctrl = runCounter( rec, delay );
			return;
		}

		if ( rec.kind === 'draw' ) {
			// Reduced motion "gentle fades": show the finished drawing instead of animating strokes.
			if ( rec.fade ) {
				finish( rec );
				return;
			}
			if ( rec.engine && rec.engine.special && rec.engine.special.draw ) {
				rec.ctrl = rec.engine.special.draw( rec.el, rec.paths, { duration: c.duration, delay: delay, ease: c.ease, stagger: c.stagger } );
			} else {
				rec.ctrl = coreTween( {
					duration: c.duration,
					delay: delay,
					ease: c.ease,
					update: function ( e ) {
						rec.paths.forEach( function ( s ) {
							s.style.strokeDashoffset = s.__bmeLen * ( 1 - e );
						} );
					},
				} );
			}
			whenDone( rec );
			return;
		}

		if ( rec.kind === 'text' ) {
			playText( rec, delay );
			return;
		}

		// Reveal.
		suspendTransitions( rec.targets );
		// Web Animations get their own compositor layers; the libraries animate inline styles.
		if ( rec.engine !== nativeAdapter ) {
			rec.targets.forEach( function ( t ) {
				t.style.willChange = 'transform, opacity';
			} );
		}
		rec.ctrl = rec.engine.tween( rec.targets, rec.from, rec.to, {
			duration: rec.fade ? Math.min( c.duration, 0.6 ) : c.duration,
			delay: delay,
			ease: rec.fade ? 'soft' : c.ease,
			stagger: rec.targets.length > 1 ? c.stagger : 0,
		} );
		whenDone( rec );
	}

	function playText( rec, delay ) {
		var c = rec.cfg;
		var p = c.preset;
		var el = rec.el;
		var eng = rec.engine;

		// Scramble (GSAP ScrambleTextPlugin): only on plain-text elements.
		if ( ! rec.fade && c.slug === 'scramble' && eng && eng.special && eng.special.scramble && el.children.length === 0 ) {
			showText( rec );
			rec.ctrl = eng.special.scramble( el, { duration: c.duration, delay: delay } );
			whenDone( rec );
			return;
		}

		var type = p.split === 'lines' ? 'lines' : p.split === 'chars' ? 'chars' : 'words';
		var split = null;
		var txt = el.textContent || '';
		// Joined scripts (Arabic, Indic, Thai, Myanmar…) lose their letter shapes when split into
		// characters: use words. Right-to-left text inside a left-to-right flow would come out in the
		// wrong order once pieces become inline-blocks: animate the element whole instead.
		if ( type === 'chars' && /[\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u0DFF\u0E00-\u0FFF\u1000-\u109F]/.test( txt ) ) {
			type = 'words';
		}
		var rtlMixed = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test( txt ) && ( getComputedStyle( el ).direction !== 'rtl' || /[A-Za-z]/.test( txt ) );
		if ( ! rec.fade && ! rtlMixed ) {
			// GSAP SplitText is used for masked line reveals (its line detection re-flows best);
			// words/chars use the non-destructive core splitter on every engine.
			// It rewrites innerHTML on revert, so links / buttons inside (their listeners, focus) would
			// be replaced: such text uses the core splitter, which keeps every element.
			var interactive = el.querySelector( 'a, button, input, select, textarea, label, video, audio, iframe, [tabindex], [onclick], [data-interactions], [data-bme-hover]' );
			split = type === 'lines' && ! interactive && eng && eng.special && eng.special.split ? eng.special.split( el, type, !! p.mask ) : null;
			if ( ! split ) {
				split = splitText( el, type, !! p.mask );
			}
			rec.split = split;
		}

		var targets = split ? split.pieces : [ el ];
		var from = lcpSafe( rec.fade ? { opacity: 0 } : resolveProps( p.from || { opacity: 0 }, c ) );
		var to = toProps( from, rec.fade ? null : p.to, c );
		var stagger = c.stagger;

		// Line reveals with the core splitter: every word of a line shares the line's delay.
		if ( split && ! split.native && type === 'lines' ) {
			stagger = function ( i ) {
				return ( targets[ i ].__bmeLine || 0 ) * c.stagger;
			};
		}

		// GSAP SplitText pieces get their start state from GSAP's own fromTo: setting ours as well
		// doubled the offset (lines stayed under their mask until the end, then popped in).
		if ( ! ( split && split.native ) ) {
			targets.forEach( function ( t ) {
				if ( t !== el ) {
					applyStyle( t, from );
				}
			} );
		}
		showText( rec );
		if ( targets[ 0 ] === el ) {
			saveInline( el );
			applyStyle( el, from );
		}

		rec.ctrl = eng.tween( targets, from, to, {
			duration: rec.fade ? 0.6 : c.duration,
			delay: delay,
			ease: rec.fade ? 'soft' : c.ease,
			stagger: split ? stagger : 0,
		} );
		whenDone( rec );
	}

	function showText( rec ) {
		if ( rec.textHidden ) {
			unhide( rec.el );
			restoreInline( rec.el );
			rec.textHidden = false;
		}
	}

	function whenDone( rec, extraDelay ) {
		var ctrl = rec.ctrl;
		if ( ! ctrl || ! ctrl.finished ) {
			return;
		}
		watchdog( rec, extraDelay );
		ctrl.finished.then( function () {
			if ( rec.ctrl === ctrl && rec.played ) {
				finish( rec );
			}
		} );
	}

	/** Leave the element exactly as the stylesheet renders it. */
	function finish( rec ) {
		rec.busy = false;
		rec.played = true;
		clearTimeout( rec.watchdog );
		if ( rec.numberNode ) {
			rec.numberNode.nodeValue = rec.numberOriginal;
			rec.el.style.removeProperty( 'font-variant-numeric' );
		}
		if ( rec.ctrl && rec.ctrl.revert && rec.kind !== 'counter' ) {
			try {
				rec.ctrl.revert();
			} catch ( e ) {
				log( e );
			}
		}
		rec.ctrl = null;
		if ( rec.split ) {
			rec.split.revert();
			rec.split = null;
		}
		showText( rec );
		rec.targets.forEach( restoreInline );
		if ( rec.paths ) {
			rec.paths.forEach( function ( s ) {
				s.style.removeProperty( 'stroke-dasharray' );
				s.style.removeProperty( 'stroke-dashoffset' );
			} );
		}
		unhide( rec.el );
		rec.el.setAttribute( 'data-bme-state', 'done' );
		emit( 'bme:complete', { element: rec.el, preset: rec.cfg.slug }, rec.el );
	}

	/** Back to the "before" state so the reveal can replay. */
	function reset( rec ) {
		if ( rec.ctrl && rec.ctrl.revert ) {
			try {
				rec.ctrl.revert();
			} catch ( e ) {
				log( e );
			}
		}
		rec.ctrl = null;
		if ( rec.split ) {
			rec.split.revert();
			rec.split = null;
		}
		rec.targets.forEach( restoreInline );
		rec.played = false;
		rec.busy = false;
		rec.el.setAttribute( 'data-bme-state', 'ready' ); // CSS hooks and BricksMotion users see it is armed again
		setupAgain( rec );
	}

	function setupAgain( rec ) {
		unwatch( rec );
		var c = rec.cfg;
		if ( rec.kind === 'text' ) {
			saveInline( rec.el );
			rec.el.style.opacity = String( HIDDEN );
			rec.textHidden = true;
		} else if ( rec.kind === 'reveal' ) {
			rec.targets.forEach( function ( t ) {
				saveInline( t );
				if ( c.preset.origin ) {
					t.style.transformOrigin = c.preset.origin;
				}
				applyStyle( t, rec.from, baseTransform( rec, t ) );
			} );
		} else if ( rec.kind === 'counter' ) {
			setupCounter( rec );
		} else if ( rec.kind === 'draw' && rec.paths ) {
			rec.paths.forEach( function ( sv ) {
				sv.style.strokeDasharray = sv.__bmeLen + ' ' + sv.__bmeLen;
				sv.style.strokeDashoffset = sv.__bmeLen;
			} );
		}
		if ( c.trigger !== 'manual' ) {
			watch( rec );
		}
	}

	/**
	 * Marquee: the element becomes one horizontal strip holding its content twice (the copy is
	 * aria-hidden and inert), so sliding it by -50% lands the copy exactly where the original
	 * started: seamless. A trailing pad equal to the gap keeps the spacing even at the seam, the
	 * parent clips the overflow, and the strip pauses on hover / keyboard focus (WCAG 2.2.2).
	 */
	function prepareMarquee( rec ) {
		var el = rec.el;
		if ( el.__bmeMarquee ) {
			return;
		}
		var cs = getComputedStyle( el );
		var parent = el.parentElement;
		var m = {
			style: [ 'display', 'width', 'flex-wrap', 'flex-direction', 'column-gap', 'padding-inline-end' ].map( function ( prop ) {
				return [ prop, el.style.getPropertyValue( prop ) ];
			} ),
			parent: parent,
			parentOverflow: parent ? parent.style.getPropertyValue( 'overflow-x' ) : '',
			clones: [],
		};
		el.__bmeMarquee = m;
		toArray( el.children ).forEach( function ( child ) {
			var copy = child.cloneNode( true );
			copy.setAttribute( 'aria-hidden', 'true' );
			copy.setAttribute( 'inert', '' );
			copy.setAttribute( 'data-bme-clone', '' );
			toArray( copy.querySelectorAll( '*' ) ).concat( [ copy ] ).forEach( function ( n ) {
				// No duplicate ids, and the copy is never picked up as an animation of its own.
				[ 'id', 'data-bme', 'data-bme-hide', 'data-bme-state', 'data-bme-opts', 'data-bme-tl', 'data-bme-tl-hide', INLINE_ATTR ].forEach( function ( a ) {
					n.removeAttribute( a );
				} );
			} );
			el.appendChild( copy );
			m.clones.push( copy );
		} );
		// One row: Bricks containers and blocks are column flexboxes, and a grid with set columns
		// would wrap the copies onto new rows.
		if ( ! /flex/.test( cs.display ) ) {
			el.style.display = /inline/.test( cs.display ) ? 'inline-flex' : 'flex';
		}
		var column = /column/.test( cs.flexDirection ) || /grid/.test( cs.display );
		if ( /column/.test( cs.flexDirection ) || ! /flex/.test( cs.display ) ) {
			el.style.flexDirection = 'row'; // row-reverse stays as designed
		}
		el.style.flexWrap = 'nowrap';
		el.style.width = 'max-content';
		// A column layout spaced its items with row-gap: in one row that spacing is the column gap.
		var gap = parseFloat( cs.columnGap );
		if ( column && ! ( gap > 0 ) && parseFloat( cs.rowGap ) > 0 ) {
			gap = parseFloat( cs.rowGap );
			el.style.columnGap = gap + 'px';
		}
		if ( gap > 0 ) {
			el.style.paddingInlineEnd = gap + 'px';
		}
		if ( parent && getComputedStyle( parent ).overflowX === 'visible' ) {
			parent.style.overflowX = 'clip';
		}
		var pause = function () {
			pauseLoop( rec );
		};
		var resume = function () {
			if ( ! el.matches( ':hover' ) && ! el.contains( document.activeElement ) && inViewport( el ) ) {
				resumeLoop( rec );
			}
		};
		el.addEventListener( 'pointerenter', pause );
		el.addEventListener( 'pointerleave', resume );
		el.addEventListener( 'focusin', pause );
		el.addEventListener( 'focusout', resume );
		m.off = function () {
			el.removeEventListener( 'pointerenter', pause );
			el.removeEventListener( 'pointerleave', resume );
			el.removeEventListener( 'focusin', pause );
			el.removeEventListener( 'focusout', resume );
		};
	}

	function undoMarquee( el ) {
		var m = el.__bmeMarquee;
		if ( ! m ) {
			return;
		}
		m.off();
		m.clones.forEach( function ( c ) {
			if ( c.parentNode ) {
				c.parentNode.removeChild( c );
			}
		} );
		m.style.forEach( function ( pair ) {
			if ( pair[ 1 ] ) {
				el.style.setProperty( pair[ 0 ], pair[ 1 ] );
			} else {
				el.style.removeProperty( pair[ 0 ] );
			}
		} );
		if ( m.parent ) {
			if ( m.parentOverflow ) {
				m.parent.style.setProperty( 'overflow-x', m.parentOverflow );
			} else {
				m.parent.style.removeProperty( 'overflow-x' );
			}
		}
		delete el.__bmeMarquee;
	}

	function resumeLoop( rec ) {
		if ( rec.inert ) {
			return;
		}
		if ( ! rec.ctrl ) {
			var c = rec.cfg;
			rec.ctrl = rec.engine.tween( rec.targets, rec.from, rec.to, {
				duration: c.duration,
				delay: c.delay,
				ease: c.ease,
				stagger: rec.targets.length > 1 ? c.stagger : 0,
				repeat: -1,
				yoyo: c.preset.yoyo !== false,
			} );
			rec.played = true;
		} else if ( rec.ctrl.play ) {
			rec.ctrl.play();
		}
	}

	function pauseLoop( rec ) {
		if ( rec.ctrl && rec.ctrl.pause ) {
			rec.ctrl.pause();
		}
	}

	/* ------------------------------------------------------------------
	 * Engine-free effects
	 * ---------------------------------------------------------------- */

	var NUM_RE = /(-?\d[\d,.\s]*\d|-?\d)/;

	function numberNode( el ) {
		var walker = document.createTreeWalker( el, NodeFilter.SHOW_TEXT, null );
		var n;
		while ( ( n = walker.nextNode() ) ) {
			if ( NUM_RE.test( n.nodeValue ) ) {
				return n;
			}
		}
		return null;
	}

	// Could the separator be a thousands separator? "1.250" yes; "0.125" and "1250.125" no.
	function groupable( raw, sep ) {
		var lead = raw.replace( /^[^\d]*/, '' ).split( sep )[ 0 ];
		return /^[1-9]\d{0,2}$/.test( lead );
	}

	function parseNumber( str ) {
		var raw = str.replace( /\s/g, '' );
		var lastComma = raw.lastIndexOf( ',' );
		var lastDot = raw.lastIndexOf( '.' );
		var decimalSep = '';
		if ( lastComma > -1 && lastDot > -1 ) {
			decimalSep = lastComma > lastDot ? ',' : '.';
		} else if ( lastDot > -1 && ( raw.length - lastDot - 1 !== 3 || ! groupable( raw, '.' ) ) ) {
			decimalSep = '.';
		} else if ( lastComma > -1 && ( raw.length - lastComma - 1 !== 3 || ! groupable( raw, ',' ) ) ) {
			decimalSep = ',';
		}
		var thousandSep = decimalSep === ',' ? '.' : ',';
		var hasThousands = raw.indexOf( decimalSep === '' ? ( lastComma > -1 ? ',' : '.' ) : thousandSep ) > -1;
		if ( decimalSep === '' ) {
			thousandSep = lastComma > -1 ? ',' : lastDot > -1 ? '.' : ',';
		}
		var normalized = raw.split( thousandSep ).join( '' ).replace( decimalSep || '#', '.' );
		var value = parseFloat( normalized );
		var decimals = decimalSep && normalized.indexOf( '.' ) > -1 ? normalized.split( '.' )[ 1 ].length : 0;
		return { value: value, decimals: decimals, decimalSep: decimalSep || '.', thousandSep: hasThousands ? thousandSep : '' };
	}

	function formatNumber( v, fmt ) {
		var fixed = Math.abs( v ).toFixed( fmt.decimals );
		var parts = fixed.split( '.' );
		if ( fmt.thousandSep ) {
			parts[ 0 ] = parts[ 0 ].replace( /\B(?=(\d{3})+(?!\d))/g, fmt.thousandSep );
		}
		return ( v < 0 ? '-' : '' ) + parts.join( fmt.decimalSep );
	}

	function setupCounter( rec ) {
		var node = rec.numberNode || numberNode( rec.el );
		if ( ! node ) {
			rec.inert = true;
			unhide( rec.el );
			return;
		}
		if ( ! rec.numberNode ) {
			var m = node.nodeValue.match( NUM_RE );
			var before = node.nodeValue.charAt( m.index - 1 );
			var after = node.nodeValue.charAt( m.index + m[ 0 ].length );
			var raw = m[ 0 ].replace( /\s/g, '' );
			// Leave ratios/times/dates ("24/7", "9:30", "1/2") and bare years ("2024") alone.
			if ( /[/:]/.test( before + after ) || ( /^\d{4}$/.test( raw ) && +raw >= 1800 && +raw <= 2200 ) ) {
				rec.inert = true;
				unhide( rec.el );
				return;
			}
			rec.numberNode = node;
			rec.numberOriginal = node.nodeValue;
			rec.numberPrefix = node.nodeValue.slice( 0, m.index );
			rec.numberSuffix = node.nodeValue.slice( m.index + m[ 0 ].length );
			rec.numberFmt = parseNumber( m[ 0 ] );
		}
		node.nodeValue = rec.numberPrefix + formatNumber( 0, rec.numberFmt ) + rec.numberSuffix;
		rec.el.style.fontVariantNumeric = 'tabular-nums';
	}

	function runCounter( rec, delay ) {
		if ( ! rec.numberNode ) {
			rec.el.setAttribute( 'data-bme-state', 'done' );
			rec.busy = false;
			return null;
		}
		var fmt = rec.numberFmt;
		var ctrl = coreTween( {
			duration: rec.cfg.duration,
			delay: delay,
			ease: rec.cfg.ease === 'smooth' ? 'strong' : rec.cfg.ease,
			update: function ( e ) {
				rec.numberNode.nodeValue = rec.numberPrefix + formatNumber( fmt.value * e, fmt ) + rec.numberSuffix;
			},
			complete: function () {
				rec.numberNode.nodeValue = rec.numberOriginal;
				rec.el.style.removeProperty( 'font-variant-numeric' );
				rec.el.setAttribute( 'data-bme-state', 'done' );
				rec.busy = false;
				emit( 'bme:complete', { element: rec.el, preset: rec.cfg.slug }, rec.el );
			},
		} );
		return ctrl;
	}

	/** Words brighten one by one as the element scrolls through the viewport. */
	function setupHighlight( rec ) {
		var el = rec.el;
		var split = splitText( el, 'words', false, { inline: true, aria: false } );
		rec.split = split;
		var words = split.words;
		var base = 0.18;
		unhide( el );
		words.forEach( function ( w ) {
			w.style.opacity = base;
			w.style.transition = 'opacity .12s linear';
		} );
		var ticking = false;
		var active = false;

		function update() {
			ticking = false;
			var r = el.getBoundingClientRect();
			var vh = window.innerHeight || html.clientHeight;
			var start = vh * 0.85;
			var end = vh * 0.35;
			var progress = ( start - r.top ) / ( start - end + r.height * 0.5 );
			var doc = document.scrollingElement || html;
			if ( window.innerHeight + window.scrollY >= doc.scrollHeight - 4 && r.top < vh ) {
				progress = 1; // the page cannot scroll further: finish the effect
			}
			progress = Math.max( 0, Math.min( 1, progress ) );
			var lit = progress * words.length;
			words.forEach( function ( w, i ) {
				var o = Math.max( 0, Math.min( 1, lit - i ) );
				w.style.opacity = base + ( 1 - base ) * o;
			} );
		}

		function onScroll() {
			if ( active && ! ticking ) {
				ticking = true;
				requestAnimationFrame( update );
			}
		}

		var io = new IntersectionObserver( function ( entries ) {
			active = entries[ 0 ].isIntersecting;
			if ( active ) {
				onScroll();
			}
		} );
		io.observe( el );
		window.addEventListener( 'scroll', onScroll, { passive: true } );
		window.addEventListener( 'resize', onScroll, { passive: true } );
		update();

		rec.ctrl = {
			revert: function () {
				io.disconnect();
				window.removeEventListener( 'scroll', onScroll );
				window.removeEventListener( 'resize', onScroll );
			},
		};
		rec.played = true;
		rec.persistent = true;
	}

	/* ------------------------------------------------------------------
	 * Hover effects (engine-free; lift/grow use individual CSS transform
	 * properties so they compose with any engine's transform)
	 * ---------------------------------------------------------------- */


	/**
	 * Tilt writes `transform`, so it pauses while an engine owns the transform: the element's
	 * own entrance, a loop / scroll-linked effect, or a parent animating it as one of its children.
	 */
	function tiltBlocked( el ) {
		var rec = byEl.get( el );
		if ( rec && ( rec.busy || /^(loop|scrub|pin)$/.test( rec.kind ) ) ) {
			return true;
		}
		if ( claimed.has( el ) ) {
			var orec = claimedBy.get( el );
			return !! ( orec && ( orec.busy || /^(loop|scrub|pin)$/.test( orec.kind ) ) );
		}
		return false;
	}

	function setupHover( el ) {
		if ( el.__bmeHover ) {
			return;
		}
		var type = el.getAttribute( 'data-bme-hover' );
		el.__bmeHover = true;

		// Bricks 2.3+ "Real parallax" drives the same individual `translate` property.
		if ( el.hasAttribute( 'data-brx-motion-parallax' ) && type !== 'tilt' && type !== 'grow' ) {
			log( 'Hover effect skipped (Bricks parallax owns translate)', el );
			return;
		}

		if ( type === 'lift' || type === 'grow' ) {
			el.classList.add( 'bme-hover-' + type );
			return;
		}
		if ( ! finePointer ) {
			return;
		}

		var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, hovering = false;
		// Tilt builds on the element's own transform (a centred or rotated card must not snap) and
		// puts the author's inline transform back afterwards.
		var tiltBase = null;
		var tiltInline = null;

		function settle() {
			raf = 0;
			cx = cy = tx = ty = 0;
			if ( type === 'magnetic' ) {
				el.style.removeProperty( 'translate' );
			} else if ( tiltInline !== null ) {
				if ( tiltInline ) {
					el.style.transform = tiltInline;
				} else {
					el.style.removeProperty( 'transform' );
				}
				tiltBase = tiltInline = null;
			}
		}

		function loop() {
			// Reduced motion switched on mid-visit: stop and put everything back.
			if ( motionOff() || fadeOnly() ) {
				hovering = false;
				settle();
				return;
			}
			cx += ( tx - cx ) * 0.18;
			cy += ( ty - cy ) * 0.18;
			if ( type === 'magnetic' ) {
				el.style.translate = cx.toFixed( 2 ) + 'px ' + cy.toFixed( 2 ) + 'px';
			} else if ( ! tiltBlocked( el ) ) {
				if ( tiltBase === null ) {
					tiltInline = el.style.transform || '';
					var designed = getComputedStyle( el ).transform;
					tiltBase = designed && designed !== 'none' ? ' ' + designed : '';
				}
				el.style.transform = 'perspective(900px) rotateX(' + ( -cy ).toFixed( 2 ) + 'deg) rotateY(' + cx.toFixed( 2 ) + 'deg)' + tiltBase;
			} else if ( tiltInline !== null ) {
				settle(); // something else took the transform over mid-hover: hand it back cleanly
				return;
			}
			if ( hovering || Math.abs( tx - cx ) > 0.05 || Math.abs( ty - cy ) > 0.05 ) {
				raf = requestAnimationFrame( loop );
			} else {
				settle();
			}
		}

		function start() {
			if ( ! raf ) {
				raf = requestAnimationFrame( loop );
			}
		}

		el.addEventListener( 'pointermove', function ( e ) {
			if ( motionOff() || fadeOnly() || e.pointerType === 'touch' ) {
				return;
			}
			var r = el.getBoundingClientRect();
			var dx = ( e.clientX - ( r.left + r.width / 2 ) ) / ( r.width / 2 );
			var dy = ( e.clientY - ( r.top + r.height / 2 ) ) / ( r.height / 2 );
			hovering = true;
			if ( type === 'magnetic' ) {
				tx = dx * Math.min( 14, r.width * 0.12 );
				ty = dy * Math.min( 14, r.height * 0.12 );
			} else {
				tx = dx * 8;
				ty = dy * 8;
			}
			start();
		} );
		el.addEventListener( 'pointerleave', function () {
			hovering = false;
			tx = 0;
			ty = 0;
			start();
		} );
	}

	/* ------------------------------------------------------------------
	 * Three.js scenes (lazy module)
	 * ---------------------------------------------------------------- */

	var webgl = null;

	function hasWebGL() {
		if ( webgl === null ) {
			try {
				var c = document.createElement( 'canvas' );
				// Three.js r163+ renders with WebGL 2 only: a WebGL 1 device would download it just to fail.
				var gl = window.WebGL2RenderingContext && c.getContext( 'webgl2' );
				webgl = !! gl;
				// Release the probe context immediately (browsers cap live WebGL contexts).
				var lose = gl && gl.getExtension( 'WEBGL_lose_context' );
				if ( lose ) {
					lose.loseContext();
				}
			} catch ( e ) {
				webgl = false;
			}
		}
		return webgl;
	}

	function loadThree() {
		if ( ! threeModule ) {
			threeModule = import( cfg.three.url ).catch( function ( e ) {
				log( 'Three.js module failed to load', e );
				throw e;
			} );
		}
		return threeModule;
	}

	var threeObserver = null;
	var threeHosts = new Set();

	function setupThree( el ) {
		if ( el.__bme3d || ! cfg.three ) {
			return;
		}
		el.__bme3d = { state: 'pending' };
		threeHosts.add( el );
		var phone = window.matchMedia && window.matchMedia( '(max-width: 767px)' ).matches;
		if ( ! hasWebGL() || ( phone && ! cfg.three.mobile ) ) {
			el.classList.add( 'bme-3d-fallback' );
			return;
		}
		if ( ! threeObserver ) {
			threeObserver = new IntersectionObserver(
				function ( entries ) {
					entries.forEach( function ( entry ) {
						var s = entry.target.__bme3d;
						if ( ! s ) {
							return;
						}
						s.visible = entry.isIntersecting;
						if ( entry.isIntersecting && ( s.state === 'pending' || s.state === 'waiting' ) ) {
							mountThree( entry.target );
						} else if ( s.ctrl ) {
							if ( entry.isIntersecting ) {
								s.ctrl.resume();
							} else {
								s.ctrl.pause();
							}
						}
					} );
				},
				{ rootMargin: '200px 0px 200px 0px' }
			);
		}
		threeObserver.observe( el );
	}

	// Browsers keep only so many WebGL contexts: a scene far out of view gives its slot to one that
	// is coming into view, and is mounted again when it comes back.
	function freeThreeSlot( except ) {
		var freed = false;
		threeHosts.forEach( function ( host ) {
			var s = host.__bme3d;
			if ( ! freed && host !== except && s && s.state === 'mounted' && ! s.visible && s.ctrl ) {
				s.ctrl.destroy();
				s.ctrl = null;
				s.state = 'pending';
				freed = true;
			}
		} );
		return freed;
	}

	function mountThree( el, retried ) {
		var s = el.__bme3d;
		s.state = 'loading';
		var opts = parseJSON( el.getAttribute( 'data-bme-3d' ) );
		loadThree()
			.then( function ( mod ) {
				// Removed, or destroyed (BricksMotion.destroy) while the module was loading.
				if ( ! el.isConnected || el.__bme3d !== s ) {
					return;
				}
				s.ctrl = mod.mount( el, opts, {
					dpr: cfg.three.dpr || 1.5,
					reduced: mqReduced.matches && cfg.reduced !== 'ignore',
					debug: !! cfg.debug,
				} );
				if ( ! s.ctrl && mod.busy && mod.busy() && ! retried && freeThreeSlot( el ) ) {
					// Every WebGL slot was held by scenes scrolled out of view: one was released.
					mountThree( el, true );
					return;
				}
				if ( ! s.ctrl ) {
					if ( mod.busy && mod.busy() ) {
						s.state = 'waiting'; // tried again when it next comes into view
						return;
					}
					el.classList.add( 'bme-3d-fallback' );
					s.state = 'failed';
					return;
				}
				s.state = 'mounted';
				if ( ! s.visible && s.ctrl ) {
					s.ctrl.pause();
				}
				emit( 'bme:3d-ready', { element: el, scene: opts.scene }, el );
				refreshSoon();
			} )
			.catch( function () {
				el.classList.add( 'bme-3d-fallback' );
				s.state = 'failed';
			} );
	}

	function destroyThree( el ) {
		var s = el.__bme3d;
		if ( ! s ) {
			return;
		}
		if ( threeObserver ) {
			threeObserver.unobserve( el );
		}
		if ( s.ctrl && s.ctrl.destroy ) {
			s.ctrl.destroy();
		}
		threeHosts.delete( el );
		delete el.__bme3d;
	}

	/* ------------------------------------------------------------------
	 * Scan / destroy / refresh
	 * ---------------------------------------------------------------- */

	var SELECTOR = '[data-bme], [class*="bme-"]';

	/**
	 * Elements that a Bricks interaction ("Start animation") animates, wherever the interaction
	 * lives (another element, a global class). Auto rules leave them alone so nothing animates twice.
	 * Only interactions targeting "self" or a CSS selector point at on-page elements.
	 */
	var interactionTargets = new WeakSet();

	var interactionSources = new WeakSet();
	var interactionSelectors = [];

	function markSelector( root, sel ) {
		try {
			if ( root !== document && root.matches && root.matches( sel ) ) {
				interactionTargets.add( root );
			}
			toArray( root.querySelectorAll( sel ) ).forEach( function ( t ) {
				interactionTargets.add( t );
			} );
		} catch ( e ) {
			/* invalid selector: Bricks ignores it too */
		}
	}

	function collectInteractionTargets( root ) {
		if ( cfg.skipInteractions === false ) {
			return;
		}
		root = root || document;
		// New content can match selectors of interactions that were read earlier.
		if ( root !== document ) {
			interactionSelectors.forEach( function ( sel ) {
				markSelector( root, sel );
			} );
		}
		var sources = toArray( root.querySelectorAll( '[data-interactions]' ) );
		if ( root !== document && root.matches && root.matches( '[data-interactions]' ) ) {
			sources.unshift( root );
		}
		sources.forEach( function ( source ) {
			// Each source is read once; later scans only look at newly added ones.
			if ( interactionSources.has( source ) ) {
				return;
			}
			interactionSources.add( source );
			var list;
			try {
				list = JSON.parse( source.getAttribute( 'data-interactions' ) || '[]' );
			} catch ( e ) {
				return;
			}
			( Array.isArray( list ) ? list : [] ).forEach( function ( it ) {
				if ( ! it || it.action !== 'startAnimation' ) {
					return;
				}
				if ( ! it.target || it.target === 'self' ) {
					interactionTargets.add( source );
				} else if ( it.target === 'custom' && typeof it.targetSelector === 'string' && it.targetSelector ) {
					if ( interactionSelectors.indexOf( it.targetSelector ) === -1 ) {
						interactionSelectors.push( it.targetSelector );
					}
					markSelector( document, it.targetSelector );
				}
			} );
		} );
	}

	/**
	 * What each element looks like by design (its stylesheet): opacity, transform and whether it
	 * has a size. Measured once, before any animation state is applied, so reveals end exactly
	 * there: a 60% overlay ends at 60%, an element centred with translate(-50%) stays centred, and
	 * elements designed to be invisible (hover-revealed text, off-state layers) are not animated
	 * at all instead of flashing into view.
	 *
	 * One batched pass (all writes, then all reads, then restores) in the same task as the setup
	 * that follows, so nothing is painted in between and layout is computed once.
	 */
	var resting = new WeakMap();

	function restOf( el ) {
		return resting.get( el ) || null;
	}

	/**
	 * A node cloned after setup (slider loops, marquees, re-mounted widgets) copies our start state
	 * and split markup but not our in-memory bookkeeping. Put it back to how the author left it.
	 */
	function repairClone( n ) {
		var saved = parseJSON( n.getAttribute( INLINE_ATTR ) );
		STYLE_PROPS.forEach( function ( prop ) {
			if ( typeof saved[ prop ] === 'string' && saved[ prop ] ) {
				n.style.setProperty( prop, saved[ prop ] );
			} else {
				n.style.removeProperty( prop );
			}
		} );
		n.removeAttribute( INLINE_ATTR );
		n.removeAttribute( 'data-bme-state' );
		var sr = n.querySelector( ':scope > .bme-sr-only' );
		if ( sr ) {
			sr.parentNode.removeChild( sr );
			toArray( n.children ).forEach( function ( c ) {
				c.removeAttribute( 'aria-hidden' );
			} );
		}
		toArray( n.querySelectorAll( '.bme-mask, .bme-word' ) ).forEach( function ( piece ) {
			if ( piece.parentNode && ! piece.parentNode.closest( '.bme-mask, .bme-word' ) ) {
				piece.parentNode.replaceChild( document.createTextNode( piece.textContent ), piece );
			}
		} );
		n.normalize();
	}

	function measureResting( list ) {
		toArray( document.querySelectorAll( '[' + INLINE_ATTR + ']' ) ).forEach( function ( n ) {
			if ( ! n.__bmeInline && ! byEl.has( n ) ) {
				repairClone( n );
			}
		} );
		var todo = list.filter( function ( el ) {
			return ! byEl.has( el ) && ! resting.has( el );
		} );
		if ( ! todo.length ) {
			return;
		}
		// A CSS transition on opacity would report its start value (our .01) instead of the design.
		var prev = todo.map( function ( el ) {
			return [ el.style.getPropertyValue( 'transition' ), el.style.getPropertyPriority( 'transition' ) ];
		} );
		todo.forEach( function ( el ) {
			el.style.setProperty( 'transition', 'none', 'important' );
			unhide( el );
		} );
		todo.forEach( function ( el ) {
			resting.set( el, readRest( el ) );
		} );
		todo.forEach( function ( el, i ) {
			if ( prev[ i ][ 0 ] ) {
				el.style.setProperty( 'transition', prev[ i ][ 0 ], prev[ i ][ 1 ] );
			} else {
				el.style.removeProperty( 'transition' );
			}
		} );
	}

	function readRest( el ) {
		var cs = getComputedStyle( el );
		// Something else animates it right now (CSS keyframes, another library): values are in flux.
		var busy = typeof el.getAnimations === 'function' && el.getAnimations().length > 0;
		var o = parseFloat( cs.opacity );
		return {
			o: busy || ! isFinite( o ) ? 1 : o,
			t: ! busy && cs.transform && cs.transform !== 'none' ? cs.transform : '',
			sized: !! ( el.offsetWidth || el.offsetHeight || ( el.getClientRects && el.getClientRects().length ) ),
		};
	}

	function scan( root ) {
		root = root || document;
		var off = motionOff();

		// Three.js scenes are decorative: they still mount (static frame under reduced motion).
		var self = function ( sel ) {
			var list = toArray( root.querySelectorAll( sel ) );
			if ( root !== document && root.matches && root.matches( sel ) ) {
				list.unshift( root );
			}
			return list;
		};
		self( '[data-bme-3d]' ).forEach( setupThree );

		if ( ! off && ! fadeOnly() ) {
			self( '[data-bme-hover]' ).forEach( setupHover );
		}

		var candidates = toArray( root.querySelectorAll( SELECTOR ) );
		if ( root !== document && root.matches && root.matches( SELECTOR ) ) {
			candidates.unshift( root );
		}

		if ( off ) {
			candidates.forEach( unhide );
			toArray( root.querySelectorAll( '[data-bme-hide]' ) ).forEach( unhide );
			return;
		}

		collectInteractionTargets( root );
		measureResting( candidates );

		// Document order: ancestors are processed (and claim their scoped children) first.
		var created = [];
		candidates.forEach( function ( el ) {
			if ( ! el.hasAttribute( 'data-bme' ) && ! /(^|\s)bme-[a-z]/.test( el.getAttribute( 'class' ) || '' ) ) {
				return;
			}
			var rec = null;
			try {
				rec = create( el );
			} catch ( e ) {
				log( 'Could not initialize', el, e );
				unhide( el );
			}
			if ( rec ) {
				created.push( rec );
			}
		} );
		created.forEach( function ( rec ) {
			if ( setupWait && rec.kind === 'reveal' && rec.cfg.trigger !== 'load' && rec.cfg.trigger !== 'manual' && rec.targets.some( function ( t ) {
				return restOf( t ) && ! restOf( t ).sized;
			} ) ) {
				waiting.set( rec.el, rec );
				setupWait.observe( rec.el );
				return;
			}
			runSetup( rec );
		} );

		// Nothing left hidden by mistake.
		toArray( root.querySelectorAll( '[data-bme-hide]' ) ).forEach( function ( el ) {
			var rec = byEl.get( el );
			if ( ! rec || rec.skipped ) {
				unhide( el );
			}
		} );

		if ( created.length ) {
			log( 'Initialized', created.length, 'animations', created );
			refreshSoon();
		}
	}

	function runSetup( rec ) {
		try {
			setup( rec );
		} catch ( e ) {
			log( 'Setup failed', rec.el, e );
			rec.targets.forEach( restoreInline );
			rec.inert = true;
			unhide( rec.el );
		}
	}

	// Records waiting for their (not yet rendered) element to be shown.
	var waiting = new Map();
	var setupWait = window.ResizeObserver ? new ResizeObserver( function ( entries ) {
		entries.forEach( function ( entry ) {
			var rec = waiting.get( entry.target );
			if ( ! rec || ! ( entry.contentRect.width || entry.contentRect.height || entry.target.getClientRects().length ) ) {
				return;
			}
			setupWait.unobserve( entry.target );
			waiting.delete( entry.target );
			// Gone, or already shown meanwhile (printed, BricksMotion.play()): never hide it again.
			if ( ! records.has( rec ) || rec.played ) {
				return;
			}
			// Measure the design now that it is rendered (no start styles have been written yet).
			rec.targets.forEach( function ( t ) {
				var prev = [ t.style.getPropertyValue( 'transition' ), t.style.getPropertyPriority( 'transition' ) ];
				t.style.setProperty( 'transition', 'none', 'important' );
				var hidden = t.hasAttribute( 'data-bme-hide' );
				unhide( t );
				resting.set( t, readRest( t ) );
				if ( hidden && t !== rec.el ) {
					t.setAttribute( 'data-bme-hide', '' );
				}
				if ( prev[ 0 ] ) {
					t.style.setProperty( 'transition', prev[ 0 ], prev[ 1 ] );
				} else {
					t.style.removeProperty( 'transition' );
				}
			} );
			runSetup( rec );
			sweep();
		} );
	} ) : null;

	function destroy( el, keepThree ) {
		undoMarquee( el );
		if ( waiting.has( el ) ) {
			waiting.delete( el );
			setupWait.unobserve( el );
		}
		var rec = byEl.get( el );
		if ( rec && ! rec.skipped ) {
			unwatch( rec );
			// Detach the control first: reverting resolves its `finished` promise, and the completion
			// handler must not run finish() (a second revert) after we restored the inline styles.
			var ctrl = rec.ctrl;
			rec.ctrl = null;
			rec.busy = false;
			if ( ctrl && ctrl.revert ) {
				try {
					ctrl.revert();
				} catch ( e ) {
					log( e );
				}
			}
			if ( rec.split ) {
				rec.split.revert();
			}
			clearTimeout( rec.watchdog );
			if ( rec.numberNode ) {
				rec.numberNode.nodeValue = rec.numberOriginal;
				rec.el.style.removeProperty( 'font-variant-numeric' );
			}
			if ( rec.paths ) {
				rec.paths.forEach( function ( sv ) {
					sv.style.removeProperty( 'stroke-dasharray' );
					sv.style.removeProperty( 'stroke-dashoffset' );
				} );
			}
			if ( sizeWatcher ) {
				sizeWatcher.unobserve( rec.el );
			}
			rec.targets.forEach( function ( t ) {
				restoreInline( t );
				claimed.delete( t );
			} );
			records.delete( rec );
		}
		byEl.delete( el );
		if ( ! keepThree ) {
			destroyThree( el );
		}
		unhide( el );
	}

	var refreshSoon = debounce( function () {
		Object.keys( adapters ).forEach( function ( k ) {
			if ( adapters[ k ].refresh ) {
				adapters[ k ].refresh();
			}
		} );
		emit( 'bme:refresh', {} );
	}, 150 );

	/* ------------------------------------------------------------------
	 * Bricks integration (AJAX query loops, filters, popups, accordions, tabs)
	 * ---------------------------------------------------------------- */

	// Timelines that only arrived with AJAX content (a popup, a filtered loop): load their script.
	var timelineRequested = false;
	function needTimeline() {
		if ( timelineRequested || window.BricksMotionTimeline || ! cfg.timeline || ! cfg.timeline.src || ! document.querySelector( '[data-bme-tl]' ) ) {
			if ( window.BricksMotionTimeline ) {
				window.BricksMotionTimeline.scan();
			}
			return;
		}
		timelineRequested = true;
		window.BME_TL = window.BME_TL || { reduced: cfg.timeline.reduced, minWidth: cfg.timeline.minWidth };
		var s = document.createElement( 'script' );
		s.src = cfg.timeline.src;
		s.async = true;
		s.onerror = function () {
			toArray( document.querySelectorAll( '[data-bme-tl-hide]' ) ).forEach( function ( el ) {
				el.removeAttribute( 'data-bme-tl-hide' ); // blocked or missing: show the content as designed
			} );
		};
		document.head.appendChild( s );
	}

	function bindBricks() {
		needTimeline(); // content rendered after the page decided which scripts to load
		var rescan = debounce( function () {
			scan( document );
			needTimeline();
		}, 30 );

		[ 'bricks/ajax/nodes_added', 'bricks/ajax/query_result/displayed', 'bricks/ajax/load_page/completed', 'bricks/ajax/pagination/completed', 'bricks/ajax/popup/loaded' ].forEach( function ( evt ) {
			document.addEventListener( evt, rescan );
		} );

		[ 'bricks/accordion/open', 'bricks/accordion/close', 'bricks/tabs/changed' ].forEach( function ( evt ) {
			document.addEventListener( evt, refreshSoon );
		} );

		// Keyboard users must never land on invisible content: reveal on focus immediately.
		document.addEventListener( 'focusin', function ( e ) {
			var node = e.target;
			while ( node && node !== document.body ) {
				var rec = byEl.get( node );
				if ( rec && ! rec.skipped && ! rec.played && ! rec.inert && ! rec.persistent && /^(reveal|text|draw|counter)$/.test( rec.kind ) ) {
					if ( ! rec.cfg.replay ) {
						unwatch( rec );
					}
					finish( rec );
				}
				node = node.parentElement;
			}
		} );

		// Popups: replay the content animations every time the popup opens.
		document.addEventListener( 'bricks/popup/close', function ( e ) {
			var popup = e.detail && e.detail.popupElement;
			if ( ! popup || ! cfg.popups ) {
				return;
			}
			records.forEach( function ( rec ) {
				if ( rec.played && ! rec.persistent && rec.kind !== 'loop' && popup.contains( rec.el ) ) {
					reset( rec );
				}
			} );
		} );

		// Remove records for nodes taken out of the DOM (AJAX filters replacing results).
		if ( window.MutationObserver ) {
			var cleanup = debounce( function () {
				records.forEach( function ( rec ) {
					if ( ! rec.el.isConnected ) {
						destroy( rec.el );
					}
				} );
				threeHosts.forEach( function ( host ) {
					if ( ! host.isConnected ) {
						destroyThree( host );
					}
				} );
			}, 200 );
			var added = [];
			var scanAdded = debounce( function () {
				var roots = added.splice( 0 ).filter( function ( node ) {
					return node.isConnected;
				} );
				roots.forEach( function ( node ) {
					scan( node );
				} );
			}, 60 );
			var RELEVANT = '[data-bme], [class*="bme-"], [data-bme-3d], [data-bme-hover], [data-bme-hide], [data-bme-tl], [' + INLINE_ATTR + ']';
			new MutationObserver( function ( mutations ) {
				var removed = false;
				for ( var i = 0; i < mutations.length; i++ ) {
					var m = mutations[ i ];
					if ( m.removedNodes.length ) {
						removed = true;
					}
					for ( var j = 0; j < m.addedNodes.length; j++ ) {
						var node = m.addedNodes[ j ];
						// Content injected by other scripts (filters, lightboxes, custom fetch):
						// initialize it even when no Bricks event fires. Our own split spans are ignored.
						if ( node.nodeType === 1 && ! ( node.classList && /(^|\s)bme-(word|char|mask|sr-only|3d-canvas)/.test( node.className ) ) && ( node.matches( RELEVANT ) || node.querySelector( RELEVANT ) ) ) {
							added.push( node );
						}
					}
				}
				if ( removed ) {
					cleanup();
				}
				if ( added.length ) {
					scanAdded();
				}
			} ).observe( document.body, { childList: true, subtree: true } );
		}
	}

	/* ------------------------------------------------------------------
	 * Boot
	 * ---------------------------------------------------------------- */

	function start() {
		if ( started ) {
			return;
		}
		started = true;

		if ( ! ( 'IntersectionObserver' in window ) ) {
			api.started = true;
			toArray( document.querySelectorAll( '[data-bme-hide]' ) ).forEach( unhide );
			return;
		}

		// The boot fail-safe only stands down once the first scan completed: if anything throws
		// here, it still reveals the page.
		try {
			scan( document );
			bindBricks();
		} catch ( e ) {
			log( 'Start failed, showing all content', e );
			html.classList.add( 'bme-failsafe' );
			toArray( document.querySelectorAll( '[data-bme-hide]' ) ).forEach( unhide );
		}
		api.started = true;

		// Safety net for content that is still marked hidden but never got a record (inserted by a
		// script the MutationObserver could not see): pick it up, or show it.
		var orphans = function () {
			toArray( document.querySelectorAll( '[data-bme-hide]' ) ).forEach( function ( el ) {
				if ( byEl.has( el ) ) {
					return;
				}
				try {
					scan( el );
				} catch ( e ) {
					log( e );
				}
				if ( ! byEl.has( el ) ) {
					unhide( el );
				}
			} );
		};
		setTimeout( orphans, ( cfg.failsafe || 3000 ) + 2500 );
		window.addEventListener( 'load', function () {
			setTimeout( orphans, 1500 );
		} );

		window.addEventListener( 'load', refreshSoon );
		// Capture on the document: also catches pages that scroll a wrapper instead of the window.
		document.addEventListener( 'scroll', sweepWhileScrolling, { passive: true, capture: true } );
		window.addEventListener( 'load', sweep );
		setTimeout( sweep, 400 );
		// The built-in engine stores the designed transform as pixels (translate(-50%) → a matrix):
		// after fonts load or the width changes, set its running loops up again from the new design.
		var relayLoops = function () {
			var redo = [];
			records.forEach( function ( rec ) {
				if ( rec.kind === 'loop' && rec.engine === nativeAdapter && ! rec.inert && rec.targets.some( function ( t ) {
					return restOf( t ) && restOf( t ).t;
				} ) ) {
					redo.push( rec );
				}
			} );
			redo.forEach( function ( rec ) {
				var ts = rec.targets.slice();
				destroy( rec.el, true );
				ts.forEach( function ( t ) {
					resting.delete( t );
				} );
				scan( rec.el );
			} );
		};
		var loopWidth = window.innerWidth;
		window.addEventListener( 'resize', debounce( function () {
			if ( window.innerWidth !== loopWidth ) {
				loopWidth = window.innerWidth;
				relayLoops();
			}
		}, 250 ) );
		if ( document.fonts && document.fonts.ready ) {
			if ( document.fonts.status !== 'loaded' ) {
				document.fonts.ready.then( relayLoops ); // only if a font swap could have moved them
			}
			document.fonts.ready.then( refreshSoon );
		}

		// Page height changes (lazy images, accordions sliding open, AJAX content, fonts) move every
		// trigger below them: recalculate once the height settles.
		if ( window.ResizeObserver && document.body ) {
			var lastHeight = 0;
			new ResizeObserver( function () {
				var h = html.scrollHeight;
				if ( Math.abs( h - lastHeight ) > 2 ) {
					lastHeight = h;
					refreshSoon();
					sweep();
				}
			} ).observe( document.body );
		}

		// Printing / "Save as PDF": everything not yet revealed would print blank.
		window.addEventListener( 'beforeprint', function () {
			records.forEach( function ( rec ) {
				if ( ! rec.skipped && ( ! rec.played || rec.busy ) && ! rec.inert && ! rec.persistent && /^(reveal|text|draw|counter)$/.test( rec.kind ) ) {
					unwatch( rec );
					finish( rec );
				}
			} );
		} );

		// Visitor turns on "reduce motion" while the page is open: show everything, stop all motion.
		var onReducedChange = function () {
			// "Ignore reduced motion": the visitor's setting changes nothing, now or on reload.
			if ( ! mqReduced.matches || cfg.reduced === 'ignore' ) {
				return;
			}
			var stop = [];
			var refade = [];
			records.forEach( function ( rec ) {
				// "No animation": stop everything. "Gentle fades": stop what keeps moving, and
				// turn reveals that have not played yet into fades.
				if ( motionOff() || /^(loop|scrub|pin)$/.test( rec.kind ) ) {
					stop.push( rec.el );
				} else if ( fadeOnly() && ! rec.skipped && ! rec.played && ! rec.busy && ! rec.fade && ! rec.inert && /^(reveal|text|draw)$/.test( rec.kind ) ) {
					refade.push( rec.el );
				}
			} );
			stop.forEach( function ( el ) {
				destroy( el, true ); // 3D backgrounds are re-mounted below, as a still frame
			} );
			refade.forEach( function ( el ) {
				destroy( el, true );
				scan( el ); // set up again, now as a fade (same task: nothing is painted between)
			} );
			if ( motionOff() ) {
				toArray( document.querySelectorAll( '[data-bme-hide]' ) ).forEach( unhide );
			}
			// Running WebGL scenes get the still frame they would have had on load (both modes).
			toArray( threeHosts ).forEach( function ( el ) {
				if ( el.__bme3d && el.__bme3d.state === 'mounted' ) {
					destroyThree( el );
					setupThree( el );
				}
			} );
			emit( 'bme:reduced', {} );
		};
		if ( mqReduced.addEventListener ) {
			mqReduced.addEventListener( 'change', onReducedChange );
		} else if ( mqReduced.addListener ) {
			mqReduced.addListener( onReducedChange );
		}

		emit( 'bme:ready', { engines: Object.keys( adapters ), animations: records.size, config: cfg } );
		log( 'Ready', { engines: Object.keys( adapters ), animations: records.size } );
	}

	/** Element(s) from an element, selector, NodeList/array, or Bricks' %brx% { target, targets }. */
	function resolveTargets( t ) {
		if ( ! t ) {
			return [];
		}
		if ( t.nodeType === 1 ) {
			return [ t ];
		}
		if ( typeof t === 'string' ) {
			try {
				return toArray( document.querySelectorAll( t ) );
			} catch ( e ) {
				return [];
			}
		}
		if ( t.target && t.target.nodeType === 1 ) {
			return [ t.target ];
		}
		if ( t.targets ) {
			return resolveTargets( t.targets );
		}
		if ( typeof t.length === 'number' ) {
			return toArray( t ).filter( function ( n ) {
				return n && n.nodeType === 1;
			} );
		}
		return [];
	}

	var api = {
		version: cfg.version || '1.0.0',
		started: false,
		config: cfg,
		presets: presets,
		adapters: adapters,
		// Globals that existed before our libraries loaded (another plugin's copy), so adapters can
		// hand them back instead of leaving our version in their place.
		foreign: { anime: window.anime, lenis: window.lenis, motion: window.Motion },
		registerAdapter: registerAdapter,
		refresh: function ( root ) {
			scan( root || document );
			refreshSoon();
		},
		/**
		 * Play (or replay) animations. Accepts an element, a CSS selector, a list, or the %brx%
		 * object Bricks Interactions pass to "JavaScript (Function)": use BricksMotion.play there.
		 */
		play: function ( target ) {
			resolveTargets( target ).forEach( function ( el ) {
				var rec = byEl.get( el );
				if ( ! rec || rec.skipped || rec.inert || rec.persistent ) {
					return;
				}
				if ( rec.kind === 'loop' ) {
					resumeLoop( rec ); // loops run continuously; play() just (re)starts one
					return;
				}
				if ( ! /^(reveal|text|draw|counter)$/.test( rec.kind ) ) {
					return; // scroll-linked, pinned: driven by scrolling, not by play()
				}
				if ( rec.played ) {
					reset( rec );
				}
				if ( ! rec.cfg.replay ) {
					unwatch( rec );
				}
				safePlay( rec, 0 );
			} );
		},
		/** Return elements to their start state, ready to play again (e.g. BricksMotion.reset on close). */
		reset: function ( target ) {
			resolveTargets( target ).forEach( function ( el ) {
				var rec = byEl.get( el );
				if ( rec && ! rec.skipped && ! rec.persistent && rec.played && /^(reveal|text|draw|counter)$/.test( rec.kind ) ) {
					reset( rec );
					if ( rec.cfg.trigger === 'manual' ) {
						unwatch( rec );
					}
				}
			} );
		},
		destroy: destroy,
		on: function ( name, fn ) {
			( listeners[ name ] = listeners[ name ] || [] ).push( fn );
		},
		util: {
			splitText: splitText,
			applyStyle: applyStyle,
			clipCSS: clipCSS,
			ease: EASE_FN,
			log: log,
			motionOff: motionOff,
		},
	};

	window.BricksMotion = api;

	// Deferred scripts (runtime, libraries, adapters) all execute before DOMContentLoaded, so
	// starting there guarantees every engine has registered. Late injection: start right away.
	if ( document.readyState === 'complete' ) {
		setTimeout( start, 0 );
	} else {
		document.addEventListener( 'DOMContentLoaded', start );
		window.addEventListener( 'load', start );
	}
} )( window, document );
