<?php
/**
 * Animation levels (Basic / Moderate / Advanced) for auto-animated elements.
 *
 * A level swaps each element-type rule preset for a calmer or richer sibling and scales distance,
 * duration and stagger. CSS-class rules and Custom animations keep exactly what was chosen,
 * unless the element itself picks a level in the builder.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Levels {

	const DEFAULT_LEVEL = 'moderate';

	/** Preset swaps. Presets not listed keep their slug; null turns the animation off. */
	const MAP = array(
		'basic'    => array(
			'fade-down'        => 'fade-up',
			'fade-left'        => 'fade-up',
			'fade-right'       => 'fade-up',
			'zoom-in'          => 'fade-up',
			'zoom-out'         => 'fade',
			'flip-up'          => 'fade-up',
			'flip-left'        => 'fade-up',
			'rotate-in'        => 'fade-up',
			'skew-up'          => 'fade-up',
			'blur-in'          => 'fade',
			'blur-up'          => 'fade-up',
			'clip-up'          => 'fade',
			'clip-down'        => 'fade',
			'clip-left'        => 'fade',
			'clip-right'       => 'fade',
			'reveal-image'     => 'fade',
			'split-lines'      => 'fade-up',
			'split-words'      => 'fade-up',
			'split-words-blur' => 'fade-up',
			'split-chars'      => 'fade-up',
			'typewriter'       => 'fade',
			'scramble'         => 'fade',
			'scroll-highlight' => 'fade-up',
			'parallax'         => null,
			'parallax-x'       => null,
			'scroll-fade'      => null,
			'scroll-scale'     => null,
			'scroll-rotate'    => null,
			'scroll-expand'    => null,
			'float'            => null,
			'pulse'            => null,
			'sway'             => null,
			'spin'             => null,
		),
		'moderate' => array(),
		'advanced' => array(
			'fade'        => 'blur-in',
			'fade-up'     => 'blur-up',
			'split-words' => 'split-words-blur',
			'zoom-out'    => 'reveal-image',
		),
	);

	/** Multipliers applied by the runtime: distance, duration, stagger. Keep in sync with runtime.js. */
	const SCALE = array(
		'basic'    => array( 0.5, 0.8, 0.7 ),
		'moderate' => array( 1, 1, 1 ),
		'advanced' => array( 1.4, 1.15, 1.3 ),
	);

	/**
	 * @return array<string,array{0:string,1:string}> slug => [label, description]
	 */
	public static function all() {
		return array(
			'basic'    => array( __( 'Basic', 'bricks-motion-studio' ), __( 'Short, subtle fades. No text splitting, blur, clipping, parallax or looping motion.', 'bricks-motion-studio' ) ),
			'moderate' => array( __( 'Moderate', 'bricks-motion-studio' ), __( 'The presets exactly as set in your rules. Balanced for most sites.', 'bricks-motion-studio' ) ),
			'advanced' => array( __( 'Advanced', 'bricks-motion-studio' ), __( 'Richer motion: blur reveals, blurred word headings, image curtain reveals, longer travel and staggers.', 'bricks-motion-studio' ) ),
		);
	}

	public static function valid( $level ) {
		return is_string( $level ) && isset( self::SCALE[ $level ] );
	}

	/** Level for the page being rendered: its page setting, else the site-wide level. */
	public static function site() {
		$level = Bricks_Integration::page_setting( 'bmePageLevel' );
		if ( self::valid( $level ) ) {
			return $level;
		}
		$level = Settings::get( 'level', self::DEFAULT_LEVEL );
		return self::valid( $level ) ? $level : self::DEFAULT_LEVEL;
	}

	/**
	 * Preset for a level. Returns null when the level turns the animation off.
	 *
	 * @param string $preset Preset slug.
	 * @param string $level  Level slug.
	 * @return string|null
	 */
	public static function preset( $preset, $level ) {
		$map = self::MAP[ $level ] ?? array();
		if ( ! array_key_exists( $preset, $map ) ) {
			return $preset;
		}
		$swap = $map[ $preset ];
		return ( null === $swap || Presets::exists( $swap ) ) ? $swap : $preset;
	}
}
