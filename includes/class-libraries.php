<?php
/**
 * Library registry: versions, local (bundled) + CDN sources, script handles.
 *
 * Every third-party library is registered under a "bme-" prefixed handle so it never
 * collides with a copy another plugin registers under a generic handle such as "gsap".
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Libraries {

	const VERSIONS = array(
		'gsap'   => '3.15.0',
		'three'  => '0.186.1',
		'lenis'  => '1.3.26',
		'anime'  => '4.5.0',
		'motion' => '13.4.5',
	);

	/** GSAP plugins shipped with the plugin (all free since GSAP 3.13). */
	const GSAP_PLUGINS = array( 'ScrollTrigger', 'SplitText', 'ScrambleTextPlugin', 'DrawSVGPlugin' );

	/**
	 * Human-readable library metadata for the admin screen.
	 *
	 * @return array
	 */
	public static function meta() {
		return array(
			'gsap'   => array(
				'label'   => 'GSAP',
				'role'    => __( 'Primary animation engine: reveals, text splitting (SplitText), scroll-linked scrubbing & pinning (ScrollTrigger), scramble text, SVG drawing.', 'bricks-motion-studio' ),
				'size'    => __( '≈ 73 KB core + ≈ 45 KB ScrollTrigger (+ plugins only when used)', 'bricks-motion-studio' ),
				'license' => __( 'GSAP Standard "no charge" License (free, including commercial use; not GPL). Read the license before redistributing this plugin.', 'bricks-motion-studio' ),
				'url'     => 'https://gsap.com/standard-license',
			),
			'anime'  => array(
				'label'   => 'Anime.js',
				'role'    => __( 'Alternative lightweight tween engine for reveals, stagger, loops and scroll-synced animations.', 'bricks-motion-studio' ),
				'size'    => __( '≈ 49 KB bundled (slim build) · 118 KB from the CDN', 'bricks-motion-studio' ),
				'license' => 'MIT',
				'url'     => 'https://animejs.com',
			),
			'motion' => array(
				'label'   => 'Motion (motion.dev)',
				'role'    => __( 'Alternative engine built on the Web Animations API (hardware accelerated): reveals, stagger, loops, scroll-linked animations.', 'bricks-motion-studio' ),
				'size'    => __( '≈ 64 KB bundled (slim build) · 147 KB from the CDN', 'bricks-motion-studio' ),
				'license' => 'MIT',
				'url'     => 'https://motion.dev',
			),
			'three'  => array(
				'label'   => 'Three.js',
				'role'    => __( 'WebGL 3D: animated backgrounds for sections/containers (gradient, particles, waves, orbs) and the "3D Scene" element (incl. GLB/GLTF models). Loaded lazily only when a 3D element nears the viewport.', 'bricks-motion-studio' ),
				'size'    => __( 'Tree-shaken bundle, lazy-loaded', 'bricks-motion-studio' ),
				'license' => 'MIT',
				'url'     => 'https://threejs.org',
			),
			'lenis'  => array(
				'label'   => 'Lenis',
				'role'    => __( 'Smooth scrolling, synchronized with GSAP ScrollTrigger when GSAP is active. Automatically pauses for Bricks popups and off-canvas.', 'bricks-motion-studio' ),
				'size'    => __( '≈ 19 KB', 'bricks-motion-studio' ),
				'license' => 'MIT',
				'url'     => 'https://lenis.darkroom.engineering',
			),
		);
	}

	/**
	 * Source URL for a vendor file.
	 *
	 * @param string $lib  Library key.
	 * @param string $file File name inside assets/vendor/{lib}/.
	 * @return string
	 */
	public static function url( $lib, $file ) {
		$cdn = 'cdn' === Settings::get( 'source' );

		if ( $cdn ) {
			$v   = self::VERSIONS[ $lib ] ?? '';
			$map = array(
				'gsap'   => "https://cdn.jsdelivr.net/npm/gsap@{$v}/dist/{$file}",
				'lenis'  => "https://cdn.jsdelivr.net/npm/lenis@{$v}/dist/{$file}",
				'anime'  => "https://cdn.jsdelivr.net/npm/animejs@{$v}/dist/bundles/{$file}",
				'motion' => "https://cdn.jsdelivr.net/npm/motion@{$v}/dist/{$file}",
			);
			if ( isset( $map[ $lib ] ) ) {
				return $map[ $lib ];
			}
		}

		return BME_URL . "assets/vendor/{$lib}/{$file}";
	}

	/** @var array<string,string> handle => "lib/file" for CDN integrity checks. */
	private static $cdn_files = array();

	/**
	 * Adds Subresource Integrity to CDN tags so a tampered CDN file is refused by the browser.
	 *
	 * @param string $tag    HTML tag.
	 * @param string $handle Handle.
	 * @return string
	 */
	public static function integrity( $tag, $handle ) {
		if ( empty( self::$cdn_files[ $handle ] ) || false !== strpos( $tag, ' integrity=' ) ) {
			return $tag;
		}
		static $sri = null;
		if ( null === $sri ) {
			$json = @file_get_contents( BME_PATH . 'includes/data/sri.json' ); // phpcs:ignore
			$sri  = json_decode( (string) $json, true );
			$sri  = is_array( $sri ) ? $sri : array();
		}
		$hash = $sri[ self::$cdn_files[ $handle ] ] ?? '';
		if ( ! $hash || ! preg_match( '#^sha384-[A-Za-z0-9+/=]+$#', $hash ) ) {
			return $tag;
		}
		return preg_replace( '#<(script|link)\s#', '<$1 integrity="' . esc_attr( $hash ) . '" crossorigin="anonymous" ', $tag, 1 );
	}

	/**
	 * Register every library script/style (enqueued later only when needed).
	 */
	public static function register() {
		if ( 'cdn' === Settings::get( 'source' ) ) {
			self::$cdn_files = array(
				'bme-gsap'   => 'gsap/gsap.min.js',
				'bme-anime'  => 'anime/anime.umd.min.js',
				'bme-motion' => 'motion/motion.js',
				'bme-lenis'  => 'lenis/lenis.min.js',
			);
			foreach ( self::GSAP_PLUGINS as $plugin ) {
				self::$cdn_files[ self::gsap_plugin_handle( $plugin ) ] = 'gsap/' . $plugin . '.min.js';
			}
			add_filter( 'script_loader_tag', array( __CLASS__, 'integrity' ), 10, 2 );
			add_filter(
				'style_loader_tag',
				static function ( $tag, $handle ) {
					return 'bme-lenis' === $handle ? str_replace( '<link ', '<link integrity="' . esc_attr( self::sri_for( 'lenis/lenis.css' ) ) . '" crossorigin="anonymous" ', $tag ) : $tag;
				},
				10,
				2
			);
		}
		$in_footer = array(
			'in_footer' => true,
			'strategy'  => 'defer',
		);

		// GSAP core + plugins.
		wp_register_script( 'bme-gsap', self::url( 'gsap', 'gsap.min.js' ), array(), self::VERSIONS['gsap'], $in_footer );
		foreach ( self::GSAP_PLUGINS as $plugin ) {
			wp_register_script( 'bme-gsap-' . strtolower( $plugin ), self::url( 'gsap', $plugin . '.min.js' ), array( 'bme-gsap' ), self::VERSIONS['gsap'], $in_footer );
		}

		// Bundled copies of Anime.js and Motion are slim builds with only the functions the adapters
		// call (see bin/build-js.mjs); CDN mode loads the full, integrity-checked npm builds.
		$cdn   = 'cdn' === Settings::get( 'source' );
		$anime = $cdn ? 'anime.umd.min.js' : 'anime.slim.min.js';
		$mtn   = $cdn ? 'motion.js' : 'motion.slim.min.js';
		wp_register_script( 'bme-anime', self::url( 'anime', $anime ), array(), self::VERSIONS['anime'], $in_footer );
		wp_register_script( 'bme-motion', self::url( 'motion', $mtn ), array(), self::VERSIONS['motion'], $in_footer );
		wp_register_script( 'bme-lenis', self::url( 'lenis', 'lenis.min.js' ), array(), self::VERSIONS['lenis'], $in_footer );
		wp_register_style( 'bme-lenis', self::url( 'lenis', 'lenis.css' ), array(), self::VERSIONS['lenis'] );
	}

	private static function sri_for( $file ) {
		$json = @file_get_contents( BME_PATH . 'includes/data/sri.json' ); // phpcs:ignore
		$sri  = json_decode( (string) $json, true );
		return is_array( $sri ) && ! empty( $sri[ $file ] ) ? $sri[ $file ] : '';
	}

	/**
	 * Script handle for a GSAP plugin name.
	 *
	 * @param string $plugin e.g. "SplitText".
	 * @return string
	 */
	public static function gsap_plugin_handle( $plugin ) {
		return 'bme-gsap-' . strtolower( $plugin );
	}
}
