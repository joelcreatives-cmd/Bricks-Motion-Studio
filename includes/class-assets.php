<?php
/**
 * Frontend assets: critical boot snippet (anti-flash + fail-safe) in <head>, and
 * conditional loading of libraries/adapters in the footer based on what the page uses.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Assets {

	public function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'register' ), 5 );
		add_action( 'wp_head', array( $this, 'print_boot' ), 2 );
		// Bricks renders popups on wp_footer:10 and WordPress prints footer scripts on wp_footer:20;
		// usage is final at :18 (Bricks_Integration::flush_usage).
		add_action( 'wp_footer', array( $this, 'enqueue' ), 19 );

		// Cloudflare Rocket Loader, LiteSpeed, SiteGround, Autoptimize: keep our own small, deferred
		// scripts out of "delay JS", otherwise content that is already visible animates late.
		add_filter( 'wp_script_attributes', array( $this, 'script_attributes' ) );
		// The settings snippets (window.BME_CONFIG / BME_TL, id "bme-…-js-before") too: a script
		// that starts before its settings arrive runs with none.
		add_filter( 'wp_inline_script_attributes', array( $this, 'script_attributes' ) );

		// Optimization plugins: don't delay the engine, don't strip classes added at runtime.
		add_filter( 'rocket_delay_js_exclusions', array( $this, 'js_exclusions' ) );
		add_filter( 'perfmatters_delay_js_exclusions', array( $this, 'js_exclusions' ) );
		add_filter( 'rocket_rucss_safelist', array( $this, 'css_safelist' ) );
	}

	/**
	 * Handle of a GSAP core script enqueued by someone else, or our own 'bme-gsap'.
	 *
	 * @return string
	 */
	private function external_gsap_handle() {
		if ( null !== $this->gsap_core ) {
			return $this->gsap_core;
		}
		// Any GSAP core another plugin or theme loads is built on, whatever its version: a second core
		// would replace window.gsap and orphan their plugins, which is worse than a version mismatch
		// (the adapter registers each plugin separately and skips one that fails).
		$found = self::external_handle( '#/gsap(?:\.min)?\.js(?:\?|$)#i' );
		/**
		 * Filter the GSAP core handle to build on (return 'bme-gsap' to always use the bundled copy).
		 *
		 * @param string $handle Detected handle, or 'bme-gsap'.
		 */
		$this->gsap_core = (string) apply_filters( 'bme/gsap_core_handle', $found ? $found : 'bme-gsap' );
		return $this->gsap_core;
	}

	/**
	 * A script another plugin or theme queued (directly or as a dependency) whose URL matches.
	 *
	 * @param string $pattern Regex for the script src.
	 * @return string Handle, or ''.
	 */
	private static function external_handle( $pattern ) {
		$scripts = wp_scripts();
		$seen    = array();
		$stack   = array_merge( (array) $scripts->queue, (array) $scripts->done );
		while ( $stack ) {
			$handle = (string) array_pop( $stack );
			if ( isset( $seen[ $handle ] ) || 0 === strpos( $handle, 'bme-' ) || empty( $scripts->registered[ $handle ] ) ) {
				continue;
			}
			$seen[ $handle ] = true;
			$dep             = $scripts->registered[ $handle ];
			if ( preg_match( $pattern, (string) $dep->src ) ) {
				return $handle;
			}
			foreach ( (array) $dep->deps as $child ) {
				$stack[] = $child;
			}
		}
		return '';
	}

	/** @var string|null Resolved GSAP core handle for this request. */
	private $gsap_core = null;

	private function any_library_enabled() {
		foreach ( array_keys( Libraries::VERSIONS ) as $lib ) {
			if ( Settings::library_enabled( $lib ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param mixed $list Exclusion patterns.
	 * @return array
	 */
	public function js_exclusions( $list ) {
		$list   = is_array( $list ) ? $list : array();
		$list[] = basename( BME_PATH ) . '/assets/'; // the folder may have been renamed
		// CDN mode: the libraries themselves must not be delayed either, or the adapters start without them.
		$list[] = 'cdn.jsdelivr.net/npm/gsap@';
		$list[] = 'cdn.jsdelivr.net/npm/animejs@';
		$list[] = 'cdn.jsdelivr.net/npm/motion@';
		$list[] = 'cdn.jsdelivr.net/npm/lenis@';
		$list[] = 'bme-boot';
		$list[] = 'BME_CONFIG';
		$list[] = 'BME_TL';
		return $list;
	}

	/**
	 * @param array $attributes Script tag attributes (WP 6.3+).
	 * @return array
	 */
	public function script_attributes( $attributes ) {
		if ( is_array( $attributes ) && isset( $attributes['id'] ) && 0 === strpos( (string) $attributes['id'], 'bme-' ) ) {
			$attributes['data-cfasync']     = 'false';
			$attributes['data-no-optimize'] = '1';
			$attributes['data-no-defer']    = '1';
		}
		return $attributes;
	}

	/**
	 * @param mixed $list Safelisted selectors.
	 * @return array
	 */
	public function css_safelist( $list ) {
		$list   = is_array( $list ) ? $list : array();
		$list[] = '.bme-(.*)';
		$list[] = '[data-bme(.*)';
		$list[] = '.lenis(.*)';
		return $list;
	}

	public function register() {
		Libraries::register();

		$ver = self::asset_version();
		$js  = BME_URL . 'assets/js/';
		$def = array(
			'in_footer' => true,
			'strategy'  => 'defer',
		);

		$min = self::min();
		wp_register_style( 'bme-frontend', BME_URL . 'assets/css/frontend' . $min . '.css', array(), $ver );

		// Styles go in <head> (not late in the footer): late-style printing/hoisting varies between
		// WordPress versions and is broken by some caching setups. Both files are tiny.
		if ( ! Bricks_Integration::is_passive_context() && $this->any_library_enabled() ) {
			wp_enqueue_style( 'bme-frontend' );
			if ( Settings::library_enabled( 'lenis' ) ) {
				wp_enqueue_style( 'bme-lenis' );
			}
		}
		wp_register_script( 'bme-runtime', $js . 'runtime' . $min . '.js', array(), $ver, $def );

		$gsap_deps = array( 'bme-runtime', 'bme-gsap' );
		wp_register_script( 'bme-adapter-gsap', $js . 'adapter-gsap' . $min . '.js', $gsap_deps, $ver, $def );
		wp_register_script( 'bme-adapter-anime', $js . 'adapter-anime' . $min . '.js', array( 'bme-runtime', 'bme-anime' ), $ver, $def );
		wp_register_script( 'bme-adapter-motion', $js . 'adapter-motion' . $min . '.js', array( 'bme-runtime', 'bme-motion' ), $ver, $def );
		wp_register_script( 'bme-smooth', $js . 'smooth-scroll' . $min . '.js', array( 'bme-runtime', 'bme-lenis' ), $ver, $def );
		wp_register_script( 'bme-timeline', $js . 'timeline' . $min . '.js', array(), $ver, $def );
	}

	/**
	 * Cache-busting version for the plugin's own files: changes whenever a build changes them,
	 * so browsers and page caches never keep serving an older runtime after an update.
	 *
	 * @return string
	 */
	public static function asset_version() {
		static $version = null;
		if ( null === $version ) {
			// Newest of every built file, so a change to any one of them busts caches.
			$min  = self::min();
			$time = 0;
			foreach ( array( 'js/runtime', 'js/adapter-gsap', 'js/adapter-anime', 'js/adapter-motion', 'js/smooth-scroll', 'js/timeline', 'js/three/bme-three' ) as $f ) {
				$time = max( $time, (int) @filemtime( BME_PATH . 'assets/' . $f . ( 'js/three/bme-three' === $f ? '' : $min ) . '.js' ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
			$time    = max( $time, (int) @filemtime( BME_PATH . 'assets/css/frontend' . $min . '.css' ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$version = BME_VERSION . ( $time ? '.' . $time : '' );
		}
		return $version;
	}

	/**
	 * ".min" for the production builds, "" for the readable sources (SCRIPT_DEBUG, or a copy that
	 * was never built). Built files are only used when all of them are present.
	 *
	 * @return string
	 */
	public static function min() {
		static $min = null;
		if ( null === $min ) {
			$min = '';
			if ( ! ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ) {
				$min = '.min';
				foreach ( array( 'js/runtime', 'js/adapter-gsap', 'js/adapter-anime', 'js/adapter-motion', 'js/smooth-scroll', 'js/timeline' ) as $f ) {
					if ( ! is_readable( BME_PATH . 'assets/' . $f . '.min.js' ) ) {
						$min = '';
						break;
					}
				}
				if ( '.min' === $min && ! is_readable( BME_PATH . 'assets/css/frontend.min.css' ) ) {
					$min = '';
				}
			}
		}
		return $min;
	}

	/**
	 * Critical boot: adds html.bme-js so [data-bme-hide] elements start transparent (no flash
	 * of the final state), switches everything off for reduced-motion / small screens, and
	 * reveals everything if the runtime has not started within the fail-safe window (e.g. a
	 * "delay JS" optimizer held scripts back, or a script failed).
	 */
	public function print_boot() {
		if ( Bricks_Integration::is_passive_context() || ! Settings::get( 'perf.fouc' ) ) {
			return;
		}

		$reduced   = (string) Settings::get( 'a11y.reduced', 'respect' );
		$min_width = (int) Settings::get( 'a11y.min_width', 0 );
		$failsafe  = (int) Settings::get( 'perf.failsafe', 3000 );

		// Auto-animated elements inside excluded containers (sliders, off-canvas…) are skipped by
		// the runtime, so never hide them in the first place. An invalid user selector only drops
		// this rule, and then nothing is hidden — the safe failure mode.
		$exclude = (string) Settings::get( 'auto.exclude', '' );
		$not     = ( $exclude && Settings::balanced_selector( $exclude ) ) ? ':not(:is(' . $exclude . ') [data-bme-opts*=\'"auto"\'])' : '';
		// 0.01 instead of 0: visually invisible, but still a painted LCP candidate (Chrome ignores opacity:0).
		$css = 'html.bme-js:not(.bme-off):not(.bme-failsafe) [data-bme-hide]' . $not . '{opacity:.01}';
		// Late or unseen content is handled by the runtime's own safety net (no CSS animation here:
		// it would replace animations the element already has).
		// Timelines that fade their element in from its first keyframe (timeline.js lifts the flag).
		$css .= 'html.bme-js:not(.bme-off):not(.bme-failsafe) [data-bme-tl-hide]{opacity:.01}';
		$css .= '@media print{[data-bme-hide],[data-bme-tl-hide]{opacity:1!important}}';
		printf( "<style id=\"bme-boot-css\">%s</style>\n", $css ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

		$js = sprintf(
			'(function(d,w){var h=d.documentElement;h.classList.add("bme-js");try{var r=w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches;if((r&&%1$s)||(%2$d&&w.innerWidth<%2$d)){h.classList.add("bme-off")}}catch(e){}w.setTimeout(function(){if(!(w.BricksMotion&&w.BricksMotion.started)){h.classList.add("bme-failsafe")}},%3$d);d.addEventListener("DOMContentLoaded",function(){if(!w.BricksMotion){h.classList.add("bme-failsafe")}})})(document,window);',
			'respect' === $reduced ? 'true' : 'false',
			$min_width,
			$failsafe
		);

		/**
		 * Attributes that keep caching/optimization plugins from deferring or delaying the boot snippet
		 * (LiteSpeed, Autoptimize, WP Rocket, Cloudflare Rocket Loader, SiteGround, Perfmatters…).
		 *
		 * @param array $attributes
		 */
		$attributes = apply_filters(
			'bme/boot_script_attributes',
			array(
				'id'                      => 'bme-boot',
				'data-no-optimize'        => '1',
				'data-no-defer'           => '1',
				'data-noptimize'          => '1',
				'data-cfasync'            => 'false',
				'data-pagespeed-no-defer' => true,
				'nowprocket'              => true,
			)
		);

		wp_print_inline_script_tag( $js, $attributes );
	}

	/**
	 * Enqueue only what the rendered page needs.
	 */
	public function enqueue() {
		// The builder canvas loads everything (live preview: Builder / builder-canvas.js).
		$canvas = Builder::canvas();
		if ( ! $canvas && Bricks_Integration::is_passive_context() ) {
			return;
		}

		$always      = $canvas || (bool) Settings::get( 'perf.always' );
		$needs_anim  = $always || Usage::has( 'motion' ) || Usage::has( 'hover' );
		$needs_three = Usage::has( 'three' ) && Settings::library_enabled( 'three' );
		$needs_tl    = $always || Usage::has( 'timeline' );
		$lenis       = ! $canvas && Settings::library_enabled( 'lenis' ); // never hijack the builder's own scrolling

		/**
		 * Filter whether this page loads the Motion Studio at all.
		 *
		 * @param bool $load
		 */
		if ( ! apply_filters( 'bme/load', $needs_anim || $needs_three || $needs_tl || $lenis ) ) {
			return;
		}

		// Timelines run on their own small script (no runtime, no library).
		if ( $needs_tl ) {
			wp_enqueue_script( 'bme-timeline' );
			wp_add_inline_script( 'bme-timeline', 'window.BME_TL=' . wp_json_encode( self::timeline_config() ) . ';', 'before' );
			if ( ! $needs_anim && ! $needs_three && ! $lenis ) {
				return;
			}
		}

		wp_enqueue_style( 'bme-frontend' ); // Normally already enqueued in <head>; harmless if so.

		$engines = $always ? Settings::enabled_tween_engines() : array_values( array_intersect( Settings::enabled_tween_engines(), Usage::engines() ) );

		// Hover effects, counters, scroll-highlight and SVG drawing run inside the runtime without an
		// engine, so a page using only those downloads no animation library at all.

		$gsap_plugins = $always ? array_merge( array( 'ScrollTrigger', 'SplitText' ), Usage::gsap_plugins() ) : Usage::gsap_plugins();
		if ( $canvas ) {
			$gsap_plugins = Libraries::GSAP_PLUGINS; // any preset can be previewed
		}

		foreach ( $engines as $engine ) {
			if ( 'gsap' === $engine ) {
				// Another plugin/theme already loads GSAP core: build on that copy instead of loading a
				// second one (a second core would replace window.gsap and orphan their plugins).
				$core = $this->external_gsap_handle();
				$deps = array( 'bme-runtime', $core );
				foreach ( array_unique( $gsap_plugins ) as $plugin ) {
					if ( in_array( $plugin, Libraries::GSAP_PLUGINS, true ) ) {
						$handle = Libraries::gsap_plugin_handle( $plugin );
						// Their copy of this plugin too, if they load one (two ScrollTriggers would each
						// listen to scrolling and refresh separately).
						$theirs = 'bme-gsap' !== $core ? self::external_handle( '#/' . preg_quote( $plugin, '#' ) . '(?:\.min)?\.js(?:\?|$)#i' ) : '';
						if ( $theirs ) {
							$deps[] = $theirs;
							continue;
						}
						if ( 'bme-gsap' !== $core ) {
							wp_deregister_script( $handle );
							wp_register_script( $handle, Libraries::url( 'gsap', $plugin . '.min.js' ), array( $core ), Libraries::VERSIONS['gsap'], array( 'in_footer' => true, 'strategy' => 'defer' ) );
						}
						$deps[] = $handle;
					}
				}
				// Re-register the adapter with the exact plugin list this page needs.
				wp_deregister_script( 'bme-adapter-gsap' );
				wp_register_script(
					'bme-adapter-gsap',
					BME_URL . 'assets/js/adapter-gsap' . self::min() . '.js',
					$deps,
					self::asset_version(),
					array(
						'in_footer' => true,
						'strategy'  => 'defer',
					)
				);
			}
			wp_enqueue_script( 'bme-adapter-' . $engine );
		}

		if ( $lenis ) {
			$deps = array( 'bme-runtime', 'bme-lenis' );
			if ( in_array( 'gsap', $engines, true ) ) {
				$deps[] = 'bme-adapter-gsap';
			}
			wp_deregister_script( 'bme-smooth' );
			wp_register_script(
				'bme-smooth',
				BME_URL . 'assets/js/smooth-scroll' . self::min() . '.js',
				$deps,
				self::asset_version(),
				array(
					'in_footer' => true,
					'strategy'  => 'defer',
				)
			);
			wp_enqueue_script( 'bme-smooth' );
		}

		wp_enqueue_script( 'bme-runtime' );
		wp_add_inline_script( 'bme-runtime', 'window.BME_CONFIG=' . wp_json_encode( $this->config( $engines, $needs_three, $needs_tl ) ) . ';', 'before' );

		if ( $canvas ) {
			wp_enqueue_script( 'bme-builder-canvas', BME_URL . 'assets/js/builder-canvas.js', array( 'bme-runtime', 'bme-timeline' ), self::asset_version(), true );
		}
	}

	/** Settings timeline.js reads (window.BME_TL). */
	private static function timeline_config() {
		return array(
			'reduced'  => Settings::get( 'a11y.reduced', 'respect' ),
			'minWidth' => (int) Settings::get( 'a11y.min_width', 0 ),
		);
	}

	/**
	 * Runtime configuration.
	 *
	 * @param string[] $engines     Engines loaded on this page.
	 * @param bool     $needs_three Page has 3D scenes.
	 * @param bool     $has_tl      timeline.js is already loaded on this page.
	 * @return array
	 */
	private function config( array $engines, $needs_three, $has_tl = true ) {
		$s = Settings::all();

		$config = array(
			'version'          => BME_VERSION,
			'debug'            => (bool) $s['debug'],
			'engine'           => Settings::default_engine(),
			'engines'          => $engines,
			'native'           => (bool) $s['perf']['native'],
			'ownGsap'          => ! in_array( 'gsap', $engines, true ) || 'bme-gsap' === $this->external_gsap_handle(),
			'defaults'         => $s['defaults'],
			'exclude'          => (string) $s['auto']['exclude'],
			'popups'           => ! $s['auto']['skip_popups'],
			'skipInteractions' => (bool) $s['auto']['skip_interactions'],
			'failsafe'         => (int) $s['perf']['failsafe'],
			'reduced'          => $s['a11y']['reduced'],
			'minWidth'         => (int) $s['a11y']['min_width'],
			// The built-in catalog is baked into runtime.min.js (cached across pages).
			'presets'          => ( '' === self::min() || has_filter( 'bme/presets' ) ) ? Presets::all() : null,
			// "My presets": the built-in catalog is baked into runtime.min.js, these are added to it.
			'customPresets'    => ( '' === self::min() || has_filter( 'bme/presets' ) ) ? null : ( Presets::custom() ? Presets::custom() : null ),
			'lenis'            => Settings::library_enabled( 'lenis' ) ? $s['lenis'] : null,
			'three'            => null,
			// Timelines that only arrive later (AJAX popups, query filters): load timeline.js then.
			'timeline'         => $has_tl ? null : array_merge(
				self::timeline_config(),
				array( 'src' => BME_URL . 'assets/js/timeline' . self::min() . '.js?ver=' . rawurlencode( self::asset_version() ) )
			),
		);

		if ( Settings::library_enabled( 'three' ) ) {
			$config['three'] = array(
				'url'    => BME_URL . 'assets/js/three/bme-three.js?ver=' . rawurlencode( self::asset_version() ),
				'dpr'    => (float) $s['three']['dpr'],
				'mobile' => (bool) $s['three']['mobile'],
				'eager'  => $needs_three,
			);
		}

		/**
		 * Filter the runtime configuration passed to window.BME_CONFIG.
		 *
		 * @param array $config
		 */
		return apply_filters(
			'bme/runtime_config',
			array_filter(
				$config,
				static function ( $v ) {
					return null !== $v;
				}
			)
		);
	}
}
