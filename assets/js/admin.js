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
	var calm = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };

	/* Sliding indicators: a solid thumb in each segmented control, a pill in the sidebar. ------ */

	function glide( thumb, box, instant ) {
		if ( ! thumb || ! box || ! box.offsetWidth ) {
			return;
		}
		thumb.classList.toggle( 'is-instant', !! instant || calm.matches );
		// Measured against the thumb's own container (the option's label is a positioned box too).
		var host = thumb.parentElement;
		var r = box.getBoundingClientRect();
		var h = host.getBoundingClientRect();
		var x = r.left - h.left - host.clientLeft + host.scrollLeft;
		var y = r.top - h.top - host.clientTop + host.scrollTop;
		thumb.style.width = r.width + 'px';
		thumb.style.height = r.height + 'px';
		thumb.style.transform = 'translate(' + x + 'px,' + y + 'px)';
	}
	function segThumbs( instant ) {
		$$( '.bme-seg' ).forEach( function ( seg ) {
			var thumb = seg.__bmeThumb;
			if ( ! thumb ) {
				thumb = seg.__bmeThumb = document.createElement( 'span' );
				thumb.className = 'bme-seg__thumb';
				thumb.setAttribute( 'aria-hidden', 'true' );
				seg.insertBefore( thumb, seg.firstChild );
				seg.classList.add( 'has-thumb' );
				instant = true;
			}
			var on = $( 'input:checked', seg );
			thumb.style.opacity = on ? '1' : '0';
			glide( thumb, on && on.nextElementSibling, instant );
		} );
	}
	var navEl = $( '.bme-nav' );
	var navPill = null;
	function movePill( instant ) {
		var cur = navEl && $( '[aria-current="page"]', navEl );
		if ( ! navEl || ! cur ) {
			return;
		}
		if ( ! navPill ) {
			navPill = document.createElement( 'span' );
			navPill.className = 'bme-nav__pill';
			navPill.setAttribute( 'aria-hidden', 'true' );
			navEl.insertBefore( navPill, navEl.firstChild );
			navEl.classList.add( 'has-pill' );
			instant = true;
		}
		var cs = getComputedStyle( cur );
		navPill.style.setProperty( '--pill-tone', cs.getPropertyValue( '--tone' ) );
		navPill.style.setProperty( '--pill-tone-2', cs.getPropertyValue( '--tone-2' ) );
		glide( navPill, cur, instant );
	}
	window.addEventListener( 'resize', function () {
		segThumbs( true );
		movePill( true );
	} );

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
			id = 'overview';
		}
		panels.forEach( function ( p ) {
			p.hidden = p.getAttribute( 'data-bme-panel' ) !== id;
		} );
		navItems.forEach( function ( a ) {
			if ( a.getAttribute( 'data-bme-nav' ) === id ) {
				a.setAttribute( 'aria-current', 'page' );
				// Narrow screens: the nav is a row that scrolls sideways; keep the current tab in it.
				var nav = a.parentElement;
				if ( nav && nav.scrollWidth > nav.clientWidth + 1 ) {
					nav.scrollLeft = Math.max( 0, a.offsetLeft - ( nav.clientWidth - a.offsetWidth ) / 2 );
				}
			} else {
				a.removeAttribute( 'aria-current' );
			}
		} );
		movePill( ! focus );
		segThumbs( true ); // the section just became visible: place its thumbs without sliding
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
	show( ( location.hash || '#overview' ).slice( 1 ), false );
	// Overview cards and buttons open their section like the navigation does.
	document.addEventListener( 'click', function ( e ) {
		var go = e.target.closest && e.target.closest( '[data-bme-go]' );
		if ( go ) {
			e.preventDefault();
			var id = go.getAttribute( 'data-bme-go' );
			history.replaceState( null, '', '#' + id );
			show( id, true );
		}
	} );
	// A one-time notice (imported, reset, import failed) must not come back on refresh.
	if ( /[?&]bme_notice=/.test( location.search ) ) {
		var clean = new URL( location.href );
		clean.searchParams.delete( 'bme_notice' );
		history.replaceState( null, '', clean.pathname + clean.search + clean.hash );
	}
	window.addEventListener( 'hashchange', function () {
		show( ( location.hash || '#overview' ).slice( 1 ), true );
	} );

	/* Dirty state + save --------------------------------------------------- */

	// Replays a one-shot CSS animation class.
	function restart( el, cls ) {
		if ( ! el ) {
			return;
		}
		el.classList.remove( cls );
		void el.offsetWidth;
		el.classList.add( cls );
	}

	var saveBtn = $( '[data-bme-save]' );
	var stateEl = $( '[data-bme-state]' );
	var kbd = $( '[data-bme-kbd]' );
	var dirty = false;
	var snapshot = function () {
		return new URLSearchParams( new FormData( form ) ).toString();
	};
	var initial = ''; // Taken after the first sync() (end of file), so load-time adjustments never count as edits.

	if ( kbd ) {
		kbd.textContent = isMac ? '⌘S' : i18n.ctrlS || 'Ctrl S';
	}

	function checkDirty() {
		var was = dirty;
		dirty = snapshot() !== initial;
		saveBtn.disabled = ! dirty;
		if ( dirty && ! was && initial ) {
			restart( saveBtn, 'is-ready' );
		}
		var said = dirty ? i18n.unsaved : i18n.saved;
		if ( stateEl.textContent !== said ) {
			stateEl.textContent = said; // a live region: only announce real changes, not every keystroke
			restart( stateEl, 'is-flash' );
		}
		stateEl.classList.toggle( 'is-dirty', dirty );
		changeMarks();
	}

	form.addEventListener( 'input', function () {
		checkDirty();
		sync();
	} );
	form.addEventListener( 'change', function () {
		checkDirty();
		sync();
	} );
	// Settings saved somewhere else since this page opened (another tab, an import, WP-CLI): ask
	// before replacing them. The check is a quick request; if it fails, saving goes ahead as before.
	var revChecked = false;
	form.addEventListener( 'submit', function ( e ) {
		if ( ! revChecked && data.rev && data.ajax && window.fetch && window.URLSearchParams ) {
			e.preventDefault();
			var go = function () {
				revChecked = true;
				if ( form.requestSubmit ) {
					form.requestSubmit();
				} else {
					form.submit();
				}
			};
			fetch( data.ajax, {
				method: 'POST',
				credentials: 'same-origin',
				body: new URLSearchParams( { action: 'bme_settings_rev', nonce: data.nonce || '' } ),
			} )
				.then( function ( r ) {
					return r.json();
				} )
				.then( function ( res ) {
					var changed = res && res.success && res.data && res.data.rev && res.data.rev !== data.rev;
					if ( changed && ! window.confirm( i18n.changed ) ) {
						return;
					}
					go();
				} )
				.catch( go );
			return;
		}
		dirty = false;
		if ( saveBtn ) {
			saveBtn.classList.add( 'is-saving' );
			stateEl.textContent = i18n.saving || '';
		}
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
		segThumbs( false );
		ruleInfo();
		// Rule buttons say which rule they act on ("Remove rule 3"), for screen-reader users.
		$$( '#bme-rules-body .bme-rule' ).forEach( function ( row, i ) {
			$$( '[data-bme-remove-rule], [data-bme-preview-rule]', row ).forEach( function ( btn ) {
				btn.__bmeLabel = btn.__bmeLabel || btn.getAttribute( 'aria-label' );
				btn.setAttribute( 'aria-label', ( i18n.ruleBtn || '%1$s (rule %2$d)' ).replace( '%1$s', btn.__bmeLabel ).replace( '%2$d', String( i + 1 ) ) );
			} );
		} );
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

		overview( on );
		libSummary( on );
		changeMarks();

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
				? ( i18n.autoOn || 'auto-animate on, %2$s level, active rules: %1$s' ) // one string: every language's plurals work
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

	/* Libraries: the default engine's badge ------------------------------- */

	function libSummary( on ) {
		var def = val( 'default_engine' );
		$$( '[data-bme-lib]' ).forEach( function ( card ) {
			var badge = $( '[data-bme-default-badge]', card );
			if ( badge ) {
				badge.hidden = ! ( card.getAttribute( 'data-bme-lib' ) === def && on.indexOf( def ) !== -1 );
			}
		} );
	}

	/* Changed fields: a dot on each section with unsaved changes ------------ */

	function fieldChanged( el ) {
		if ( el.type === 'checkbox' || el.type === 'radio' ) {
			return el.checked !== el.defaultChecked;
		}
		if ( el.tagName === 'SELECT' ) {
			return Array.prototype.some.call( el.options, function ( o ) {
				return o.selected !== o.defaultSelected;
			} );
		}
		return el.value !== el.defaultValue;
	}
	function changeMarks() {
		var sections = {};
		$$( '.is-changed', form ).forEach( function ( n ) {
			n.classList.remove( 'is-changed' );
		} );
		$$( 'input[name], select[name], textarea[name]', form ).forEach( function ( el ) {
			if ( el.type === 'hidden' || ! fieldChanged( el ) ) {
				return;
			}
			var box = el.closest( '.bme-row, .bme-lib, .bme-tile, .bme-rule, .bme-mine, .bme-choice, .bme-status__opt, .bme-card__field' );
			if ( box ) {
				box.classList.add( 'is-changed' );
			}
			var panel = el.closest( '[data-bme-panel]' );
			if ( panel ) {
				sections[ panel.getAttribute( 'data-bme-panel' ) ] = true;
			}
		} );
		// Added or removed rules / presets count as a change to their section too.
		if ( body && body.querySelector( '.is-new' ) ) {
			sections.auto = true;
		}
		if ( initialCounts.rules !== null && body && $$( '.bme-rule', body ).length !== initialCounts.rules ) {
			sections.auto = true;
		}
		if ( initialCounts.mine !== null && mineBody && mineBody.children.length !== initialCounts.mine ) {
			sections.defaults = true;
		}
		navItems.forEach( function ( a ) {
			a.classList.toggle( 'has-changes', !! ( dirty && sections[ a.getAttribute( 'data-bme-nav' ) ] ) );
		} );
	}
	var initialCounts = { rules: null, mine: null };

	/* Toasts ----------------------------------------------------------------- */

	var toastBox = null;
	function toast( text, kind ) {
		if ( ! toastBox ) {
			toastBox = document.createElement( 'div' );
			toastBox.className = 'bme-toasts';
			toastBox.setAttribute( 'role', 'status' );
			toastBox.setAttribute( 'aria-live', 'polite' );
			( $( '.bme-wrap' ) || document.body ).appendChild( toastBox );
		}
		var t = document.createElement( 'div' );
		t.className = 'bme-toast bme-toast--' + ( kind || 'ok' );
		t.innerHTML = '<i aria-hidden="true"></i><span></span>';
		$( 'span', t ).textContent = text;
		toastBox.appendChild( t );
		setTimeout( function () {
			t.classList.add( 'is-out' );
			setTimeout( function () {
				t.remove();
			}, calm.matches ? 0 : 320 );
		}, kind === 'error' ? 6000 : 3200 );
	}
	// WordPress notices from this screen (saved, imported, reset, import failed) become toasts.
	$$( '.bme-notice' ).forEach( function ( n ) {
		toast( n.textContent.trim(), n.classList.contains( 'notice-error' ) ? 'error' : 'ok' );
		n.remove();
	} );
	if ( /[?&]settings-updated=/.test( location.search ) ) {
		var cleanSaved = new URL( location.href );
		cleanSaved.searchParams.delete( 'settings-updated' );
		history.replaceState( null, '', cleanSaved.pathname + cleanSaved.search + cleanSaved.hash );
	}

	/* Overview: status pill, stats, quick start ---------------------------- */

	// Stat numbers count up to their new value ("12", "4/5").
	function countTo( el, value ) {
		var to = /^(\d+)(.*)$/.exec( String( value ) );
		var from = parseInt( el.textContent, 10 );
		if ( ! to || calm.matches || document.hidden || ! isFinite( from ) || from === +to[ 1 ] ) {
			cancelAnimationFrame( el.__bmeRaf );
			el.classList.remove( 'is-counting' );
			el.textContent = value;
			return;
		}
		var end = +to[ 1 ];
		var rest = to[ 2 ];
		var t0 = performance.now();
		var dur = 450;
		cancelAnimationFrame( el.__bmeRaf );
		el.classList.add( 'is-counting' );
		( function step( now ) {
			var k = Math.min( 1, ( now - t0 ) / dur );
			var e = 1 - Math.pow( 1 - k, 3 );
			el.textContent = Math.round( from + ( end - from ) * e ) + rest;
			if ( k < 1 ) {
				el.__bmeRaf = requestAnimationFrame( step );
			} else {
				el.classList.remove( 'is-counting' );
			}
		} )( t0 );
	}

	// Rows fold away before they are removed (immediately for reduced motion).
	function leave( row, done ) {
		if ( calm.matches || ! row.animate ) {
			row.remove();
			done();
			return;
		}
		row.style.maxHeight = row.offsetHeight + 'px';
		row.classList.add( 'is-leaving' );
		setTimeout( function () {
			row.remove();
			done();
		}, 280 );
	}

	function overview( on ) {
		var status = val( 'status' ) || 'live';
		var labels = i18n.status || {};
		var pill = $( '[data-bme-status-pill]' );
		if ( pill ) {
			if ( pill.getAttribute( 'data-status' ) !== status ) {
				restart( pill, 'is-pop' );
			}
			pill.setAttribute( 'data-status', status );
			$( 'span', pill ).textContent = labels[ status ] || status;
		}
		var set = function ( key, value, note ) {
			var v = $( '[data-bme-stat="' + key + '"]' );
			var n = $( '[data-bme-stat-note="' + key + '"]' );
			if ( v ) {
				countTo( v, value );
			}
			if ( n ) {
				n.textContent = note;
			}
		};
		set(
			'libs',
			on.length + '/' + Object.keys( LIB_NAMES ).length,
			on.length
				? on
						.map( function ( k ) {
							return LIB_NAMES[ k ];
						} )
						.join( ', ' )
				: i18n.noLibs || ''
		);
		var rows = $$( '#bme-rules-body .bme-rule' );
		var active = $$( '#bme-rules-body .bme-rule input[type=checkbox]:checked' ).length;
		var auto = !! val( 'auto.enabled' );
		set( 'rules', auto ? String( active ) : '0', auto ? fmt( i18n.ofRules || 'of %2$d rules', active, rows.length ) : i18n.autoOff || '' );
		var presetsEl = $( '[data-bme-stat="presets"]' );
		var mine = mineBody ? mineBody.children.length : 0;
		if ( presetsEl ) {
			set( 'presets', String( ( parseInt( presetsEl.getAttribute( 'data-builtin' ), 10 ) || 0 ) + mine ), mine ? fmt( i18n.mineCount || '%1$d of your own', mine, 0 ) : i18n.builtIn || '' );
		}
		var steps = { libs: on.length > 0, auto: auto && active > 0 };
		Object.keys( steps ).forEach( function ( k ) {
			var li = $( '[data-bme-step="' + k + '"]' );
			if ( li ) {
				li.classList.toggle( 'is-done', steps[ k ] );
			}
		} );
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

	// Bricks' own name under each element rule ("Basic Text" for text-basic), how many rules are
	// on, and the filter.
	var elementNames = {};
	$$( '#bme-element-list option' ).forEach( function ( o ) {
		elementNames[ o.value ] = o.textContent;
	} );
	var filterInput = $( '[data-bme-rule-filter]' );
	var filterEmpty = $( '[data-bme-filter-empty]' );
	var countEl = $( '[data-bme-rule-count]' );
	function fmt( text, a, b ) {
		return String( text ).replace( '%1$d', a ).replace( '%2$d', b );
	}
	function ruleInfo() {
		if ( ! body ) {
			return;
		}
		var rows = $$( '.bme-rule', body );
		var terms = filterInput ? filterInput.value.toLowerCase().split( /\s+/ ).filter( Boolean ) : [];
		var on = 0;
		var shown = 0;
		rows.forEach( function ( row ) {
			var type = $( 'select[name$="[type]"]', row );
			var target = $( 'input[name$="[target]"]', row );
			var nameEl = $( '[data-bme-target-name]', row );
			var value = target ? target.value.trim() : '';
			var isClass = type && type.value === 'class';
			var label = '';
			if ( nameEl ) {
				if ( isClass ) {
					label = value ? '.' + value.replace( /^\./, '' ) : '';
				} else if ( value ) {
					label = elementNames[ value ] || '';
				}
				nameEl.textContent = label;
				nameEl.classList.toggle( 'is-unknown', ! isClass && !! value && ! label && Object.keys( elementNames ).length > 1 );
				if ( nameEl.classList.contains( 'is-unknown' ) ) {
					nameEl.textContent = i18n.unknownEl || '';
				}
			}
			var enabled = $( 'input[type=checkbox]', row );
			if ( enabled && enabled.checked ) {
				on++;
			}
			var preset = $( 'select[name$="[preset]"]', row );
			var hay = [ value, label, isClass ? 'class' : 'element', preset && preset.selectedOptions[ 0 ] ? preset.selectedOptions[ 0 ].textContent + ' ' + preset.value : '', ( $( 'input[name$="[scope]"]', row ) || {} ).value || '', ( $( 'select[name$="[engine]"]', row ) || {} ).value || '' ].join( ' ' ).toLowerCase();
			var match = terms.every( function ( t ) {
				return hay.indexOf( t ) !== -1;
			} );
			row.hidden = ! match;
			if ( match ) {
				shown++;
			}
		} );
		if ( countEl ) {
			countEl.textContent = terms.length ? fmt( i18n.ruleShown || '%1$d of %2$d shown', shown, rows.length ) : fmt( i18n.ruleCount || '%1$d of %2$d on', on, rows.length );
		}
		if ( filterEmpty ) {
			filterEmpty.hidden = ! ( terms.length && rows.length && ! shown );
		}
	}
	if ( filterInput ) {
		filterInput.addEventListener( 'input', ruleInfo );
		// Filtering is not an edit: keep it out of the unsaved-changes check.
		filterInput.removeAttribute( 'name' );
	}

	/* My presets ------------------------------------------------------------ */

	var mineBody = $( '#bme-mine-body' );
	var mineTpl = $( '#bme-mine-template' );
	var mineAdd = $( '[data-bme-add-mine]' );
	var mineEmpty = $( '[data-bme-mine-empty]' );
	function mineCount() {
		if ( mineEmpty ) {
			mineEmpty.hidden = !! ( mineBody && mineBody.children.length );
		}
		overview( Object.keys( LIB_NAMES ).filter( function ( k ) {
			return val( 'libraries.' + k );
		} ) );
	}
	if ( mineAdd && mineBody && mineTpl ) {
		mineAdd.addEventListener( 'click', function () {
			var id = Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 6 );
			var holder = document.createElement( 'div' );
			// The slug is fixed at creation: renaming a preset never breaks elements that use it.
			holder.innerHTML = mineTpl.innerHTML.replace( /__INDEX__/g, 'n' + id ).replace( /__SLUG__/g, 'my-' + id ).trim();
			var row = holder.firstElementChild;
			row.classList.add( 'is-new' );
			mineBody.appendChild( row );
			setTimeout( function () {
				row.style.backgroundColor = 'transparent';
			}, 50 );
			var name = $( 'input[type=text]', row );
			if ( name ) {
				name.focus();
			}
			mineCount();
			checkDirty();
		} );
	}
	// The preset as currently typed (unsaved values included).
	function mineFromRow( row ) {
		var base = $( '[data-bme-mine-base]', row ).value;
		var p = Object.assign( {}, presets[ base ] || {} );
		[ 'duration', 'delay', 'distance', 'stagger' ].forEach( function ( k ) {
			var field = $( 'input[name$="[' + k + ']"]', row );
			var v = field ? parseFloat( field.value ) : NaN;
			if ( isFinite( v ) ) {
				p[ k ] = v;
			}
		} );
		var ease = $( 'select[name$="[ease]"]', row );
		if ( ease && ease.value ) {
			p.ease = ease.value;
		}
		return p;
	}
	document.addEventListener( 'click', function ( e ) {
		var rm = e.target.closest && e.target.closest( '[data-bme-remove-mine]' );
		if ( rm ) {
			var row = rm.closest( '[data-bme-mine]' );
			if ( row.classList.contains( 'is-leaving' ) ) {
				return;
			}
			var next = row.nextElementSibling || row.previousElementSibling;
			var target = next && next.querySelector( '[data-bme-remove-mine]' );
			( target || mineAdd || document.body ).focus();
			leave( row, function () {
				mineCount();
				checkDirty();
			} );
			return;
		}
		var pv = e.target.closest && e.target.closest( '[data-bme-preview-mine]' );
		if ( pv ) {
			presets.__mine = mineFromRow( pv.closest( '[data-bme-mine]' ) );
			swatch( pv, '__mine', false );
		}
	} );

	var ruleSeq = 0;
	var addBtn = $( '[data-bme-add-rule]' );
	if ( addBtn && body && tpl ) {
		addBtn.addEventListener( 'click', function () {
			var holder = document.createElement( 'div' );
			holder.innerHTML = tpl.innerHTML.replace( /__INDEX__/g, 'n' + Date.now() + '' + ( ++ruleSeq ) ).trim();
			var row = holder.firstElementChild;
			if ( filterInput ) {
				filterInput.value = ''; // a new rule must never be hidden by the filter
			}
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
			// Keyboard focus moves to the next rule's Remove button (or the one before, or Add rule).
			var row = remove.closest( '.bme-rule' );
			if ( row.classList.contains( 'is-leaving' ) ) {
				return;
			}
			var next = row.nextElementSibling || row.previousElementSibling;
			var target = next && next.querySelector( '[data-bme-remove-rule]' );
			( target || $( '[data-bme-add-rule]' ) || document.body ).focus();
			leave( row, function () {
				updateEmpty();
				checkDirty();
				sync();
			} );
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

	// A saved 0 is a real value (no distance, no stagger): only an empty or invalid field falls back.
	function numVal( name, fallback ) {
		var n = parseFloat( val( name ) );
		return isFinite( n ) ? n : fallback;
	}

	// A preset's own value (My presets; 0 counts) or the Timing & feel one.
	function own( p, o, k ) {
		return typeof p[ k ] === 'number' && isFinite( p[ k ] ) ? p[ k ] : o[ k ];
	}

	function opts() {
		return {
			duration: numVal( 'defaults.duration', 0.8 ),
			delay: numVal( 'defaults.delay', 0 ),
			ease: val( 'defaults.ease' ) || 'smooth',
			distance: numVal( 'defaults.distance', 40 ),
			stagger: numVal( 'defaults.stagger', 0.08 ),
			speed: numVal( 'defaults.speed', 0.3 ),
			pace: Math.max( 0.25, Math.min( 4, numVal( 'defaults.pace', 1 ) ) ) || 1,
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
		// "My presets" can carry their own travel distance.
		if ( typeof p.distance === 'number' ) {
			o = Object.assign( {}, o, { distance: p.distance } );
		}
		// Reduced motion: preview what those visitors get with "Gentle fades" (opacity only).
		if ( reduce ) {
			targets.forEach( function ( t ) {
				if ( t.animate ) {
					t.animate( [ { opacity: 0 }, { opacity: 1 } ], { duration: 400, easing: 'ease-out' } );
				}
			} );
			return;
		}
		var pace = o.pace || 1;
		var duration = ( own( p, o, 'duration' ) * 1000 ) / pace;
		var ease = EASE[ p.ease || o.ease ] || EASE.smooth;
		var stagger = ( own( p, o, 'stagger' ) * 1000 ) / pace;
		var delay = ( Math.max( 0, own( p, o, 'delay' ) ) * 1000 ) / pace;

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
				piece.animate( st, { duration: duration, delay: delay + i * stagger, easing: p.ease ? EASE[ p.ease ] : ease, fill: 'backwards' } );
			} );
			return;
		}

		var pair = states( p, o );
		var loop = p.group === 'loop';
		var scrub = p.group === 'scroll';
		targets.forEach( function ( t, i ) {
			t.animate( pair, {
				duration: scrub ? 1600 : duration,
				delay: loop || scrub ? 0 : delay + i * stagger,
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
		var ms = ( own( p, o, 'delay' ) + own( p, o, 'duration' ) + own( p, o, 'stagger' ) * 6 ) * 1000 + 1200;
		swatchTimer = setTimeout( function () {
			box.remove();
		}, Math.min( 6000, Math.max( 2400, ms ) ) );
	}

	// Reference cards: play on hover / focus.
	$$( '[data-bme-demo]' ).forEach( function ( card ) {
		var shape = $( '.bme-preset__shape', card );
		var slug = card.getAttribute( 'data-bme-demo' );
		var p = presets[ slug ] || {};
		if ( p.group === 'text' || slug === 'counter' ) {
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
		card.addEventListener( 'click', function () {
			run();
			copyText( slug, function () {
				say( String( i18n.copySlug || 'Copied %s' ).replace( '%s', slug ) );
				toast( String( i18n.copySlug || 'Copied %s' ).replace( '%s', slug ) );
				card.classList.add( 'is-copied' );
				clearTimeout( card.__bmeCopied );
				card.__bmeCopied = setTimeout( function () {
					card.classList.remove( 'is-copied' );
				}, 1400 );
			} );
		} );
	} );

	// G. Search the presets by name, slug, group or engine.
	var presetFilter = $( '[data-bme-preset-filter]' );
	if ( presetFilter ) {
		presetFilter.addEventListener( 'input', function () {
			var terms = presetFilter.value.toLowerCase().split( /\s+/ ).filter( Boolean );
			var any = false;
			$$( '[data-bme-preset-grid]' ).forEach( function ( grid ) {
				var visible = 0;
				$$( '[data-bme-demo]', grid ).forEach( function ( card ) {
					var hay = card.getAttribute( 'data-bme-search' ) || '';
					var match = terms.every( function ( t ) {
						return hay.indexOf( t ) !== -1;
					} );
					card.hidden = ! match;
					visible += match ? 1 : 0;
				} );
				grid.hidden = ! visible;
				var head = $( '[data-bme-preset-group="' + grid.getAttribute( 'data-bme-preset-grid' ) + '"]' );
				if ( head ) {
					head.hidden = ! visible;
				}
				any = any || visible > 0;
			} );
			var none = $( '[data-bme-preset-empty]' );
			if ( none ) {
				none.hidden = any;
			}
		} );
	}

	// Announce a short message in the top bar's status line, then go back to the save state.
	function say( text ) {
		if ( ! stateEl ) {
			return;
		}
		stateEl.textContent = text;
		clearTimeout( stateEl.__bmeTimer );
		stateEl.__bmeTimer = setTimeout( function () {
			stateEl.textContent = dirty ? i18n.unsaved : i18n.saved;
		}, 1600 );
	}

	function copyText( text, done ) {
		var fallback = function () {
			var ta = document.createElement( 'textarea' );
			ta.value = text;
			ta.setAttribute( 'readonly', '' );
			ta.style.cssText = 'position:fixed;left:-9999px';
			document.body.appendChild( ta );
			ta.select();
			document.execCommand( 'copy' );
			ta.remove();
			done();
		};
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( text ).then( done, fallback );
		} else {
			fallback();
		}
	}

	/* System ----------------------------------------------------------------- */

	var copy = $( '[data-bme-copy]' );
	if ( copy ) {
		copy.addEventListener( 'click', function () {
			var ta = $( '[data-bme-export]' );
			var done = function () {
				// The label to go back to is read once: a second click while "Copied" shows must not keep it.
				copy.__bmeLabel = copy.__bmeLabel || copy.textContent;
				copy.textContent = i18n.copied || 'Copied';
				if ( stateEl ) {
					stateEl.textContent = i18n.copied || 'Copied'; // announced (the button text alone is not)
					toast( i18n.copied || 'Copied' );
					setTimeout( function () {
						stateEl.textContent = dirty ? i18n.unsaved : i18n.saved;
					}, 1600 );
				}
				clearTimeout( copy.__bmeTimer );
				copy.__bmeTimer = setTimeout( function () {
					copy.textContent = copy.__bmeLabel;
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

	var download = $( '[data-bme-download]' );
	if ( download && window.Blob && window.URL ) {
		download.addEventListener( 'click', function () {
			var ta = $( '[data-bme-export]' );
			var url = URL.createObjectURL( new Blob( [ ta.value ], { type: 'application/json' } ) );
			var a = document.createElement( 'a' );
			a.href = url;
			a.download = download.getAttribute( 'data-bme-download' ) || 'motion-studio-settings.json';
			document.body.appendChild( a );
			a.click();
			a.remove();
			setTimeout( function () {
				URL.revokeObjectURL( url );
			}, 1000 );
		} );
	}

	var importBox = $( '[data-bme-import]' );
	var importMsg = $( '[data-bme-import-msg]' );
	var importFile = $( '[data-bme-import-file]' );
	// An export is a JSON object with at least one of the known sections.
	function checkImport() {
		if ( ! importBox || ! importMsg ) {
			return true;
		}
		var text = importBox.value.trim();
		var ok = false;
		if ( text ) {
			try {
				var obj = JSON.parse( text );
				ok = !! obj && typeof obj === 'object' && ! Array.isArray( obj ) && [ 'libraries', 'auto', 'defaults', 'a11y', 'perf', 'level' ].some( function ( k ) {
					return k in obj;
				} );
			} catch ( err ) {
				ok = false;
			}
		}
		importMsg.textContent = text ? ( ok ? i18n.jsonOk : i18n.jsonBad ) || '' : '';
		importMsg.classList.toggle( 'is-bad', !! text && ! ok );
		importBox.setAttribute( 'aria-invalid', text && ! ok ? 'true' : 'false' );
		return ok;
	}
	if ( importBox ) {
		importBox.addEventListener( 'input', checkImport );
		importBox.form.addEventListener( 'submit', function ( e ) {
			if ( ! checkImport() ) {
				e.preventDefault();
				importBox.focus();
			}
		} );
	}
	if ( importFile && window.FileReader ) {
		importFile.addEventListener( 'change', function () {
			var f = importFile.files && importFile.files[ 0 ];
			if ( ! f ) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function () {
				importBox.value = String( reader.result || '' );
				checkImport();
				importBox.focus();
			};
			reader.readAsText( f );
			importFile.value = '';
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

	/* Number fields: − and + buttons (hold to repeat); arrow keys still work in the field. --- */

	$$( '.bme-row .bme-input' ).forEach( function ( box ) {
		var num = $( 'input[type=number]', box );
		if ( ! num ) {
			return;
		}
		var make = function ( dir, text ) {
			var b = document.createElement( 'button' );
			b.type = 'button';
			b.className = 'bme-step';
			b.tabIndex = -1; // keyboard users step with the arrow keys inside the field
			b.setAttribute( 'aria-hidden', 'true' );
			b.textContent = text;
			var timer = 0;
			var step = function () {
				try {
					if ( num.value === '' ) {
						num.value = num.min || 0;
					}
					if ( dir > 0 ) {
						num.stepUp();
					} else {
						num.stepDown();
					}
				} catch ( err ) {
					return;
				}
				num.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				num.dispatchEvent( new Event( 'change', { bubbles: true } ) );
				bounds();
				if ( b.disabled ) {
					stop(); // reached min / max: a disabled button gets no pointerup
				}
			};
			function stop() {
				clearTimeout( timer );
				clearInterval( timer );
			}
			b.addEventListener( 'pointerdown', function ( e ) {
				e.preventDefault();
				step();
				timer = setTimeout( function () {
					timer = setInterval( step, 70 );
				}, 400 );
			} );
			[ 'pointerup', 'pointerleave', 'pointercancel' ].forEach( function ( ev ) {
				b.addEventListener( ev, stop );
			} );
			return b;
		};
		var minus = make( -1, '−' );
		var plus = make( 1, '+' );
		function bounds() {
			var v = parseFloat( num.value );
			minus.disabled = num.min !== '' && v <= parseFloat( num.min );
			plus.disabled = num.max !== '' && v >= parseFloat( num.max );
		}
		box.insertBefore( minus, box.firstChild );
		box.appendChild( plus );
		box.classList.add( 'has-steps' );
		// Wide enough for the longest value the field allows (e.g. 15000 ms), so digits never touch the unit.
		var longest = Math.max( String( num.max || '' ).length, String( num.min || '' ).length, String( num.step || '' ).replace( /^0/, '' ).length + 1, 2 );
		box.style.setProperty( '--bme-digits', Math.min( 6, longest ) + 'ch' );
		num.addEventListener( 'input', bounds );
		bounds();
	} );

	/* Command palette: search every setting, section and preset ("/") ----- */

	( function () {
		var items = [];
		var panelName = {};
		navItems.forEach( function ( a ) {
			var id = a.getAttribute( 'data-bme-nav' );
			panelName[ id ] = ( $( 'span', a ) || a ).textContent.trim();
			items.push( { label: panelName[ id ], hint: i18n.section || 'Section', panel: id, el: null, kind: 'section' } );
		} );
		$$( '.bme-row__label, .bme-subhead, .bme-lib__title label, .bme-card__title, legend.bme-row__label' ).forEach( function ( l ) {
			var panel = l.closest( '[data-bme-panel]' );
			var text = l.textContent.replace( /\s+/g, ' ' ).trim();
			if ( ! panel || ! text || l.closest( 'template' ) ) {
				return;
			}
			var id = panel.getAttribute( 'data-bme-panel' );
			var row = l.closest( '.bme-row, .bme-lib, .bme-tile, .bme-card, fieldset, .bme-card__field' ) || l;
			var help = $( '.bme-row__help, .bme-lib__role', row );
			items.push( { label: text, hint: panelName[ id ] || '', panel: id, el: row, kind: 'setting', extra: help ? help.textContent : '' } );
		} );
		$$( '[data-bme-demo]' ).forEach( function ( card ) {
			var name = $( '.bme-preset__name', card );
			items.push( { label: name ? name.textContent : card.getAttribute( 'data-bme-demo' ), hint: ( i18n.preset || 'Preset' ) + ' · ' + card.getAttribute( 'data-bme-demo' ), panel: 'help', el: card, kind: 'preset', extra: card.getAttribute( 'data-bme-search' ) || '' } );
		} );

		var wrap = document.createElement( 'div' );
		wrap.className = 'bme-palette';
		wrap.hidden = true;
		wrap.innerHTML =
			'<div class="bme-palette__backdrop" data-close></div>' +
			'<div class="bme-palette__box" role="dialog" aria-modal="true">' +
			'<div class="bme-palette__field"><span class="bme-palette__icon" aria-hidden="true"></span>' +
			'<input type="text" role="combobox" aria-expanded="true" aria-controls="bme-palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">' +
			'<kbd class="bme-kbd">Esc</kbd></div>' +
			'<ul class="bme-palette__list" id="bme-palette-list" role="listbox"></ul>' +
			'<p class="bme-palette__empty" hidden></p>' +
			'</div>';
		( $( '.bme-wrap' ) || document.body ).appendChild( wrap );
		var box = $( '.bme-palette__box', wrap );
		var input = $( 'input', wrap );
		var list = $( 'ul', wrap );
		var none = $( '.bme-palette__empty', wrap );
		var icon = $( '.bme-palette__icon', wrap );
		var searchIcon = $( '[data-bme-palette] svg' );
		if ( searchIcon ) {
			icon.innerHTML = searchIcon.outerHTML;
		}
		box.setAttribute( 'aria-label', i18n.paletteLabel || 'Search settings' );
		input.setAttribute( 'aria-label', i18n.paletteLabel || 'Search settings' );
		input.placeholder = i18n.palettePlaceholder || 'Search settings, sections and presets…';
		none.textContent = i18n.paletteNone || 'Nothing found.';
		var shown = [];
		var active = 0;
		var opener = null;

		function render() {
			var terms = input.value.toLowerCase().split( /\s+/ ).filter( Boolean );
			shown = items.filter( function ( it ) {
				var hay = ( it.label + ' ' + it.hint + ' ' + ( it.extra || '' ) ).toLowerCase();
				return terms.every( function ( t ) {
					return hay.indexOf( t ) !== -1;
				} );
			} );
			if ( ! terms.length ) {
				shown = shown.filter( function ( it ) {
					return it.kind === 'section';
				} );
			}
			// Best first: label matches before matches in the description.
			if ( terms.length ) {
				shown.sort( function ( a, b ) {
					var sa = a.label.toLowerCase().indexOf( terms[ 0 ] ) === -1 ? 1 : 0;
					var sb = b.label.toLowerCase().indexOf( terms[ 0 ] ) === -1 ? 1 : 0;
					return sa - sb;
				} );
			}
			shown = shown.slice( 0, 40 );
			active = 0;
			list.innerHTML = '';
			shown.forEach( function ( it, i ) {
				var li = document.createElement( 'li' );
				li.id = 'bme-pal-' + i;
				li.setAttribute( 'role', 'option' );
				li.className = 'bme-palette__item bme-palette__item--' + it.kind;
				li.setAttribute( 'data-panel', it.panel );
				li.innerHTML = '<i aria-hidden="true"></i><strong></strong><span></span>';
				$( 'strong', li ).textContent = it.label;
				$( 'span', li ).textContent = it.hint;
				li.addEventListener( 'mousemove', function () {
					if ( active !== i ) {
						active = i;
						mark();
					}
				} );
				li.addEventListener( 'click', function () {
					go( it );
				} );
				list.appendChild( li );
			} );
			none.hidden = !! shown.length;
			mark();
		}
		function mark() {
			$$( '.bme-palette__item', list ).forEach( function ( li, i ) {
				li.setAttribute( 'aria-selected', i === active ? 'true' : 'false' );
				if ( i === active ) {
					input.setAttribute( 'aria-activedescendant', li.id );
					li.scrollIntoView( { block: 'nearest' } );
				}
			} );
		}
		function open() {
			opener = document.activeElement;
			wrap.hidden = false;
			input.value = '';
			render();
			input.focus(); // at once: keys typed right after opening must land in the field
			requestAnimationFrame( function () {
				wrap.classList.add( 'is-open' );
			} );
		}
		function close( back ) {
			wrap.classList.remove( 'is-open' );
			setTimeout( function () {
				wrap.hidden = true;
			}, calm.matches ? 0 : 180 );
			if ( back && opener && opener.focus ) {
				opener.focus();
			}
		}
		function go( it ) {
			close( false );
			history.replaceState( null, '', '#' + it.panel );
			show( it.panel, ! it.el );
			if ( it.kind === 'preset' ) {
				var filter = $( '[data-bme-preset-filter]' );
				if ( filter ) {
					filter.value = '';
					filter.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				}
			}
			if ( it.el ) {
				setTimeout( function () {
					it.el.scrollIntoView( { block: 'center', behavior: calm.matches ? 'auto' : 'smooth' } );
					restart( it.el, 'is-found' );
					var field = it.el.matches( 'input, select, textarea, button' ) ? it.el : $( 'input:not([type=hidden]), select, textarea, button', it.el );
					if ( field ) {
						field.focus( { preventScroll: true } );
					}
				}, 60 );
			}
		}
		input.addEventListener( 'input', render );
		input.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
				e.preventDefault();
				if ( shown.length ) {
					active = ( active + ( e.key === 'ArrowDown' ? 1 : -1 ) + shown.length ) % shown.length;
					mark();
				}
			} else if ( e.key === 'Enter' ) {
				e.preventDefault();
				if ( shown[ active ] ) {
					go( shown[ active ] );
				}
			} else if ( e.key === 'Escape' ) {
				e.preventDefault();
				close( true );
			} else if ( e.key === 'Tab' ) {
				e.preventDefault(); // focus stays in the dialog
			}
		} );
		wrap.addEventListener( 'click', function ( e ) {
			if ( e.target.hasAttribute( 'data-close' ) ) {
				close( true );
			}
		} );
		// "/" opens it (⌘K / Ctrl K belongs to WordPress' own command palette). Never while typing.
		document.addEventListener( 'keydown', function ( e ) {
			var t = e.target;
			var typing = t && ( t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test( t.tagName ) );
			if ( e.key === '/' && ! typing && ! e.metaKey && ! e.ctrlKey && ! e.altKey && wrap.hidden ) {
				e.preventDefault();
				open();
			}
		} );
		$$( '[data-bme-palette]' ).forEach( function ( b ) {
			b.addEventListener( 'click', open );
			var k = $( 'kbd', b );
			if ( k ) {
				k.textContent = '/';
			}
		} );
	} )();

	initialCounts.rules = body ? $$( '.bme-rule', body ).length : null;
	initialCounts.mine = mineBody ? mineBody.children.length : null;
	sync();
	initial = snapshot();
	checkDirty();
} )();
