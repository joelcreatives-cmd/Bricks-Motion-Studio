/**
 * Bricks Motion Studio — animation inspector.
 *
 * Loaded only with ?bme-debug on the frontend, for people who can edit posts. Outlines every
 * element Motion Studio animates (preset · engine · where it came from) and every element it
 * left alone with the reason, draws the start line, and replays an animation when its label is
 * clicked. Reads BricksMotion.inspect(); changes nothing on the page itself.
 */
( function () {
	'use strict';

	var BM = window.BricksMotion;
	if ( ! BM || ! BM.inspect ) {
		return;
	}

	var cfg = window.BME_CONFIG || {};
	var D = cfg.defaults || {};
	var ENGINE = { native: 'built-in', gsap: 'GSAP', anime: 'Anime.js', motion: 'Motion', core: 'built-in' };
	var showSkipped = true;
	var hidden = false;
	var data = { animated: [], skipped: [] };
	var boxes = [];
	var raf = 0;

	var css = '' +
		'#bme-inspect{position:fixed;inset:0;pointer-events:none;z-index:99990;font:500 11px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
		'#bme-inspect[hidden]{display:none}' +
		'.bme-i-box{position:absolute;border:1.5px solid #7c5cff;border-radius:3px;box-sizing:border-box}' +
		'.bme-i-box.is-skip{border:1.5px dashed #9a98a8}' +
		'.bme-i-box.is-hot{background:rgba(124,92,255,.1)}' +
		'.bme-i-chip{position:absolute;left:-1px;top:-1px;max-width:min(320px,100%);padding:2px 6px;border-radius:3px 0 6px 0;background:#5b3fc4;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:auto;cursor:pointer}' +
		'.bme-i-box.is-skip .bme-i-chip{background:#6b6a78;cursor:help}' +
		'.bme-i-line{position:absolute;left:0;right:0;border-top:1.5px dashed #ff6b3d}' +
		'.bme-i-line span{position:absolute;right:8px;top:-20px;padding:2px 6px;border-radius:4px;background:#ff6b3d;color:#fff}' +
		'#bme-inspect-panel{position:fixed;left:16px;bottom:16px;z-index:99991;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;max-width:calc(100vw - 32px);padding:10px 12px;border-radius:12px;background:#1b1a24;color:#fff;box-shadow:0 10px 30px -10px rgba(0,0,0,.5);font:500 12.5px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
		'#bme-inspect-panel strong{font-weight:650}' +
		'#bme-inspect-panel .n{color:#b9a8ff}' +
		'#bme-inspect-panel label{display:flex;align-items:center;gap:5px;cursor:pointer}' +
		'#bme-inspect-panel button,#bme-inspect-panel a{all:unset;padding:4px 9px;border-radius:7px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}' +
		'#bme-inspect-panel button:hover,#bme-inspect-panel a:hover{background:rgba(255,255,255,.22)}' +
		'#bme-inspect-panel :focus-visible{outline:2px solid #b9a8ff;outline-offset:2px}';

	function el( tag, cls, text ) {
		var n = document.createElement( tag );
		if ( cls ) {
			n.className = cls;
		}
		if ( text ) {
			n.textContent = text;
		}
		return n;
	}

	var style = el( 'style' );
	style.textContent = css;
	document.head.appendChild( style );

	var layer = el( 'div' );
	layer.id = 'bme-inspect';
	layer.setAttribute( 'aria-hidden', 'true' );
	document.body.appendChild( layer );

	// Start line: reveals play when an element's top crosses it.
	var line = el( 'div', 'bme-i-line' );
	var lineLabel = el( 'span' );
	line.appendChild( lineLabel );
	layer.appendChild( line );

	/* Panel ------------------------------------------------------------ */

	var panel = el( 'div' );
	panel.id = 'bme-inspect-panel';
	panel.setAttribute( 'role', 'region' );
	panel.setAttribute( 'aria-label', 'Motion Studio inspector' );
	var summary = el( 'span' );
	var skipToggle = el( 'label' );
	var skipBox = el( 'input' );
	skipBox.type = 'checkbox';
	skipBox.checked = true;
	skipToggle.appendChild( skipBox );
	skipToggle.appendChild( document.createTextNode( 'Skipped' ) );
	var hideBtn = el( 'button', '', 'Hide labels' );
	hideBtn.type = 'button';
	var replayBtn = el( 'button', '', 'Replay all' );
	replayBtn.type = 'button';
	var close = el( 'a', '', 'Close' );
	var url = new URL( window.location.href );
	url.searchParams.delete( 'bme-debug' );
	close.href = url.toString();
	var title = el( 'strong', '', 'Motion Studio' );
	[ title, summary, skipToggle, hideBtn, replayBtn, close ].forEach( function ( n ) {
		panel.appendChild( n );
	} );
	document.body.appendChild( panel );

	skipBox.addEventListener( 'change', function () {
		showSkipped = skipBox.checked;
		build();
	} );
	hideBtn.addEventListener( 'click', function () {
		hidden = ! hidden;
		layer.hidden = hidden;
		hideBtn.textContent = hidden ? 'Show labels' : 'Hide labels';
		if ( ! hidden ) {
			place();
		}
	} );
	replayBtn.addEventListener( 'click', function () {
		var els = data.animated.filter( function ( a ) {
			return /^(reveal|text|draw|counter)$/.test( a.kind );
		} ).map( function ( a ) {
			return a.el;
		} );
		BM.reset( els );
		window.setTimeout( function () {
			BM.play( els.filter( inView ) );
		}, 60 );
	} );

	function inView( n ) {
		var r = n.getBoundingClientRect();
		return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
	}

	/* Boxes ------------------------------------------------------------ */

	function describe( a ) {
		var parts = [ a.label, ENGINE[ a.engine ] || a.engine ];
		if ( a.trigger === 'load' || a.trigger === 'manual' ) {
			parts.push( a.trigger === 'load' ? 'on load' : 'manual' );
		}
		parts.push( a.recipe ? 'recipe' : a.auto ? 'rule' : 'element' );
		if ( a.targets > 1 ) {
			parts.push( a.targets + ' items' );
		}
		return parts.join( ' · ' );
	}

	function build() {
		data = BM.inspect();
		boxes.forEach( function ( b ) {
			b.node.remove();
		} );
		boxes = [];
		data.animated.forEach( function ( a ) {
			var box = el( 'div', 'bme-i-box' );
			var chip = el( 'span', 'bme-i-chip', describe( a ) );
			chip.title = describe( a ) + ' (' + a.preset + ') — click to replay';
			chip.addEventListener( 'click', function () {
				BM.reset( a.el );
				window.setTimeout( function () {
					BM.play( a.el );
				}, 60 );
			} );
			chip.addEventListener( 'pointerenter', function () {
				box.classList.add( 'is-hot' );
			} );
			chip.addEventListener( 'pointerleave', function () {
				box.classList.remove( 'is-hot' );
			} );
			box.appendChild( chip );
			layer.appendChild( box );
			boxes.push( { node: box, el: a.el } );
		} );
		if ( showSkipped ) {
			data.skipped.forEach( function ( s ) {
				var box = el( 'div', 'bme-i-box is-skip' );
				var chip = el( 'span', 'bme-i-chip', 'Skipped: ' + s.reason );
				chip.title = 'Skipped: ' + s.reason;
				box.appendChild( chip );
				layer.appendChild( box );
				boxes.push( { node: box, el: s.el } );
			} );
		}
		var n = data.animated.length;
		var k = data.skipped.length;
		summary.innerHTML = '';
		summary.appendChild( el( 'span', 'n', String( n ) ) );
		summary.appendChild( document.createTextNode( n === 1 ? ' animation, ' : ' animations, ' ) );
		summary.appendChild( el( 'span', 'n', String( k ) ) );
		summary.appendChild( document.createTextNode( ' skipped' + ( data.pace && data.pace !== 1 ? ' · speed ' + data.pace + '×' : '' ) ) );
		place();
	}

	function place() {
		raf = 0;
		if ( hidden ) {
			return;
		}
		var vh = window.innerHeight;
		var offset = Math.max( 0, Math.min( 50, parseFloat( D.offset ) || 0 ) );
		line.style.top = Math.round( vh * ( 1 - offset / 100 ) ) + 'px';
		lineLabel.textContent = 'Start line · ' + offset + '% from the bottom';
		boxes.forEach( function ( b ) {
			var r = b.el.getBoundingClientRect();
			var show = b.el.isConnected && r.width > 0 && r.height > 0 && r.bottom > -40 && r.top < vh + 40;
			b.node.style.display = show ? '' : 'none';
			if ( show ) {
				b.node.style.transform = 'translate(' + Math.round( r.left ) + 'px,' + Math.round( r.top ) + 'px)';
				b.node.style.width = Math.round( r.width ) + 'px';
				b.node.style.height = Math.round( r.height ) + 'px';
			}
		} );
	}

	function schedule() {
		if ( ! raf ) {
			raf = window.requestAnimationFrame( place );
		}
	}

	// Elements move while they animate (and with scrolling): follow them every frame while the
	// labels are shown and the tab is visible.
	( function follow() {
		if ( ! hidden && ! document.hidden ) {
			place();
		}
		window.requestAnimationFrame( follow );
	}() );
	document.addEventListener( 'bme:refresh', function () {
		window.setTimeout( build, 50 );
	} );

	// Content can arrive later (load more, filters, popups): look again every few seconds while
	// the tab is visible, and keep labels on moving elements.
	window.setInterval( function () {
		if ( ! document.hidden ) {
			var before = data.animated.length + data.skipped.length;
			var now = BM.inspect();
			if ( now.animated.length + now.skipped.length !== before ) {
				build();
			} else {
				schedule();
			}
		}
	}, 1500 );

	function start() {
		build();
	}
	if ( BM.started ) {
		start();
	} else {
		document.addEventListener( 'bme:ready', start, { once: true } );
	}
}() );
