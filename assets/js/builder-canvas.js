/**
 * Bricks Motion Studio — live preview, builder canvas side.
 *
 * builder-panel.js (main window) asks the server for the attributes the live page would give the
 * selected element, then calls BMEPreview.play( id, attributes ) here. The animation plays on the
 * element in the canvas with the real runtime and engines; the previous preview is undone first.
 * Scroll-linked effects and scroll timelines follow the canvas' own scrolling while previewed.
 */
( function ( w, d ) {
	'use strict';

	var current = null; // { el, keys }

	function undo() {
		if ( ! current ) {
			return;
		}
		var el = current.el;
		var hadTimeline = current.keys.indexOf( 'data-bme-tl' ) !== -1;
		if ( w.BricksMotion && el.isConnected ) {
			w.BricksMotion.destroy( el );
		}
		current.keys.forEach( function ( k ) {
			el.removeAttribute( k );
		} );
		el.removeAttribute( 'data-bme-state' );
		el.removeAttribute( 'data-bme-owner' );
		current = null;
		if ( hadTimeline && w.BricksMotionTimeline ) {
			w.BricksMotionTimeline.rebuild(); // restores every inline style the timeline wrote
		}
	}

	function play( id, attrs ) {
		undo();
		var el = d.querySelector( '[data-id="' + String( id ).replace( /[^a-z0-9_-]/gi, '' ) + '"]' );
		if ( ! el || ! attrs ) {
			return false;
		}
		var keys = Object.keys( attrs ).filter( function ( k ) {
			return /^data-bme/.test( k ) && k !== 'data-bme-hide' && k !== 'data-bme-tl-hide';
		} );
		if ( ! keys.length ) {
			return false;
		}
		keys.forEach( function ( k ) {
			el.setAttribute( k, attrs[ k ] );
		} );
		current = { el: el, keys: keys };
		if ( w.BricksMotion && ( attrs[ 'data-bme' ] !== undefined || attrs[ 'data-bme-hover' ] || attrs[ 'data-bme-3d' ] ) ) {
			w.BricksMotion.refresh( el ); // sets up the reveal, hover effect or 3D background
			if ( attrs[ 'data-bme' ] !== undefined ) {
				w.BricksMotion.reset( el );
				w.BricksMotion.play( el );
			}
		}
		if ( attrs[ 'data-bme-tl' ] && w.BricksMotionTimeline ) {
			w.BricksMotionTimeline.rebuild(); // view rows play now, hover rows on hover, scroll rows follow the canvas
		}
		return true;
	}

	w.BMEPreview = { play: play, stop: undo };
} )( window, document );
