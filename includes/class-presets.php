<?php
/**
 * Preset catalog (single source of truth: includes/data/presets.json).
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Presets {

	/** Engines that can run the generic (data-driven) presets. */
	const TWEEN_ENGINES = array( 'gsap', 'anime', 'motion' );

	/** @var array|null */
	private static $catalog = null;

	/**
	 * Full catalog keyed by preset slug.
	 *
	 * @return array
	 */
	public static function all() {
		if ( null === self::$catalog ) {
			$json          = file_get_contents( BME_PATH . 'includes/data/presets.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$data          = json_decode( (string) $json, true );
			self::$catalog = is_array( $data ) ? $data : array();

			/**
			 * Filter the preset catalog. Custom presets must follow the presets.json schema.
			 *
			 * @param array $catalog Presets keyed by slug.
			 */
			self::$catalog = (array) apply_filters( 'bme/presets', self::$catalog );
			// Custom presets from the filter must be well-formed (group + label, known group).
			self::$catalog = array_filter(
				self::$catalog,
				static function ( $p, $slug ) {
					return is_string( $slug ) && preg_match( '/^[a-z0-9-]+$/', $slug ) && is_array( $p ) && isset( $p['group'], $p['label'] ) && is_string( $p['label'] ) && in_array( $p['group'], array( 'reveal', 'text', 'scroll', 'loop', 'special' ), true );
				},
				ARRAY_FILTER_USE_BOTH
			);
		}
		return self::$catalog;
	}

	public static function exists( $slug ) {
		$all = self::all();
		return is_string( $slug ) && isset( $all[ $slug ] );
	}

	public static function get( $slug ) {
		$all = self::all();
		return isset( $all[ $slug ] ) ? $all[ $slug ] : null;
	}

	public static function group_labels() {
		return array(
			'reveal'  => __( 'Reveal', 'bricks-motion-studio' ),
			'text'    => __( 'Text', 'bricks-motion-studio' ),
			'scroll'  => __( 'Scroll-linked', 'bricks-motion-studio' ),
			'loop'    => __( 'Loop', 'bricks-motion-studio' ),
			'special' => __( 'Special', 'bricks-motion-studio' ),
		);
	}

	/**
	 * Engines able to run a preset. "core" presets run inside the runtime and work with any engine.
	 *
	 * @param string $slug Preset slug.
	 * @return string[]
	 */
	/**
	 * Presets the plugin's built-in Web Animations engine renders without any library: reveals,
	 * loops and word/character text. Mirrors nativeOk() in runtime.js.
	 *
	 * @param string $slug Preset slug.
	 * @return bool
	 */
	public static function native_ok( $slug ) {
		$p = self::get( $slug );
		return is_array( $p )
			&& empty( $p['engines'] ) && empty( $p['core'] ) && empty( $p['plugins'] ) && empty( $p['draw'] )
			&& 'lines' !== ( $p['split'] ?? '' )
			&& in_array( $p['group'] ?? '', array( 'reveal', 'text', 'loop' ), true );
	}

	public static function engines_for( $slug ) {
		$p = self::get( $slug );
		if ( ! $p ) {
			return array();
		}
		if ( ! empty( $p['engines'] ) ) {
			return (array) $p['engines'];
		}
		return self::TWEEN_ENGINES;
	}

	/**
	 * Whether the element must start hidden to avoid a flash of the final state (FOUC).
	 *
	 * @param string $slug Preset slug.
	 * @return bool
	 */
	public static function needs_hide( $slug ) {
		$p = self::get( $slug );
		if ( ! $p ) {
			return false;
		}
		if ( isset( $p['hide'] ) ) {
			return (bool) $p['hide'];
		}
		return in_array( $p['group'], array( 'reveal', 'text', 'special' ), true );
	}

	/**
	 * GSAP plugins a preset needs when GSAP runs it.
	 *
	 * @param string $slug Preset slug.
	 * @return string[]
	 */
	public static function gsap_plugins_for( $slug ) {
		$p = self::get( $slug );
		if ( ! $p ) {
			return array();
		}
		$plugins = isset( $p['plugins'] ) ? (array) $p['plugins'] : array();
		// SplitText only does line reveals; words and characters use the built-in splitter.
		if ( 'lines' === ( $p['split'] ?? '' ) && empty( $p['core'] ) ) {
			$plugins[] = 'SplitText';
		}
		if ( ! empty( $p['scrub'] ) || ! empty( $p['pin'] ) ) {
			$plugins[] = 'ScrollTrigger';
		}
		if ( ! empty( $p['draw'] ) ) {
			$plugins[] = 'DrawSVGPlugin';
		}
		return array_values( array_unique( $plugins ) );
	}

	/**
	 * Options array for a Bricks select control (grouped labels via prefix).
	 *
	 * @param bool $only_supported Limit to presets runnable by at least one enabled engine.
	 * @return array
	 */
	public static function select_options( $only_supported = true ) {
		$groups  = self::group_labels();
		$enabled = Settings::enabled_tween_engines();
		$out     = array();

		foreach ( $groups as $group => $group_label ) {
			foreach ( self::all() as $slug => $p ) {
				if ( ( $p['group'] ?? '' ) !== $group ) {
					continue;
				}
				if ( $only_supported && empty( $p['core'] ) && ! array_intersect( self::engines_for( $slug ), $enabled ) && empty( $p['fallback'] ) ) {
					continue;
				}
				$out[ $slug ] = $group_label . ' / ' . $p['label'];
			}
		}
		return $out;
	}
}
