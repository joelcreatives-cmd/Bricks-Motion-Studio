/* Motion Studio settings screen */
( function () {
	'use strict';

	var data = window.BME_ADMIN || {};
	var presets = data.presets || {};
	var i18n = data.i18n || {};
	var form = document.getElementById( 'bme-form' );
	if ( ! form ) {
		return;
	}
	var reduce = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	var isMac = /Mac|iPhone|iPad/.test( navigator.platform || navigator.userAgent );

	function $( sel, root ) {
		return ( root || document ).querySelector( sel );
	}
	function $$( sel, root ) {
		return Array.prototype.slice.call( ( root || document ).querySelectorAll( sel ) );
	}
	function val( path ) {
		var name = 'bme_settings[' + path.split( '.' ).join( '][' ) + ']';
		var els = $$( '[name="' + name + '"]', form );
		var out = null;
		els.forEach( function ( el ) {
			if ( el.type === 'checkbox' ) {
				out = el.checked;
			} else if ( el.type === 'radio' ) {
				if ( el.checked ) {
					out = el.value;
				}
			} else if ( el.type !== 'hidden' || out === null ) {
				out = el.value;
			}
		} );
		return out;
	}

	/* Navigation ---------------------------------------------------------- */

	var navItems = $$( '[data-bme-nav]' );
	var panels = $$( '[data-bme-panel]' );
	var panelIds = panels.map( function ( p ) {
		return p.getAttribute( 'data-bme-panel' );
	} );

	function show( id, focus ) {
		// Compare against known ids (never build a selector from the URL hash).
		if ( panelIds.indexOf( id ) === -1 ) {
			id = 'libraries';
		}
		panels.forEach( function ( p ) {
			p.hidden = p.getAttribute( 'data-bme-panel' ) !== id;
		} );
		navItems.forEach( function ( a ) {
			if ( a.getAttribute( 'data-bme-nav' ) === id ) {
				a.setAttribute( 'aria-current', 'page' );
			} else {
				a.removeAttribute( 'aria-current' );
			}
		} );
		if ( focus ) {
			var target = panels.filter( function ( p ) {
				return p.getAttribute( 'data-bme-panel' ) === id;
			} )[ 0 ];
			var h = target && $( 'h2', target );
			if ( h ) {
				h.setAttribute( 'tabindex', '-1' );
				h.focus( { preventScroll: true } );
			}
			// Switching sections from further down the page opens the new one at its top.
			var app = $( '.bme-app' );
			var top = app ? app.getBoundingClientRect().top : 0;
			if ( top < 0 ) {
				window.scrollTo( 0, window.scrollY + top - 40 );
			}
		}
	}

	navItems.forEach( function ( a ) {
		a.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			var id = a.getAttribute( 'data-bme-nav' );
			history.replaceState( null, '', '#' + id );
			show( id, true );
		} );
	} );
	show( ( location.hash || '#libraries' ).slice( 1 ), false );
	// A one-time notice (imported, reset, import failed) must not come back on refresh.
	if ( /[?&]bme_notice=/.test( location.search ) ) {
		var clean = new URL( location.href );
		clean.searchParams.delete( 'bme_notice' );
		history.replaceState( null, '', clean.pathname + clean.search + clean.hash );
	}
	window.addEventListener( 'hashchange', function () {
		show( ( location.hash || '#libraries' ).slice( 1 ), true );
	} );

	/* Dirty state + save --------------------------------------------------- */

	var saveBtn = $( '[data-bme-save]' );
	var stateEl = $( '[data-bme-state]' );
	var kbd = $( '[data-bme-kbd]' );
	var dirty = false;
	var snapshot = function () {
		return new URLSearchParams( new FormData( form ) ).toString();
	};
	var initial = ''; // Taken after the first sync() (end of file), so load-time adjustments never count as edits.

	if ( kbd ) {
		kbd.textContent = isMac ? '⌘S' : 'Ctrl S';
	}

	function checkDirty() {
		dirty = snapshot() !== initial;
		saveBtn.disabled = ! dirty;
		stateEl.textContent = dirty ? i18n.unsaved : i18n.saved;
		stateEl.classList.toggle( 'is-dirty', dirty );
	}

	form.addEventListener( 'input', function () {
		checkDirty();
		sync();
	} );
	form.addEventListener( 'change', function () {
		checkDirty();
		sync();
	} );
	form.addEventListener( 'submit', function () {
		dirty = false;
		// Come back to the same panel after saving (options.php redirects to the referer).
		var ref = form.querySelector( 'input[name="_wp_http_referer"]' );
		if ( ref && location.hash && /^#[a-z0-9-]+$/.test( location.hash ) ) {
			ref.value = ref.value.split( '#' )[ 0 ] + location.hash;
		}
	} );

	document.addEventListener( 'keydown', function ( e ) {
		if ( ( e.metaKey || e.ctrlKey ) && ( e.key === 's' || e.key === 'S' ) ) {
			e.preventDefault();
			// Only the settings form: not while typing in the Import box (a separate form).
			var inOther = e.target && e.target.closest && e.target.closest( 'form' ) && ! form.contains( e.target );
			if ( dirty && ! inOther ) {
				form.requestSubmit ? form.requestSubmit() : form.submit();
			}
		}
	} );

	window.addEventListener( 'beforeunload', function ( e ) {
		if ( dirty ) {
			e.preventDefault();
			e.returnValue = i18n.leave || '';
		}
	} );

	/* Live state: summary, engine availability, dependencies -------------- */

	var LIB_NAMES = { gsap: 'GSAP', anime: 'Anime.js', motion: 'Motion', three: 'Three.js', lenis: 'Lenis' };

	function sync() {
		var on = Object.keys( LIB_NAMES ).filter( function ( k ) {
			return val( 'libraries.' + k );
		} );

		$$( '[data-bme-lib]' ).forEach( function ( row ) {
			row.classList.toggle( 'is-off', on.indexOf( row.getAttribute( 'data-bme-lib' ) ) === -1 );
		} );

		// Default engine: only enabled tween engines are selectable.
		var tween = [ 'gsap', 'anime', 'motion' ];
		var enabled = tween.filter( function ( k ) {
			return on.indexOf( k ) !== -1;
		} );
		$$( '.bme-seg--engines .bme-seg__opt' ).forEach( function ( opt ) {
			var v = opt.getAttribute( 'data-value' );
			var ok = enabled.indexOf( v ) !== -1;
			var input = $( 'input', opt );
			opt.classList.toggle( 'is-unavailable', ! ok );
			// Never disable (or silently change) the saved choice: a disabled radio is not submitted.
			// The server falls back to the next enabled engine while its library is off.
			input.disabled = ! ok && ! input.checked;
		} );

		// Rule engines: label engines whose library is off instead of disabling them, so a rule
		// keeps its engine when the library is switched off for a while.
		$$( '[data-bme-engine-select] option' ).forEach( function ( o ) {
			if ( ! o.value || o.value === 'native' ) {
				return;
			}
			if ( ! o.hasAttribute( 'data-label' ) ) {
				o.setAttribute( 'data-label', o.textContent );
			}
			o.textContent = o.getAttribute( 'data-label' ) + ( enabled.indexOf( o.value ) === -1 ? ' ' + ( i18n.libOff || '(off)' ) : '' );
		} );

		$$( '[data-bme-depends]' ).forEach( function ( g ) {
			g.classList.toggle( 'is-inactive', ! val( g.getAttribute( 'data-bme-depends' ) ) );
		} );
		$$( '[data-bme-when-off]' ).forEach( function ( n ) {
			n.hidden = !! val( n.getAttribute( 'data-bme-when-off' ) );
		} );

		$$( '.bme-rule' ).forEach( function ( r ) {
			var box = $( 'input[type=checkbox]', r );
			if ( box ) {
				r.classList.toggle( 'is-disabled', ! box.checked );
			}
		} );

		var summary = $( '[data-bme-summary]' );
		if ( summary ) {
			var libs = on.length
				? on.map( function ( k ) {
						return LIB_NAMES[ k ];
				  } ).join( ', ' )
				: i18n.noLibs || 'No libraries';
			var rules = $$( '#bme-rules-body .bme-rule input[type=checkbox]:checked' ).length;
			var levels = i18n.levels || {};
			var text = val( 'auto.enabled' )
				? ( rules === 1 ? i18n.autoOn1 || 'auto-animate on, %1$s rule, %2$s level' : i18n.autoOnN || 'auto-animate on, %1$s rules, %2$s level' )
					.replace( '%1$s', rules )
					.replace( '%2$s', levels[ val( 'level' ) ] || val( 'level' ) || '' )
				: i18n.autoOff || 'auto-animate off';
			summary.innerHTML = '';
			var a = document.createElement( 'strong' );
			a.textContent = libs;
			summary.appendChild( a );
			summary.appendChild( document.createTextNode( '  ·  ' + text ) );
		}
	}

	/* Rules ------------------------------------------------------------------ */

	var body = document.getElementById( 'bme-rules-body' );
	var tpl = document.getElementById( 'bme-rule-template' );
	var empty = $( '[data-bme-empty]' );

	function updateEmpty() {
		if ( empty ) {
			empty.hidden = !! $( '.bme-rule', body );
		}
	}

	// Element-name suggestions only make sense for element rules.
	function syncTargetList( row ) {
		var type = $( 'select[name$="[type]"]', row );
		var target = $( 'input[name$="[target]"]', row );
		if ( type && target ) {
			if ( type.value === 'class' ) {
				target.removeAttribute( 'list' );
				target.placeholder = 'my-class';
			} else {
				target.setAttribute( 'list', 'bme-element-list' );
				target.placeholder = 'heading';
			}
		}
	}
	if ( body ) {
		$$( '.bme-rule', body ).forEach( syncTargetList );
		body.addEventListener( 'change', function ( e ) {
			if ( e.target.matches && e.target.matches( 'select[name$="[type]"]' ) ) {
				syncTargetList( e.target.closest( '.bme-rule' ) );
			}
		} );
	}

	var ruleSeq = 0;
	var addBtn = $( '[data-bme-add-rule]' );
	if ( addBtn && body && tpl ) {
		addBtn.addEventListener( 'click', function () {
			var holder = document.createElement( 'div' );
			holder.innerHTML = tpl.innerHTML.replace( /__INDEX__/g, 'n' + Date.now() + '' + ( ++ruleSeq ) ).trim();
			var row = holder.firstElementChild;
			row.classList.add( 'is-new' );
			body.appendChild( row );
			setTimeout( function () {
				row.style.backgroundColor = 'transparent';
			}, 50 );
			var input = $( 'input[type=text]', row );
			if ( input ) {
				input.focus();
			}
			updateEmpty();
			checkDirty();
			sync();
		} );
	}

	document.addEventListener( 'click', function ( e ) {
		var remove = e.target.closest( '[data-bme-remove-rule]' );
		if ( remove ) {
			remove.closest( '.bme-rule' ).remove();
			updateEmpty();
			checkDirty();
			sync();
			return;
		}
		var prev = e.target.closest( '[data-bme-preview-rule]' );
		if ( prev ) {
			var row = prev.closest( '.bme-rule' );
			var select = $( '[data-bme-preset]', row );
			var scope = $( 'input[name$="[scope]"]', row );
			swatch( prev, select ? select.value : 'fade-up', scope && scope.value.trim() && scope.value.trim() !== 'self' );
		}
	} );

	/* Preview engine (Web Animations API) --------------------------------- */

	var EASE = {
		smooth: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
		soft: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
		strong: 'cubic-bezier(0.16, 1, 0.3, 1)',
		'in-out': 'cubic-bezier(0.45, 0, 0.55, 1)',
		back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
		elastic: 'linear(0, 0.22 2.1%, 0.86 6.5%, 1.11, 1.25 11.6%, 1.2 13.6%, 1.03 18%, 0.97 21.1%, 1.02 27.6%, 0.99 34.5%, 1)',
		bounce: 'linear(0, 0.063, 0.25, 0.563, 1 36.4%, 0.813, 0.75, 0.813, 1 72.7%, 0.938, 1 90.9%, 0.984, 1)',
		sine: 'cubic-bezier(0.37, 0, 0.63, 1)',
		linear: 'linear',
	};
	var IDENTITY = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewY: 0, blur: 0, clip: [ 0, 0, 0, 0 ] };

	function opts() {
		return {
			duration: parseFloat( val( 'defaults.duration' ) ) || 0.8,
			delay: parseFloat( val( 'defaults.delay' ) ) || 0,
			ease: val( 'defaults.ease' ) || 'smooth',
			distance: parseFloat( val( 'defaults.distance' ) ) || 40,
			stagger: parseFloat( val( 'defaults.stagger' ) ) || 0.08,
			speed: parseFloat( val( 'defaults.speed' ) ) || 0.3,
		};
	}

	function token( v, o ) {
		if ( typeof v !== 'string' ) {
			return v;
		}
		var neg = v.charAt( 0 ) === '-';
		var k = neg ? v.slice( 1 ) : v;
		var n = k === 'd' ? o.distance : k === 'hd' ? o.distance / 2 : k === 'p' ? o.speed * 120 : null;
		return n === null ? v : neg ? -n : n;
	}

	function css( p ) {
		var out = {};
		var t = '';
		if ( p.perspective ) {
			t += 'perspective(' + p.perspective + 'px) ';
		}
		var unit = function ( v ) {
			return typeof v === 'number' ? v + 'px' : v;
		};
		t += 'translate(' + unit( p.x || 0 ) + ',' + unit( p.y || 0 ) + ') ';
		t += 'rotate(' + ( p.rotate || 0 ) + 'deg) rotateX(' + ( p.rotateX || 0 ) + 'deg) rotateY(' + ( p.rotateY || 0 ) + 'deg) ';
		t += 'skewY(' + ( p.skewY || 0 ) + 'deg) scale(' + ( p.scale === undefined ? 1 : p.scale ) + ')';
		out.transform = t;
		if ( p.opacity !== undefined ) {
			out.opacity = p.opacity;
		}
		if ( p.blur !== undefined ) {
			out.filter = 'blur(' + p.blur + 'px)';
		}
		if ( p.clip ) {
			out.clipPath = 'inset(' + p.clip.join( '% ' ) + '%)';
		}
		return out;
	}

	function states( preset, o ) {
		var from = {};
		var to = {};
		var src = preset.from || { opacity: 0 };
		Object.keys( src ).forEach( function ( k ) {
			from[ k ] = token( src[ k ], o );
			to[ k ] = preset.to && k in preset.to ? token( preset.to[ k ], o ) : k === 'perspective' ? from[ k ] : IDENTITY[ k ];
		} );
		return [ css( from ), css( to ) ];
	}

	function splitWords( el, chars ) {
		if ( ! el.__bmeText ) {
			el.__bmeText = el.textContent;
		}
		el.textContent = '';
		var parts = [];
		el.__bmeText.split( /(\s+)/ ).forEach( function ( w ) {
			if ( /^\s+$/.test( w ) ) {
				el.appendChild( document.createTextNode( w ) );
				return;
			}
			var span = document.createElement( 'span' );
			span.style.display = 'inline-block';
			if ( chars ) {
				Array.from( w ).forEach( function ( c ) {
					var s = document.createElement( 'span' );
					s.style.display = 'inline-block';
					s.textContent = c;
					span.appendChild( s );
					parts.push( s );
				} );
			} else {
				span.textContent = w;
				parts.push( span );
			}
			el.appendChild( span );
		} );
		return parts;
	}

	/** Play a preset on the given targets. Returns nothing; purely visual. */
	function playPreset( slug, targets, textEl, o ) {
		var p = presets[ slug ];
		if ( ! p || ! targets.length ) {
			return;
		}
		o = o || opts();
		// Reduced motion: preview what those visitors get with "Gentle fades" (opacity only).
		if ( reduce ) {
			targets.forEach( function ( t ) {
				if ( t.animate ) {
					t.animate( [ { opacity: 0 }, { opacity: 1 } ], { duration: 400, easing: 'ease-out' } );
				}
			} );
			return;
		}
		var duration = ( p.duration || o.duration ) * 1000;
		var ease = EASE[ p.ease || o.ease ] || EASE.smooth;
		var stagger = ( p.stagger || o.stagger ) * 1000;

		if ( p.core && slug === 'counter' && textEl ) {
			var start = performance.now();
			var original = textEl.__bmeText || textEl.textContent;
			textEl.__bmeText = original;
			( function tick( now ) {
				var t = Math.min( 1, ( now - start ) / duration );
				var eased = 1 - Math.pow( 1 - t, 3 );
				textEl.textContent = ( i18n.counter || '%s+ launches' ).replace( '%s', Math.round( 1250 * eased ).toLocaleString() );
				if ( t < 1 ) {
					requestAnimationFrame( tick );
				} else {
					setTimeout( function () {
						textEl.textContent = original;
					}, 700 );
				}
			} )( start );
			return;
		}

		if ( p.group === 'text' && textEl ) {
			if ( slug === 'scramble' ) {
				var text = textEl.__bmeText || textEl.textContent;
				textEl.__bmeText = text;
				var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
				var t0 = performance.now();
				( function scr( now ) {
					var k = Math.min( 1, ( now - t0 ) / duration );
					var shown = Math.floor( text.length * k );
					textEl.textContent = text.slice( 0, shown ) + text.slice( shown ).replace( /\S/g, function () {
						return glyphs.charAt( Math.floor( Math.random() * glyphs.length ) );
					} );
					if ( k < 1 ) {
						requestAnimationFrame( scr );
					}
				} )( t0 );
				return;
			}
			if ( slug === 'scroll-highlight' ) {
				splitWords( textEl, false ).forEach( function ( w, i, all ) {
					w.animate( [ { opacity: 0.18 }, { opacity: 1 } ], { duration: 260, delay: ( i / all.length ) * 1400, fill: 'backwards' } );
				} );
				return;
			}
			var pieces = splitWords( textEl, p.split === 'chars' );
			var st = states( p, o );
			pieces.forEach( function ( piece, i ) {
				piece.animate( st, { duration: duration, delay: i * stagger, easing: p.ease ? EASE[ p.ease ] : ease, fill: 'backwards' } );
			} );
			return;
		}

		var pair = states( p, o );
		var loop = p.group === 'loop';
		var scrub = p.group === 'scroll';
		targets.forEach( function ( t, i ) {
			t.animate( pair, {
				duration: scrub ? 1600 : duration,
				delay: loop || scrub ? 0 : i * stagger,
				easing: scrub ? 'linear' : ease,
				iterations: loop ? 4 : scrub ? 2 : 1,
				direction: loop ? ( p.yoyo === false ? 'normal' : 'alternate' ) : scrub ? 'alternate' : 'normal',
				fill: 'backwards',
			} );
		} );
	}

	// Timing & feel preview.
	var stage = $( '[data-bme-stage]' );
	var previewSelect = $( '[data-bme-preview-preset]' );
	var playBtn = $( '[data-bme-play]' );

	function playStage() {
		if ( ! stage ) {
			return;
		}
		var slug = previewSelect ? previewSelect.value : 'fade-up';
		var p = presets[ slug ] || {};
		var heading = $( '[data-bme-sample="text"]', stage );
		var cards = $$( '[data-bme-sample="card"]', stage );
		if ( heading.__bmeText ) {
			heading.textContent = heading.__bmeText;
		}
		if ( p.group === 'text' || p.core ) {
			playPreset( slug, [ heading ], heading );
			playPreset( 'fade-up', cards, null );
		} else {
			playPreset( 'fade-up', [ heading ], null );
			playPreset( slug, cards, null );
		}
	}

	var stageTimer;
	if ( playBtn ) {
		playBtn.addEventListener( 'click', playStage );
		previewSelect.addEventListener( 'change', playStage );
		$$( '#bme-panel-defaults input, #bme-panel-defaults select:not([data-bme-preview-preset])' ).forEach( function ( el ) {
			el.addEventListener( 'input', function () {
				clearTimeout( stageTimer );
				stageTimer = setTimeout( playStage, 350 );
			} );
		} );
	}

	// Floating swatch preview for a rule row.
	// Lives inside .bme-wrap so it gets the screen's colour tokens (outside it, it rendered transparent).
	// Rules that animate children preview three items so the stagger is visible.
	var swatchTimer = 0;
	function swatch( anchor, slug, children ) {
		var old = $( '.bme-swatch' );
		if ( old ) {
			old.remove();
		}
		clearTimeout( swatchTimer );
		var p = presets[ slug ] || {};
		var isText = p.group === 'text';
		var r = anchor.getBoundingClientRect();
		var box = document.createElement( 'div' );
		box.className = 'bme-swatch' + ( children && ! isText ? ' bme-swatch--kids' : '' );
		box.setAttribute( 'aria-hidden', 'true' );
		var items = [];
		for ( var i = 0; i < ( children && ! isText ? 3 : 1 ); i++ ) {
			var chip = document.createElement( 'span' );
			chip.textContent = isText ? i18n.sample || 'Hello there' : ( children ? '' : 'Aa' );
			box.appendChild( chip );
			items.push( chip );
		}
		( $( '.bme-wrap' ) || document.body ).appendChild( box );
		// Left of the play button, vertically centred on the row, kept inside the window.
		var w = box.offsetWidth;
		var h = box.offsetHeight;
		box.style.left = Math.max( 8, r.left - w - 12 ) + 'px';
		box.style.top = Math.min( window.innerHeight - h - 8, Math.max( 40, r.top + r.height / 2 - h / 2 ) ) + 'px';
		playPreset( slug, items, isText ? items[ 0 ] : null );
		var o = opts();
		var ms = ( ( p.duration || o.duration ) + ( p.stagger || o.stagger ) * 6 ) * 1000 + 1200;
		swatchTimer = setTimeout( function () {
			box.remove();
		}, Math.min( 6000, Math.max( 2400, ms ) ) );
	}

	// Reference cards: play on hover / focus.
	$$( '[data-bme-demo]' ).forEach( function ( card ) {
		var shape = $( '.bme-preset__shape', card );
		var slug = card.getAttribute( 'data-bme-demo' );
		var p = presets[ slug ] || {};
		if ( p.group === 'text' ) {
			shape.textContent = slug === 'counter' ? ( 1250 ).toLocaleString() + '+' : i18n.sample || 'Hello there';
		}
		var run = function () {
			if ( shape.__bmeText ) {
				shape.textContent = shape.__bmeText;
			}
			playPreset( slug, [ shape ], p.group === 'text' || slug === 'counter' ? shape : null );
		};
		card.addEventListener( 'mouseenter', run );
		card.addEventListener( 'focus', run );
		card.addEventListener( 'click', run );
	} );

	/* System ----------------------------------------------------------------- */

	var copy = $( '[data-bme-copy]' );
	if ( copy ) {
		copy.addEventListener( 'click', function () {
			var ta = $( '[data-bme-export]' );
			var done = function () {
				var label = copy.textContent;
				copy.textContent = i18n.copied || 'Copied';
				setTimeout( function () {
					copy.textContent = label;
				}, 1400 );
			};
			var fallback = function () {
				ta.select();
				document.execCommand( 'copy' );
				done();
			};
			if ( navigator.clipboard ) {
				navigator.clipboard.writeText( ta.value ).then( done, fallback );
			} else {
				fallback();
			}
		} );
	}

	$$( '[data-bme-confirm]' ).forEach( function ( f ) {
		f.addEventListener( 'submit', function ( e ) {
			if ( ! window.confirm( f.getAttribute( 'data-bme-confirm' ) ) ) {
				e.preventDefault();
				return;
			}
			dirty = false; // confirmed: don't ask a second time on the way out
		} );
	} );

	sync();
	initial = snapshot();
	checkDirty();
} )();
