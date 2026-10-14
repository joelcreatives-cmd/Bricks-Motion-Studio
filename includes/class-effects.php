<?php
/**
 * Site-wide effects (Motion Studio → Effects): page transitions, a page intro, a custom cursor
 * and the scroll progress variables.
 *
 * None of them needs the animation runtime or a library:
 * - Page transitions are CSS (the browser's cross-document View Transitions); elements given the
 *   same "Page transition name" on two pages morph into each other.
 * - The intro is CSS that removes itself on a timer (so it can never stay up, even without
 *   JavaScript); a tiny script in <head> skips it after the first page of a visit.
 * - The cursor and the progress variables run in assets/js/effects.js, loaded only when used.
 * Visitors who prefer reduced motion get no transition, no intro and no trailing cursor.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Effects {

	public function __construct() {
		add_action( 'wp_head', array( $this, 'head' ), 3 );
		add_action( 'wp_body_open', array( $this, 'intro_markup' ), 1 );
		add_action( 'wp_footer', array( $this, 'enqueue' ), 18 );
	}

	/** No effects in the builder, on passive pages (status, excluded paths) or for feeds. */
	private static function active() {
		if ( is_admin() || is_feed() || is_embed() || Bricks_Integration::is_passive_context() ) {
			return false;
		}
		if ( Builder::canvas() || ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() ) ) ) {
			return false;
		}
		return true;
	}

	/** @return array The Effects settings. */
	private static function fx() {
		$fx = Settings::get( 'effects', array() );
		return is_array( $fx ) ? $fx : array();
	}

	/** wp_head: transition and intro CSS, the intro's skip check. */
	public function head() {
		if ( ! self::active() ) {
			return;
		}
		$fx  = self::fx();
		$css = self::transition_css( $fx ) . self::intro_css( $fx );
		if ( '' !== $css ) {
			printf( "<style id=\"bme-effects-css\">%s</style>\n", $css ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from sanitized settings.
		}
		if ( 'off' !== ( $fx['intro'] ?? 'off' ) && empty( $fx['intro_every'] ) ) {
			// Before the first paint: on later pages of the visit the intro never shows at all.
			$js = '(function(d){try{var s=window.sessionStorage;if(s.getItem("bme-intro")){d.documentElement.classList.add("bme-intro-seen")}else{s.setItem("bme-intro","1")}}catch(e){}})(document);';
			wp_print_inline_script_tag(
				$js,
				array(
					'id'               => 'bme-intro-check',
					'data-no-optimize' => '1',
					'data-no-defer'    => '1',
					'data-cfasync'     => 'false',
					'nowprocket'       => true,
				)
			);
		}
	}

	/**
	 * Page transitions: CSS on every page (both the page left and the page arriving need it).
	 *
	 * @param array $fx Effects settings.
	 * @return string
	 */
	public static function transition_css( array $fx ) {
		$type = $fx['transition'] ?? 'off';
		if ( ! in_array( $type, array( 'fade', 'slide', 'zoom' ), true ) ) {
			return '';
		}
		$d    = max( 0.1, min( 1.5, (float) ( $fx['transition_duration'] ?? 0.35 ) ) );
		$dur  = rtrim( rtrim( number_format( $d, 2, '.', '' ), '0' ), '.' ) . 's';
		$css  = '@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}';
		$css .= '::view-transition-group(*){animation-duration:' . $dur . '}';
		if ( 'slide' === $type ) {
			$css .= '@keyframes bme-vt-out{to{opacity:0;transform:translateX(-6%)}}@keyframes bme-vt-in{from{opacity:0;transform:translateX(6%)}}';
			$css .= '::view-transition-old(root){animation:' . $dur . ' cubic-bezier(.4,0,.2,1) both bme-vt-out}::view-transition-new(root){animation:' . $dur . ' cubic-bezier(.4,0,.2,1) both bme-vt-in}';
		} elseif ( 'zoom' === $type ) {
			$css .= '@keyframes bme-vt-out{to{opacity:0;transform:scale(.96)}}@keyframes bme-vt-in{from{opacity:0;transform:scale(1.04)}}';
			$css .= '::view-transition-old(root){animation:' . $dur . ' cubic-bezier(.4,0,.2,1) both bme-vt-out}::view-transition-new(root){animation:' . $dur . ' cubic-bezier(.4,0,.2,1) both bme-vt-in}';
		} else {
			$css .= '::view-transition-old(root),::view-transition-new(root){animation-duration:' . $dur . '}';
		}
		return $css . '}';
	}

	/**
	 * Intro: a full-screen layer that leaves on its own (CSS timer), in the theme's colours.
	 *
	 * @param array $fx Effects settings.
	 * @return string
	 */
	public static function intro_css( array $fx ) {
		$type = $fx['intro'] ?? 'off';
		if ( ! in_array( $type, array( 'fade', 'curtain' ), true ) ) {
			return '';
		}
		$bg   = '' !== ( $fx['intro_color'] ?? '' ) ? $fx['intro_color'] : '#111111';
		$fg   = self::readable_on( $bg );
		$out  = 'curtain' === $type ? 'transform:translateY(-100%)' : 'opacity:0';
		$css  = '#bme-intro{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:' . $bg . ';color:' . $fg . ';pointer-events:none;animation:bme-intro-out .6s cubic-bezier(.7,0,.3,1) .7s both}';
		$css .= '#bme-intro span{font:600 clamp(18px,3vw,28px)/1.2 system-ui,sans-serif;letter-spacing:.02em;animation:bme-intro-text .5s ease-out both}';
		$css .= '@keyframes bme-intro-out{to{' . $out . ';visibility:hidden}}@keyframes bme-intro-text{from{opacity:0;transform:translateY(8px)}}';
		// Later pages of the visit, reduced motion, printing: no intro.
		$css .= 'html.bme-intro-seen #bme-intro{display:none}@media (prefers-reduced-motion:reduce){#bme-intro{display:none}}@media print{#bme-intro{display:none}}';
		return $css;
	}

	/**
	 * Black or white text, whichever reads better on a background colour.
	 *
	 * @param string $hex #rgb or #rrggbb.
	 * @return string
	 */
	public static function readable_on( $hex ) {
		$h = ltrim( (string) $hex, '#' );
		if ( 3 === strlen( $h ) ) {
			$h = $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
		}
		if ( 6 !== strlen( $h ) || ! ctype_xdigit( $h ) ) {
			return '#ffffff';
		}
		$lum = ( 0.299 * hexdec( substr( $h, 0, 2 ) ) + 0.587 * hexdec( substr( $h, 2, 2 ) ) + 0.114 * hexdec( substr( $h, 4, 2 ) ) ) / 255;
		return $lum > 0.6 ? '#111111' : '#ffffff';
	}

	/** wp_body_open: the intro layer (decorative, hidden from screen readers). */
	public function intro_markup() {
		if ( ! self::active() ) {
			return;
		}
		$fx = self::fx();
		if ( ! in_array( $fx['intro'] ?? 'off', array( 'fade', 'curtain' ), true ) ) {
			return;
		}
		$text = (string) ( $fx['intro_text'] ?? '' );
		echo '<div id="bme-intro" aria-hidden="true">' . ( '' !== $text ? '<span>' . esc_html( $text ) . '</span>' : '' ) . '</div>' . "\n";
	}

	/** wp_footer: the cursor / progress script, only where something uses it. */
	public function enqueue() {
		if ( ! self::active() ) {
			return;
		}
		$fx     = self::fx();
		$cursor = in_array( $fx['cursor'] ?? 'off', array( 'dot', 'ring', 'both' ), true ) ? $fx['cursor'] : '';
		$page   = ! empty( $fx['page_progress'] );
		$el     = Usage::has( 'progress' );
		if ( ! $cursor && ! $page && ! $el ) {
			return;
		}
		$handle = 'bme-effects';
		wp_enqueue_script( $handle, BME_URL . 'assets/js/effects' . Assets::min() . '.js', array(), Assets::asset_version(), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		wp_add_inline_script(
			$handle,
			'window.BME_FX=' . wp_json_encode(
				array(
					'cursor'       => $cursor,
					'color'        => (string) ( $fx['cursor_color'] ?? '' ),
					'hide'         => ! empty( $fx['cursor_hide'] ),
					'pageProgress' => $page,
				)
			) . ';',
			'before'
		);
	}
}
