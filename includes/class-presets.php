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
	/** @var array|null */
	private static $builtin = null;

	/**
	 * The shipped catalog only (includes/data/presets.json), without "My presets" or filters.
	 *
	 * @return array
	 */
	public static function builtin() {
		if ( null === self::$builtin ) {
			$json = file_get_contents( BME_PATH . 'includes/data/presets.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$data = json_decode( (string) $json, true );
			$data = is_array( $data ) ? $data : array();
			// Names in the site's language (only once translations are loaded: cached from then on).
			if ( did_action( 'init' ) ) {
				foreach ( self::labels() as $slug => $label ) {
					if ( isset( $data[ $slug ] ) && is_array( $data[ $slug ] ) ) {
						$data[ $slug ]['label'] = $label;
					}
				}
				self::$builtin = $data;
			}
			return $data;
		}
		return self::$builtin;
	}

	/**
	 * Translatable names of the shipped presets (presets.json holds the English names).
	 *
	 * @return array slug => name
	 */
	public static function labels() {
		return array(
			'fade'              => __( 'Fade in', 'bricks-motion-studio' ),
			'fade-up'           => __( 'Fade up', 'bricks-motion-studio' ),
			'fade-down'         => __( 'Fade down', 'bricks-motion-studio' ),
			'fade-left'         => __( 'Fade in from right', 'bricks-motion-studio' ),
			'fade-right'        => __( 'Fade in from left', 'bricks-motion-studio' ),
			'zoom-in'           => __( 'Zoom in', 'bricks-motion-studio' ),
			'zoom-out'          => __( 'Zoom out', 'bricks-motion-studio' ),
			'flip-up'           => __( 'Flip up (3D)', 'bricks-motion-studio' ),
			'flip-left'         => __( 'Flip from left (3D)', 'bricks-motion-studio' ),
			'rotate-in'         => __( 'Rotate in', 'bricks-motion-studio' ),
			'skew-up'           => __( 'Skew up', 'bricks-motion-studio' ),
			'blur-in'           => __( 'Blur in', 'bricks-motion-studio' ),
			'blur-up'           => __( 'Blur up', 'bricks-motion-studio' ),
			'clip-up'           => __( 'Wipe up (clip)', 'bricks-motion-studio' ),
			'clip-down'         => __( 'Wipe down (clip)', 'bricks-motion-studio' ),
			'clip-left'         => __( 'Wipe left (clip)', 'bricks-motion-studio' ),
			'clip-right'        => __( 'Wipe right (clip)', 'bricks-motion-studio' ),
			'reveal-image'      => __( 'Image reveal (clip + zoom)', 'bricks-motion-studio' ),
			'split-lines'       => __( 'Lines slide up (masked)', 'bricks-motion-studio' ),
			'split-words'       => __( 'Words fade up', 'bricks-motion-studio' ),
			'split-words-blur'  => __( 'Words blur in', 'bricks-motion-studio' ),
			'split-chars'       => __( 'Characters fade up', 'bricks-motion-studio' ),
			'typewriter'        => __( 'Typewriter', 'bricks-motion-studio' ),
			'scramble'          => __( 'Scramble (GSAP)', 'bricks-motion-studio' ),
			'scroll-highlight'  => __( 'Highlight words on scroll', 'bricks-motion-studio' ),
			'parallax'          => __( 'Parallax (vertical)', 'bricks-motion-studio' ),
			'parallax-x'        => __( 'Parallax (horizontal)', 'bricks-motion-studio' ),
			'scroll-fade'       => __( 'Fade in while scrolling', 'bricks-motion-studio' ),
			'scroll-scale'      => __( 'Scale up while scrolling', 'bricks-motion-studio' ),
			'scroll-rotate'     => __( 'Rotate while scrolling', 'bricks-motion-studio' ),
			'scroll-expand'     => __( 'Expand while scrolling (clip)', 'bricks-motion-studio' ),
			'horizontal-scroll' => __( 'Horizontal scroll (pinned, GSAP)', 'bricks-motion-studio' ),
			'pin'               => __( 'Pin while scrolling (GSAP)', 'bricks-motion-studio' ),
			'float'             => __( 'Float', 'bricks-motion-studio' ),
			'pulse'             => __( 'Pulse', 'bricks-motion-studio' ),
			'sway'              => __( 'Sway', 'bricks-motion-studio' ),
			'spin'              => __( 'Spin', 'bricks-motion-studio' ),
			'marquee'           => __( 'Marquee (slides sideways forever)', 'bricks-motion-studio' ),
			'counter'           => __( 'Count up numbers', 'bricks-motion-studio' ),
			'draw-svg'          => __( 'Draw SVG strokes', 'bricks-motion-studio' ),
		);
	}


	/**
	 * "My presets" (Motion Studio → Timing & feel) as catalog entries: the base preset with the
	 * saved name and timing. Keyed by slug.
	 *
	 * @return array
	 */
	public static function custom() {
		$out  = array();
		$base = self::builtin();
		foreach ( (array) Settings::get( 'custom_presets', array() ) as $row ) {
			if ( ! is_array( $row ) || empty( $row['slug'] ) || empty( $row['base'] ) || ! isset( $base[ $row['base'] ] ) ) {
				continue;
			}
			$p          = $base[ $row['base'] ];
			$p['label'] = '★ ' . (string) ( $row['label'] ?? $row['slug'] ); // easy to spot in every preset list
			$p['base']  = $row['base'];
			$p['mine']  = true;
			foreach ( array( 'duration', 'delay', 'distance', 'stagger' ) as $key ) {
				if ( isset( $row[ $key ] ) && is_numeric( $row[ $key ] ) ) {
					$p[ $key ] = (float) $row[ $key ]; // a number, however the setting was written
				}
			}
			if ( isset( $row['ease'] ) && is_string( $row['ease'] ) && '' !== $row['ease'] ) {
				$p['ease'] = $row['ease'];
			}
			// Preset builder: its own start values, loop amount, marquee direction, counter start
			// (checked and turned into numbers again: the option may have been written directly).
			$p                            = self::tune( $p, $row['base'], Settings::sanitize_tune( $row, $row['base'] ) );
			$out[ (string) $row['slug'] ] = $p;
			// "Use for every …": the built-in animation itself changes, everywhere it is used.
			if ( ! empty( $row['replace'] ) ) {
				$q          = $p;
				$q['label'] = sprintf(
					/* translators: %s: a built-in animation's name, e.g. Fade up */
					__( '%s (adjusted)', 'bricks-motion-studio' ),
					$base[ $row['base'] ]['label']
				);
				unset( $q['mine'], $q['base'] );
				$q['tweaked']        = true;
				$out[ $row['base'] ] = $q;
			}
		}
		return $out;
	}

	/**
	 * Whether the preset builder can change this preset's start values: entrances (reveal and
	 * text) with a start state. Scroll-linked and looping presets keep theirs.
	 *
	 * @param mixed $p Preset.
	 * @return bool
	 */
	public static function shapeable( $p ) {
		return is_array( $p ) && ! empty( $p['from'] ) && is_array( $p['from'] ) && in_array( $p['group'] ?? '', array( 'reveal', 'text' ), true );
	}

	/**
	 * Loop presets whose size of movement can be set (Fine-tune / My presets): preset => [ where,
	 * property, unit label, min, max ]. Float: px it rises; pulse: % it grows; sway: degrees each way.
	 */
	const AMOUNTS = array(
		'float' => array( 'to', 'y', 'px', 0, 120 ),
		'pulse' => array( 'to', 'scale', '%', 0, 60 ),
		'sway'  => array( 'both', 'rotate', '°', 0, 45 ),
	);

	/**
	 * What can be fine-tuned on a preset, beyond its timing.
	 *
	 * @param string $slug Preset slug (built-in, or a My preset's base).
	 * @return array { shape: bool, tilt: string ('' | rotateX | rotateY), amount: bool, dir: bool, start: bool }
	 */
	public static function tunables( $slug ) {
		$all = self::builtin();
		$p   = $all[ $slug ] ?? null;
		if ( ! $p ) {
			return array( 'shape' => false, 'tilt' => '', 'amount' => false, 'dir' => false, 'start' => false );
		}
		$from = isset( $p['from'] ) && is_array( $p['from'] ) ? $p['from'] : array();
		return array(
			'shape'  => self::shapeable( $p ),
			'tilt'   => isset( $from['rotateX'] ) ? 'rotateX' : ( isset( $from['rotateY'] ) ? 'rotateY' : '' ),
			'amount' => isset( self::AMOUNTS[ $slug ] ),
			'dir'    => ! empty( $p['marquee'] ),
			'start'  => 'counter' === $slug,
		);
	}

	/**
	 * A preset with fine-tuned motion: where it starts (shape, tilt), how far a loop moves, which
	 * way a marquee runs, which number a counter starts from. Values are already sanitized
	 * (Settings::sanitize_tune()); missing ones keep the preset's own.
	 *
	 * @param array  $p    Preset.
	 * @param string $slug Built-in slug the preset is (or is based on).
	 * @param array  $t    { from: array, tilt: float, amount: float, dir: string, start: float }.
	 * @return array
	 */
	public static function tune( array $p, $slug, array $t ) {
		$can = self::tunables( $slug );
		if ( $can['shape'] && ! empty( $t['from'] ) && is_array( $t['from'] ) ) {
			$p['from'] = array_merge( (array) $p['from'], $t['from'] );
		}
		if ( '' !== $can['tilt'] && isset( $t['tilt'] ) ) {
			$p['from'][ $can['tilt'] ] = (float) $t['tilt'];
		}
		if ( $can['amount'] && isset( $t['amount'] ) ) {
			list( $where, $prop ) = self::AMOUNTS[ $slug ];
			$a                    = (float) $t['amount'];
			$v                    = 'scale' === $prop ? round( 1 + $a / 100, 4 ) : ( 'y' === $prop ? -$a : $a );
			$p['to']              = (array) ( $p['to'] ?? array() );
			$p['to'][ $prop ]     = $v;
			if ( 'both' === $where ) {
				$p['from']          = (array) ( $p['from'] ?? array() );
				$p['from'][ $prop ] = -$v;
			}
		}
		if ( $can['dir'] && isset( $t['dir'] ) && 'right' === $t['dir'] ) {
			$p['from'] = array_merge( (array) ( $p['from'] ?? array() ), array( 'x' => '-50%' ) );
			$p['to']   = array_merge( (array) ( $p['to'] ?? array() ), array( 'x' => '0%' ) );
		}
		if ( $can['start'] && isset( $t['start'] ) ) {
			$p['start'] = (float) $t['start'];
		}
		return $p;
	}

	/**
	 * Only what fine-tuning changes on a preset (for one element's data-bme-opts "m").
	 *
	 * @param string $slug Preset slug in the catalog (a My preset or a built-in).
	 * @param array  $t    Sanitized fine-tune values.
	 * @return array { from?, to?, start? } Empty when nothing changes.
	 */
	public static function tune_diff( $slug, array $t ) {
		$all  = self::all();
		$p    = $all[ $slug ] ?? null;
		$base = is_array( $p ) && ! empty( $p['base'] ) ? $p['base'] : $slug;
		if ( ! is_array( $p ) || ! $t ) {
			return array();
		}
		$q   = self::tune( $p, $base, $t );
		$out = array();
		foreach ( array( 'from', 'to' ) as $side ) {
			$a = isset( $p[ $side ] ) && is_array( $p[ $side ] ) ? $p[ $side ] : array();
			$b = isset( $q[ $side ] ) && is_array( $q[ $side ] ) ? $q[ $side ] : array();
			foreach ( $b as $k => $v ) {
				if ( ! array_key_exists( $k, $a ) || $a[ $k ] !== $v ) {
					$out[ $side ][ $k ] = $v;
				}
			}
		}
		if ( isset( $q['start'] ) && ( $p['start'] ?? null ) !== $q['start'] ) {
			$out['start'] = $q['start'];
		}
		return $out;
	}

	/** Forget the cached catalog (after "My presets" were saved). */
	public static function flush() {
		self::$catalog = null;
	}

	public static function all() {
		if ( null === self::$catalog ) {
			// My presets, and built-in animations adjusted for the whole site (same slug: replaces it).
			self::$catalog = array_merge( self::builtin(), self::custom() );

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
