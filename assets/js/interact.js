/**
 * Bricks Motion Studio — pointer and scroll extras (loaded only on pages that use them).
 *
 * - data-bme-mouse='{"s":24,"a":"section"}'  moves with the pointer: up to s px (negative: the
 *   other way), across the page or while the pointer is over its section. Layers with different
 *   amounts give depth. Uses the individual `translate` property, so it adds to any transform.
 * - data-bme-hover="roll"  the text's letters roll up and are replaced by a copy on hover / focus.
 * - data-bme-follow='{"src":"…","w":280}'  an image follows the pointer while it is over the
 *   element (a list of projects or services with a preview).
 * - data-bme-inview='{"c":"is-inview","r":1,"o":15}'  adds a class when the element reaches the
 *   start line (o % above the bottom of the screen); r: remove it again when it leaves.
 * - data-bme-skew="6"  skews up to 6deg with the scroll speed and settles back when scrolling stops.
 *
 * Pointer effects only run on devices that can hover with a fine pointer. Reduced motion: no
 * movement (the in-view class still applies: what it changes is your CSS). "Turn off on"
 * (data-bme-off-on="phone tablet desktop") stops the moving ones on those screen sizes, also
 * after a resize across a breakpoint (same breakpoints as the runtime).
 *
 * @package BricksMotionStudio
 */
( function ( w, d ) {
	'use strict';

	if ( w.BricksMotionInteract ) {
		return;
	}
	var mq = function ( q ) {
		return w.matchMedia ? w.matchMedia( q ) : { matches: false, addEventListener: function () {} };
	};
	var reduceQuery = mq( '(prefers-reduced-motion: reduce)' );
	var fineQuery = mq( '(hover: hover) and (pointer: fine)' );
	var reduced = function () {
		return reduceQuery.matches || /[?&]bme-reduce=1\b/.test( w.location.search );
	};
	var toArray = function ( l ) {
		return Array.prototype.slice.call( l || [] );
	};
	var parse = function ( v ) {
		try {
			var o = JSON.parse( v || '{}' );
			return o && typeof o === 'object' ? o : {};
		} catch ( e ) {
			return {};
		}
	};
	var num = function ( v, def, lo, hi ) {
		var n = parseFloat( v );
		return isFinite( n ) ? Math.max( lo, Math.min( hi, n ) ) : def;
	};
	var bound = new WeakSet();
	// "Turn off on" this screen size (the element shows as designed there).
	var band = function () {
		var vw = w.innerWidth;
		return vw < 768 ? 'phone' : vw < 992 ? 'tablet' : 'desktop';
	};
	var offHere = function ( el ) {
		var list = el.getAttribute( 'data-bme-off-on' );
		return !! list && ( ' ' + list + ' ' ).indexOf( ' ' + band() + ' ' ) !== -1;
	};
	var raf = w.requestAnimationFrame ? w.requestAnimationFrame.bind( w ) : function ( f ) {
		return setTimeout( f, 16 );
	};

	/* ---------- mouse move layers ----------------------------------------- */

	var layers = [];
	var px = -1;
	var py = -1;
	var moving = false;

	function areaOf( el, a ) {
		return a === 'section' ? el.closest( 'section, .brxe-section' ) || el.parentElement : null;
	}

	function addLayer( el ) {
		// Bricks' element parallax and the magnetic hover drive `translate` too: theirs wins.
		if ( el.hasAttribute( 'data-brx-motion-parallax' ) || el.getAttribute( 'data-bme-hover' ) === 'magnetic' ) {
			return;
		}
		var o = parse( el.getAttribute( 'data-bme-mouse' ) );
		var s = num( o.s, 20, -200, 200 );
		if ( ! s ) {
			return;
		}
		layers.push( { el: el, s: s, area: areaOf( el, o.a ), cx: 0, cy: 0, tx: 0, ty: 0, inline: el.style.translate || '' } );
	}

	function layerTargets() {
		var vw = w.innerWidth || 1;
		var vh = w.innerHeight || 1;
		layers.forEach( function ( L ) {
			var fx = 0;
			var fy = 0;
			if ( px >= 0 && ! reduced() && ! offHere( L.el ) ) {
				if ( L.area ) {
					var r = L.area.getBoundingClientRect();
					if ( px >= r.left && px <= r.right && py >= r.top && py <= r.bottom && r.width && r.height ) {
						fx = ( px - ( r.left + r.width / 2 ) ) / ( r.width / 2 );
						fy = ( py - ( r.top + r.height / 2 ) ) / ( r.height / 2 );
					}
				} else {
					fx = ( px - vw / 2 ) / ( vw / 2 );
					fy = ( py - vh / 2 ) / ( vh / 2 );
				}
			}
			L.tx = fx * L.s;
			L.ty = fy * L.s;
		} );
	}

	function layerFrame() {
		var busy = false;
		layers.forEach( function ( L ) {
			if ( ! L.el.isConnected ) {
				return;
			}
			L.cx += ( L.tx - L.cx ) * 0.1;
			L.cy += ( L.ty - L.cy ) * 0.1;
			var settled = Math.abs( L.tx - L.cx ) < 0.05 && Math.abs( L.ty - L.cy ) < 0.05;
			if ( settled && ! L.tx && ! L.ty ) {
				L.cx = L.cy = 0;
				if ( L.inline ) {
					L.el.style.translate = L.inline;
				} else {
					L.el.style.removeProperty( 'translate' );
				}
				return;
			}
			L.el.style.translate = L.cx.toFixed( 2 ) + 'px ' + L.cy.toFixed( 2 ) + 'px';
			busy = busy || ! settled;
		} );
		moving = busy;
		if ( busy ) {
			raf( layerFrame );
		}
	}

	function kickLayers() {
		layerTargets();
		if ( ! moving ) {
			moving = true;
			raf( layerFrame );
		}
	}

	function onPointer( e ) {
		if ( e.pointerType === 'touch' ) {
			return;
		}
		px = e.clientX;
		py = e.clientY;
		kickLayers();
	}

	/* ---------- text roll on hover ---------------------------------------- */

	// Joined scripts lose their letter shapes when split; right-to-left text comes out reordered.
	var NO_SPLIT = /[֐-ࣿיִ-﷿ﹰ-﻿ऀ-෿฀-࿿က-႟]/;

	function roll( el ) {
		if ( reduced() || el.__bmeRoll || offHere( el ) ) {
			return;
		}
		// Its own entrance animation still to come or playing (split words, a fade): it owns the
		// text and the transform until then; the roll is set up once it has finished.
		if ( el.getAttribute( 'data-bme-state' ) === 'ready' ) {
			if ( ! el.__bmeRollWait ) {
				el.__bmeRollWait = true;
				el.addEventListener( 'bme:complete', function once( e ) {
					if ( e.target === el ) {
						el.removeEventListener( 'bme:complete', once );
						roll( el );
					}
				} );
			}
			return;
		}
		var label = el.textContent.replace( /\s+/g, ' ' ).trim();
		if ( ! label || label.length > 80 || NO_SPLIT.test( label ) ) {
			return;
		}
		var nodes = [];
		var walker = d.createTreeWalker( el, NodeFilter.SHOW_TEXT, null );
		while ( walker.nextNode() ) {
			if ( walker.currentNode.nodeValue.trim() && ! walker.currentNode.parentNode.closest( 'svg, .bme-sr-only, script, style' ) ) {
				nodes.push( walker.currentNode );
			}
		}
		if ( ! nodes.length ) {
			return;
		}
		var i = 0;
		var done = [];
		nodes.forEach( function ( node ) {
			var wrap = d.createElement( 'span' );
			wrap.className = 'bme-roll';
			wrap.setAttribute( 'aria-hidden', 'true' );
			node.nodeValue.split( /(\s+)/ ).forEach( function ( part ) {
				if ( ! part ) {
					return;
				}
				if ( /^\s+$/.test( part ) ) {
					wrap.appendChild( d.createTextNode( part ) );
					return;
				}
				// One word stays together on a line: its letters sit in a no-wrap group.
				var word = d.createElement( 'span' );
				word.className = 'bme-roll-w';
				Array.from( part ).forEach( function ( ch ) {
					var c = d.createElement( 'span' );
					c.className = 'bme-roll-c';
					var inner = d.createElement( 'span' );
					inner.className = 'bme-roll-i';
					inner.setAttribute( 'data-c', ch );
					inner.style.setProperty( '--bme-i', String( i++ ) );
					inner.textContent = ch;
					c.appendChild( inner );
					word.appendChild( c );
				} );
				wrap.appendChild( word );
			} );
			var sr = d.createElement( 'span' );
			sr.className = 'bme-sr-only';
			sr.textContent = node.nodeValue;
			node.parentNode.insertBefore( sr, node );
			node.parentNode.replaceChild( wrap, node );
			done.push( [ node, wrap, sr ] );
		} );
		el.classList.add( 'bme-roll-on' );
		el.__bmeRoll = function () {
			done.forEach( function ( x ) {
				if ( x[ 1 ].parentNode ) {
					x[ 1 ].parentNode.replaceChild( x[ 0 ], x[ 1 ] );
				}
				if ( x[ 2 ].parentNode ) {
					x[ 2 ].parentNode.removeChild( x[ 2 ] );
				}
			} );
			el.classList.remove( 'bme-roll-on' );
			el.__bmeRoll = null;
		};
	}

	/* ---------- image that follows the pointer ----------------------------- */

	var follower = null;

	function followerEl() {
		if ( ! follower ) {
			var img = d.createElement( 'img' );
			img.className = 'bme-follow';
			img.alt = '';
			img.setAttribute( 'aria-hidden', 'true' );
			img.decoding = 'async';
			d.body.appendChild( img );
			follower = { img: img, x: 0, y: 0, tx: 0, ty: 0, on: false, owner: null, running: false };
		}
		return follower;
	}

	function followFrame() {
		var f = follower;
		f.x += ( f.tx - f.x ) * 0.16;
		f.y += ( f.ty - f.y ) * 0.16;
		var tilt = Math.max( -8, Math.min( 8, ( f.tx - f.x ) * 0.06 ) );
		f.img.style.transform = 'translate(' + f.x.toFixed( 1 ) + 'px, ' + f.y.toFixed( 1 ) + 'px) translate(-50%, -50%) rotate(' + tilt.toFixed( 2 ) + 'deg)';
		if ( f.on || Math.abs( f.tx - f.x ) > 0.3 || Math.abs( f.ty - f.y ) > 0.3 ) {
			raf( followFrame );
		} else {
			f.running = false;
		}
	}

	function addFollow( el ) {
		var o = parse( el.getAttribute( 'data-bme-follow' ) );
		var src = typeof o.src === 'string' ? o.src : '';
		if ( ! /^(https?:)?\/\//i.test( src ) && src.charAt( 0 ) !== '/' ) {
			return;
		}
		var width = num( o.w, 280, 60, 800 );
		var enter = function ( e ) {
			if ( e.pointerType === 'touch' || reduced() || ! fineQuery.matches || offHere( el ) ) {
				return;
			}
			var f = followerEl();
			if ( f.img.getAttribute( 'src' ) !== src ) {
				f.img.src = src;
			}
			f.img.style.width = width + 'px';
			f.owner = el;
			if ( ! f.on && ! f.running ) {
				f.x = f.tx = e.clientX;
				f.y = f.ty = e.clientY;
			}
			f.on = true;
			f.img.classList.add( 'is-on' );
			if ( ! f.running ) {
				f.running = true;
				raf( followFrame );
			}
		};
		var move = function ( e ) {
			if ( follower && follower.owner === el ) {
				follower.tx = e.clientX;
				follower.ty = e.clientY;
			}
		};
		var leave = function () {
			if ( follower && follower.owner === el ) {
				follower.on = false;
				follower.img.classList.remove( 'is-on' );
			}
		};
		el.addEventListener( 'pointerenter', enter );
		el.addEventListener( 'pointermove', move );
		el.addEventListener( 'pointerleave', leave );
	}

	/* ---------- class when in view ---------------------------------------- */

	var inviewObservers = {};

	function addInview( el ) {
		var o = parse( el.getAttribute( 'data-bme-inview' ) );
		var cls = String( o.c || 'is-inview' ).replace( /[^A-Za-z0-9_-]/g, '' ) || 'is-inview';
		var off = num( o.o, 15, 0, 50 );
		var key = String( off );
		el.__bmeInview = { c: cls, r: !! o.r };
		if ( ! ( 'IntersectionObserver' in w ) ) {
			el.classList.add( cls );
			return;
		}
		if ( ! inviewObservers[ key ] ) {
			inviewObservers[ key ] = new IntersectionObserver(
				function ( entries ) {
					entries.forEach( function ( entry ) {
						var t = entry.target;
						var c = t.__bmeInview;
						if ( ! c ) {
							return;
						}
						if ( entry.isIntersecting ) {
							t.classList.add( c.c );
							if ( ! c.r ) {
								inviewObservers[ key ].unobserve( t );
							}
						} else if ( c.r && t.classList.contains( c.c ) ) {
							t.classList.remove( c.c );
						}
					} );
				},
				{ rootMargin: '0px 0px -' + off + '% 0px', threshold: 0 }
			);
		}
		inviewObservers[ key ].observe( el );
	}

	/* ---------- skew with scroll speed ------------------------------------- */

	var skews = [];
	var lastY = w.scrollY;
	var lastT = 0;
	var speed = 0;
	var skewing = false;

	function addSkew( el ) {
		var max = num( el.getAttribute( 'data-bme-skew' ), 6, 0, 20 );
		if ( max ) {
			skews.push( { el: el, max: max, cur: 0, inline: null } );
		}
	}

	function skewFrame() {
		speed *= 0.9; // eases back when scrolling stops
		var still = Math.abs( speed ) < 0.002;
		skews.forEach( function ( S ) {
			var el = S.el;
			// Still waiting for (or playing) its own entrance: that animation owns the transform.
			if ( ! el.isConnected || el.getAttribute( 'data-bme-state' ) === 'ready' ) {
				return;
			}
			var target = still || reduced() || offHere( el ) ? 0 : Math.max( -S.max, Math.min( S.max, speed * 4 * S.max ) );
			S.cur += ( target - S.cur ) * 0.2;
			if ( Math.abs( S.cur ) < 0.01 && ! target ) {
				if ( S.inline !== null ) {
					if ( S.inline ) {
						el.style.transform = S.inline;
					} else {
						el.style.removeProperty( 'transform' );
					}
					S.inline = null;
				}
				S.cur = 0;
				return;
			}
			if ( S.inline === null ) {
				S.inline = el.style.transform || '';
				var designed = w.getComputedStyle( el ).transform;
				S.base = designed && designed !== 'none' ? designed + ' ' : '';
			}
			el.style.transform = S.base + 'skewY(' + S.cur.toFixed( 3 ) + 'deg)';
		} );
		var busy = ! still || skews.some( function ( S ) {
			return S.inline !== null;
		} );
		skewing = busy;
		if ( busy ) {
			raf( skewFrame );
		}
	}

	function onScroll() {
		var now = w.performance ? w.performance.now() : Date.now();
		var dt = Math.max( 8, now - lastT );
		var dy = w.scrollY - lastY;
		lastY = w.scrollY;
		lastT = now;
		// A jump (anchor link, back to top) is not motion the visitor sees: no lean for it.
		if ( Math.abs( dy ) > ( w.innerHeight || 800 ) * 1.5 ) {
			return;
		}
		// px per ms, smoothed.
		speed = speed * 0.6 + Math.max( -6, Math.min( 6, dy / dt ) ) * 0.4;
		if ( skews.length && ! skewing ) {
			skewing = true;
			raf( skewFrame );
		}
	}

	/* ---------- scan ------------------------------------------------------ */

	function scan( root ) {
		root = root || d;
		var each = function ( sel, fn ) {
			var list = toArray( root.querySelectorAll( sel ) );
			if ( root !== d && root.matches && root.matches( sel ) ) {
				list.unshift( root );
			}
			list.forEach( function ( el ) {
				var key = sel;
				el.__bmeInteract = el.__bmeInteract || {};
				if ( ! el.__bmeInteract[ key ] ) {
					el.__bmeInteract[ key ] = true;
					fn( el );
				}
			} );
		};
		each( '[data-bme-inview]', addInview );
		each( '[data-bme-skew]', addSkew );
		if ( fineQuery.matches ) {
			each( '[data-bme-mouse]', addLayer );
			each( '[data-bme-hover="roll"]', roll );
			each( '[data-bme-follow]', addFollow );
		}
		if ( ! bound.has( w ) ) {
			bound.add( w );
			w.addEventListener( 'pointermove', onPointer, { passive: true } );
			d.documentElement.addEventListener( 'pointerleave', function () {
				px = py = -1;
				kickLayers();
			} );
			w.addEventListener( 'scroll', onScroll, { passive: true } );
			var lastBand = band();
			w.addEventListener( 'resize', function () {
				if ( band() === lastBand ) {
					return;
				}
				lastBand = band();
				kickLayers();
				toArray( d.querySelectorAll( '[data-bme-hover="roll"][data-bme-off-on]' ) ).forEach( function ( el ) {
					if ( offHere( el ) ) {
						if ( el.__bmeRoll ) {
							el.__bmeRoll();
						}
					} else if ( fineQuery.matches ) {
						roll( el );
					}
				} );
				if ( follower && follower.owner && offHere( follower.owner ) ) {
					follower.on = false;
					follower.img.classList.remove( 'is-on' );
				}
			} );
			reduceQuery.addEventListener && reduceQuery.addEventListener( 'change', function () {
				kickLayers();
				if ( reduced() ) {
					toArray( d.querySelectorAll( '.bme-roll-on' ) ).forEach( function ( el ) {
						if ( el.__bmeRoll ) {
							el.__bmeRoll();
						}
					} );
				}
			} );
		}
	}

	function start() {
		scan( d );
		// Content added later (load more, filters, popups).
		if ( w.MutationObserver ) {
			var pending = null;
			new MutationObserver( function ( list ) {
				var add = false;
				list.forEach( function ( m ) {
					add = add || m.addedNodes.length > 0;
				} );
				if ( add && ! pending ) {
					pending = setTimeout( function () {
						pending = null;
						scan( d );
					}, 80 );
				}
			} ).observe( d.body, { childList: true, subtree: true } );
		}
	}

	w.BricksMotionInteract = { scan: scan };
	if ( d.readyState === 'loading' ) {
		d.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
} )( window, document );
