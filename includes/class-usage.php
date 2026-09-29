<?php
/**
 * Per-request usage tracker. Bricks renders every element before wp_footer, so by the
 * time scripts print we know exactly which engines, GSAP plugins and features the page
 * needs — and nothing else is loaded.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Usage {

	/** @var array<string,bool> */
	private static $engines = array();

	/** @var array<string,bool> */
	private static $gsap_plugins = array();

	/** @var array<string,bool> */
	private static $features = array();

	public static function engine( $engine ) {
		if ( $engine ) {
			self::$engines[ $engine ] = true;
		}
	}

	public static function preset( $preset, $engine ) {
		self::engine( $engine );
		if ( 'gsap' === $engine ) {
			foreach ( Presets::gsap_plugins_for( $preset ) as $plugin ) {
				self::$gsap_plugins[ $plugin ] = true;
			}
		}
		self::feature( 'motion' );
	}

	public static function feature( $feature ) {
		self::$features[ $feature ] = true;
	}

	public static function engines() {
		return array_keys( self::$engines );
	}

	public static function gsap_plugins() {
		return array_keys( self::$gsap_plugins );
	}

	public static function has( $feature ) {
		return ! empty( self::$features[ $feature ] );
	}

	/** Anything that needs the runtime (animations, hover, 3D). */
	public static function needs_runtime() {
		return self::has( 'motion' ) || self::has( 'hover' ) || self::has( 'three' );
	}

	public static function any() {
		return ! empty( self::$features ) || ! empty( self::$engines );
	}
}
