/**
 * Bricks Motion Studio — builder panel (main window).
 *
 * 1. Live preview: whenever the selected element's Motion Studio settings change (or on
 *    "Preview animation"), ask the server for the attributes the live page would render
 *    (Builder::ajax_preview) and play them on the canvas (builder-canvas.js).
 * 2. Timeline helper: under each timeline row's Keyframes field, a track with one dot per
 *    keyframe (drag to move, click the track to add, Delete to remove; arrow keys move the
 *    focused dot) and an instant check that tells why a row would be skipped.
 *
 * Reads Bricks' Vue store through .brx-body.__vue_app__ (Bricks 2.x); writes go through the
 * input field + an input event, exactly like typing, so undo and saving work as usual.
 */
( function ( w, d ) {
	'use strict';

	var cfg = w.BME_BUILDER || {};
	var t = cfg.i18n || {};
	var gp = null;
	var state = null;

	/* ---------- Bricks store ----------------------------------------------- */

	function connect() {
		var root = d.querySelector( '.brx-body.main' ) || d.querySelector( '.brx-body' );
		var app = root && root.__vue_app__;
		if ( ! app || ! app.config || ! app.config.globalProperties.$_state ) {
			return false;
		}
		gp = app.config.globalProperties;
		state = gp.$_state;
		return true;
	}

	function canvasWindow() {
		try {
			if ( gp && gp.$_getIframeWindow ) {
				return gp.$_getIframeWindow();
			}
		} catch ( e ) {
			/* fall through */
		}
		var f = d.getElementById( 'bricks-builder-iframe' );
		return f && f.contentWindow;
	}

	/* ---------- 1. live preview ------------------------------------------- */

	var previewTimer = 0;
	var lastKey = '';
	var previewSeq = 0; // a reply for an element no longer selected is dropped

	function motionSettings( el ) {
		var s = ( el && el.settings ) || {};
		var out = {};
		Object.keys( s ).sort().forEach( function ( k ) {
			if ( /^(bme|_cssClasses|_cssGlobalClasses|_interactions|_attributes)/.test( k ) ) {
				out[ k ] = s[ k ];
			}
		} );
		return out;
	}

	function preview( force ) {
		var el = state && state.activeElement;
		if ( ! el || ! el.id ) {
			return;
		}
		var key = el.id + JSON.stringify( motionSettings( el ) );
		if ( ! force && key === lastKey ) {
			return;
		}
		lastKey = key;
		var seq = ++previewSeq;
		var body = new FormData();
		body.append( 'action', 'bme_preview' );
		body.append( 'nonce', cfg.nonce || '' );
		body.append( 'postId', String( cfg.postId || ( w.bricksData && w.bricksData.postId ) || 0 ) );
		body.append( 'element', JSON.stringify( { id: el.id, name: el.name, settings: el.settings || {} } ) );
		fetch( cfg.ajax, { method: 'POST', body: body, credentials: 'same-origin' } )
			.then( function ( r ) {
				return r.json();
			} )
			.then( function ( res ) {
				var cw = canvasWindow();
				if ( seq !== previewSeq || ! res || ! res.success || ! cw || ! cw.BMEPreview ) {
					return;
				}
				if ( ! cw.BMEPreview.play( el.id, res.data ) && force ) {
					note( t.noPreview );
				}
			} )
			.catch( function () {
				/* preview is a convenience: never disturb editing */
			} );
	}

	function stopPreview() {
		var cw = canvasWindow();
		try {
			if ( cw && cw.BMEPreview ) {
				cw.BMEPreview.stop();
			}
		} catch ( e ) {
			/* the canvas may be reloading */
		}
	}

	function note( text ) {
		var btn = d.querySelector( '.bme-preview-trigger' );
		if ( ! btn || ! text ) {
			return;
		}
		var n = btn.parentNode.querySelector( '.bme-preview-note' );
		if ( ! n ) {
			// The status region must exist before its text arrives, or screen readers skip it.
			n = d.createElement( 'span' );
			n.className = 'bme-preview-note';
			n.setAttribute( 'role', 'status' );
			btn.parentNode.appendChild( n );
		}
		setTimeout( function () {
			n.textContent = text;
			setTimeout( function () {
				n.textContent = '';
			}, 4000 );
		}, 50 );
	}

	function watchSettings() {
		if ( ! gp.$_watch ) {
			return;
		}
		gp.$_watch(
			function () {
				var el = state.activeElement;
				return el ? el.id + JSON.stringify( motionSettings( el ) ) : '';
			},
			function ( now, before ) {
				// A new selection is not a change: only edits to the same element play. The
				// previous element's preview is undone, so nothing keeps looping on the canvas.
				if ( ! now || ! before || now.split( '{' )[ 0 ] !== before.split( '{' )[ 0 ] ) {
					lastKey = now;
					clearTimeout( previewTimer );
					previewSeq++;
					stopPreview();
					return;
				}
				clearTimeout( previewTimer );
				previewTimer = setTimeout( function () {
					preview( false );
				}, 450 );
			}
		);
	}

	d.addEventListener( 'click', function ( e ) {
		if ( e.target.closest && e.target.closest( '.bme-preview-trigger' ) ) {
			e.preventDefault();
			preview( true );
		}
	} );

	/* ---------- 2. timeline helper ----------------------------------------- */

	// Mirrors Bricks_Integration::timeline_keys(): what the live page accepts for each property.
	var NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
	var LEN = NUM + '(?:px|%|vw|vh|vmin|vmax|svh|dvh|lvh|svw|dvw|lvw|em|rem)?';
	var COLOUR = 'transparent|currentcolor|(?!overflow\\b)[a-z]{3,20}|#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|var\\(--[a-z0-9_-]+\\)' +
		'|rgba?\\((?:\\d+(?:\\.\\d+)?%?)(?:[, ]\\d+(?:\\.\\d+)?%?){2}(?:[,/](?:\\d*\\.?\\d+%?))?\\)' +
		'|hsla?\\(' + NUM + '(?:deg|turn)?(?:[, ]\\d+(?:\\.\\d+)?%?){2}(?:[,/](?:\\d*\\.?\\d+%?))?\\)';
	function allowed( prop ) {
		switch ( prop ) {
			case 'rotate':
				return 'auto|' + NUM + '(?:deg|turn)?';
			case 'opacity':
			case 'scale':
			case 'scaleX':
			case 'scaleY':
				return 'auto|' + NUM + '%?';
			case 'color':
			case 'backgroundColor':
				return 'auto|' + COLOUR;
			default:
				return 'auto|-?overflow|' + LEN; // x, y, width, height
		}
	}

	// "0: 40px, 50%: 0" → { pairs: [[0,'40px'],[50,'0']], error }
	function parseKeys( text, prop ) {
		var pairs = [];
		var parts = String( text || '' ).split( /,(?![^()]*\))/ ).slice( 0, 50 ); // the server reads 50
		var re = new RegExp( '^(?:' + allowed( prop ) + ')$', 'i' );
		for ( var i = 0; i < parts.length; i++ ) {
			var part = parts[ i ];
			if ( ! part.trim() ) {
				continue;
			}
			var m = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*%?\s*:\s*(.+?)\s*$/.exec( part );
			if ( ! m ) {
				return { pairs: pairs, error: say( t.pair || 'This row is skipped: "%s"', part.trim() ) };
			}
			var value = m[ 2 ].replace( /\s+/g, ' ' ).replace( /\s*([,/()])\s*/g, '$1' ).replace( /^(-?\d*\.?\d+) ([a-z%]+)$/i, '$1$2' );
			if ( ! re.test( value ) || /^(none|inherit|initial|unset|revert)$/i.test( value ) ) {
				return { pairs: pairs, error: say( t.fits || 'This row is skipped: "%s"', value ) };
			}
			pairs.push( [ Math.min( 100, Math.max( 0, parseFloat( m[ 1 ] ) ) ), m[ 2 ].trim() ] );
		}
		if ( ! pairs.length ) {
			return { pairs: pairs, error: t.empty };
		}
		return { pairs: pairs, error: '' };
	}

	// A whole translated sentence with its placeholder filled in (never pieces joined together).
	function say( text, a, b ) {
		return String( text ).replace( '%1$s', a ).replace( '%2$s', b ).replace( '%s', a );
	}

	// Positions keep the precision the server keeps (3 decimals): moving one dot never rounds the others.
	function round( n ) {
		return Math.round( n * 1000 ) / 1000;
	}

	function write( input, pairs ) {
		input.value = pairs
			.slice()
			.sort( function ( a, b ) {
				return a[ 0 ] - b[ 0 ];
			} )
			.map( function ( p ) {
				return round( p[ 0 ] ) + ': ' + p[ 1 ];
			} )
			.join( ', ' );
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}

	function rowProp( item ) {
		var el = state && state.activeElement;
		var rows = ( el && el.settings && el.settings.bmeTimeline ) || [];
		var key = item.getAttribute( 'data-key' );
		var list = Array.prototype.slice.call( item.parentNode.children );
		var row = null;
		for ( var i = 0; i < rows.length; i++ ) {
			if ( rows[ i ] && String( rows[ i ].id ) === key ) {
				row = rows[ i ];
			}
		}
		row = row || rows[ list.indexOf( item ) ] || {};
		return row.prop || 'y';
	}

	function attach( input ) {
		if ( input.__bmeKf ) {
			return;
		}
		input.__bmeKf = true;
		var field = input.closest( '[data-control-key="keys"]' );
		var item = input.closest( 'li.repeater-item' );
		var box = d.createElement( 'div' );
		box.className = 'bme-kf';
		box.innerHTML = '<div class="bme-kf__track"></div><div class="bme-kf__msg" role="status"></div>';
		box.firstChild.title = t.dragHint || ''; // set as text: a translation may hold quotes
		field.appendChild( box );
		// Line up with the field above (the builder pads its controls, not their wrapper).
		var control = field.querySelector( '.control' );
		if ( control ) {
			var cs = w.getComputedStyle( control );
			box.style.paddingLeft = cs.paddingLeft;
			box.style.paddingRight = cs.paddingRight;
		}
		var track = box.firstChild;
		var msg = box.lastChild;
		var dragging = null;

		function render() {
			var res = parseKeys( input.value, rowProp( item ) );
			var text = res.error || t.ok || '';
			if ( msg.textContent !== text ) {
				msg.textContent = text; // only when it changes: screen readers announce every write
			}
			box.classList.toggle( 'is-invalid', !! res.error );
			track.textContent = '';
			res.pairs.forEach( function ( p, i ) {
				// A span, not a button: the builder styles every button in its panel.
				var dot = d.createElement( 'span' );
				dot.className = 'bme-kf__dot';
				dot.tabIndex = 0;
				dot.setAttribute( 'role', 'slider' );
				dot.setAttribute( 'aria-valuemin', '0' );
				dot.setAttribute( 'aria-valuemax', '100' );
				dot.setAttribute( 'aria-valuenow', String( round( p[ 0 ] ) ) );
				dot.setAttribute( 'aria-valuetext', round( p[ 0 ] ) + '%' );
				dot.style.left = p[ 0 ] + '%';
				dot.setAttribute( 'aria-label', say( t.keyframe || 'Keyframe at %1$s: %2$s', round( p[ 0 ] ) + '%', p[ 1 ] ) );
				dot.title = round( p[ 0 ] ) + '%: ' + p[ 1 ];
				dot.dataset.i = String( i );
				track.appendChild( dot );
			} );
			return res;
		}

		function pctAt( e ) {
			var r = track.getBoundingClientRect();
			return Math.round( Math.min( 100, Math.max( 0, ( ( e.clientX - r.left ) / r.width ) * 100 ) ) );
		}

		track.addEventListener( 'pointerdown', function ( e ) {
			if ( e.button !== 0 ) {
				return; // right / middle click: no new keyframe
			}
			var dot = e.target.closest( '.bme-kf__dot' );
			var res = parseKeys( input.value, rowProp( item ) );
			if ( res.error ) {
				return; // fix the text first: editing now would drop the pairs after the bad one
			}
			if ( dot ) {
				dragging = { i: +dot.dataset.i, pairs: res.pairs, from: res.pairs[ +dot.dataset.i ][ 0 ] };
				try {
					track.setPointerCapture( e.pointerId );
				} catch ( err ) {
					/* pointer already gone (synthetic event, released between frames) */
				}
				e.preventDefault();
				return;
			}
			// Click on the track: a new keyframe there, holding the value of the one before it.
			var at = pctAt( e );
			var sorted = res.pairs.slice().sort( function ( a, b ) {
				return a[ 0 ] - b[ 0 ];
			} );
			var before = sorted.filter( function ( p ) {
				return p[ 0 ] <= at;
			} ).pop() || sorted[ 0 ];
			if ( before ) {
				res.pairs.push( [ at, before[ 1 ] ] );
				write( input, res.pairs );
				render();
			}
		} );
		track.addEventListener( 'pointermove', function ( e ) {
			if ( dragging ) {
				dragging.pairs[ dragging.i ][ 0 ] = pctAt( e );
				var dot = track.children[ dragging.i ];
				if ( dot ) {
					dot.style.left = dragging.pairs[ dragging.i ][ 0 ] + '%';
				}
			}
		} );
		// Write once the drag ends, only if the keyframe really moved (a plain click on a dot keeps
		// the text, the undo history and the focus), and keep focus on the dragged dot.
		function endDrag( commit ) {
			if ( ! dragging ) {
				return;
			}
			var drag = dragging;
			dragging = null;
			var moved = drag.pairs[ drag.i ];
			if ( commit && moved[ 0 ] !== drag.from ) {
				write( input, drag.pairs );
			} else {
				moved[ 0 ] = drag.from;
			}
			render();
			focusPair( drag.pairs, moved );
		}
		track.addEventListener( 'pointerup', function () {
			endDrag( true );
		} );
		track.addEventListener( 'pointercancel', function () {
			endDrag( false );
		} );
		track.addEventListener( 'lostpointercapture', function () {
			endDrag( true );
		} );

		function focusPair( pairs, pair ) {
			var order = pairs.slice().sort( function ( a, b ) {
				return a[ 0 ] - b[ 0 ];
			} );
			var dot = track.children[ order.indexOf( pair ) ];
			if ( dot ) {
				dot.focus();
			}
		}
		track.addEventListener( 'keydown', function ( e ) {
			var dot = e.target.closest( '.bme-kf__dot' );
			if ( ! dot ) {
				return;
			}
			var res = parseKeys( input.value, rowProp( item ) );
			var i = +dot.dataset.i;
			if ( res.error || ! res.pairs[ i ] ) {
				return;
			}
			var step = e.shiftKey ? 10 : 1;
			// Slider keys: arrows ±1 (Shift ±10), Page Up / Down ±10, Home / End to 0 / 100.
			var delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 }[ e.key ];
			if ( delta !== undefined || e.key === 'Home' || e.key === 'End' ) {
				var to = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : res.pairs[ i ][ 0 ] + delta;
				res.pairs[ i ][ 0 ] = Math.min( 100, Math.max( 0, to ) );
			} else if ( ( e.key === 'Delete' || e.key === 'Backspace' ) && res.pairs.length > 1 ) {
				res.pairs.splice( i, 1 );
			} else {
				return;
			}
			e.preventDefault();
			var moved = res.pairs[ i ] || res.pairs[ Math.max( 0, i - 1 ) ];
			write( input, res.pairs );
			render();
			// Keep focus on the moved keyframe (or the neighbour of a deleted one); sorting may
			// have changed its index, and write() sorts the same way.
			focusPair( res.pairs, moved );
		} );
		input.addEventListener( 'input', render );
		render();
	}

	function scanPanel() {
		Array.prototype.forEach.call( d.querySelectorAll( '[data-controlkey="bmeTimeline"] li.repeater-item [data-control-key="keys"] input' ), attach );
	}

	function styles() {
		var css = '.bme-kf{margin:0 0 10px;box-sizing:border-box;width:100%}' +
			'.bme-kf__track{position:relative;height:22px;border-radius:11px;background:rgba(127,127,127,.18);cursor:copy;margin:0 9px}' +
			'.bme-kf__dot{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;background:#7c5cff;padding:0;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
			'.bme-kf__dot:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
			'.bme-kf__msg{font-size:11px;line-height:1.4;margin-top:6px;opacity:.75}' +
			'.bme-kf.is-invalid .bme-kf__msg{color:#ff8a8a;opacity:1}' +
			'.bme-kf.is-invalid .bme-kf__track{box-shadow:inset 0 0 0 1px #ff8a8a}' +
			'.bme-preview-note{display:block;margin-top:6px;font-size:11px;opacity:.8}';
		var s = d.createElement( 'style' );
		s.id = 'bme-builder-panel-css';
		s.textContent = css;
		d.head.appendChild( s );
	}

	/* ---------- start ------------------------------------------------------- */

	function start() {
		styles();
		watchSettings();
		scanPanel();
		new MutationObserver( function () {
			scanPanel();
		} ).observe( d.body, { childList: true, subtree: true } );
	}

	var tries = 0;
	( function wait() {
		if ( connect() ) {
			start();
		} else if ( ++tries < 120 ) {
			setTimeout( wait, 250 ); // the builder app mounts after this script runs
		}
	} )();
} )( window, document );
