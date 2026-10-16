<?php
/**
 * Settings schema, defaults, sanitization and accessors.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Settings {

	/** @var array|null Request cache. */
	private static $cache = null;

	/**
	 * Default settings.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'libraries'      => array(
				'gsap'   => 1,
				'three'  => 1,
				'lenis'  => 0,
				'anime'  => 0,
				'motion' => 0,
			),
			// live: everyone sees animations; editors: only logged-in editors (build and review
			// before launch); off: no Motion Studio output anywhere on the frontend.
			'status'         => 'live',
			'default_engine' => 'gsap',
			'source'         => 'local',
			'level'          => 'moderate',
			'auto'           => array(
				'enabled'           => 1,
				'skip_header'       => 1,
				'skip_footer'       => 0,
				'skip_popups'       => 0,
				'skip_interactions' => 1,
				'exclude'           => '.splide, .swiper, .brxe-slider, .brxe-carousel, .brxe-offcanvas, .brxe-nav-menu, .brxe-nav-nested, .brxe-back-to-top, [data-bme-skip]',
				'rules'             => self::default_rules(),
			),
			'defaults'       => array(
				'duration' => 0.8,
				'delay'    => 0,
				'ease'     => 'smooth',
				'distance' => 40,
				'stagger'  => 0.08,
				'offset'   => 12,
				'batch'    => 0.08,
				'speed'    => 0.3,
				'replay'   => 0,
				'pace'     => 1, // site-wide speed: 2 plays every animation twice as fast
			),
			'lenis'          => array(
				'lerp'    => 0.1,
				'wheel'   => 1,
				'touch'   => 0,
				'anchors' => 1,
			),
			'three'          => array(
				'dpr'    => 1.5,
				'mobile' => 1,
			),
			'a11y'           => array(
				'reduced'   => 'respect',
				'min_width' => 0,
			),
			'perf'           => array(
				'fouc'          => 1,
				'failsafe'      => 3000,
				'always'        => 0,
				'native'        => 1,
				'clip_x'        => 1, // animations never make the page scroll sideways
				'off_paths'     => '', // one URL path per line: no Motion Studio output there
				'native_scroll' => 1, // scroll effects on the browser's own scroll timelines where supported
			),
			// Site-wide effects (Effects panel).
			'effects'        => array(
				'transition'          => 'off', // off | fade | slide | zoom: animated page-to-page navigation
				'transition_duration' => 0.35,
				'cursor'              => 'off', // off | dot | ring | both
				'cursor_color'        => '',
				'cursor_hide'         => 0,     // hide the system cursor where the custom one shows
				'intro'               => 'off', // off | fade | curtain: a short intro before the page shows
				'intro_color'         => '',
				'intro_text'          => '',
				'intro_every'         => 0,     // 0: first page of a visit only
				'page_progress'       => 0,     // --bme-page-progress (0..1) on <html> while scrolling
			),
			// Motion Studio → Features: each per-element feature can be switched off site-wide; off,
			// the elements that use it show as designed (their settings are kept).
			'features'       => array_fill_keys( self::FEATURES, 1 ),
			'admin_bar'      => 1, // Motion Studio menu in the admin bar on the frontend
			'debug'          => 0,
			// "My presets": a built-in preset with your own timing, picked like any other preset.
			'custom_presets' => array(),
		);
	}

	/**
	 * Default auto-animate rules (element type or CSS class → preset).
	 *
	 * @return array
	 */
	public static function default_rules() {
		$rule = static function ( $target, $preset, $scope = 'self', $type = 'element', $enabled = 1 ) {
			return array(
				'enabled' => $enabled,
				'type'    => $type,
				'target'  => $target,
				'preset'  => $preset,
				'scope'   => $scope,
				'engine'  => '',
				'where'   => '',
				'screens' => '',
			);
		};

		return array(
			$rule( 'heading', 'split-words' ),
			$rule( 'text-basic', 'fade-up' ),
			$rule( 'text', 'fade-up' ),
			$rule( 'image', 'zoom-out' ),
			$rule( 'button', 'fade-up' ),
			$rule( 'icon', 'zoom-in' ),
			$rule( 'icon-box', 'fade-up' ),
			$rule( 'list', 'fade-up', 'children' ),
			$rule( 'social-icons', 'fade-up', 'children' ),
			$rule( 'video', 'fade-up' ),
			$rule( 'divider', 'clip-right' ),
			$rule( 'posts', 'fade-up', '.bricks-layout-item' ),
			$rule( 'image-gallery', 'fade-up', '.bricks-layout-item' ),
			$rule( 'post-title', 'split-words' ),
			$rule( 'pie-chart', 'zoom-in' ),
			$rule( 'bme-reveal', 'fade-up', 'self', 'class', 0 ),
			// Catch-all: every other content element (never wrappers or nestable containers).
			$rule( '*', 'fade-up' ),
		);
	}

	/**
	 * All settings merged over defaults.
	 *
	 * @return array
	 */
	public static function all() {
		if ( null === self::$cache ) {
			$saved       = get_option( BME_OPTION, array() );
			self::$cache = self::merge( self::defaults(), is_array( $saved ) ? $saved : array() );
		}
		return self::$cache;
	}

	/**
	 * Read a setting by dot path, e.g. "auto.enabled".
	 *
	 * @param string $path    Dot path.
	 * @param mixed  $default Fallback.
	 * @return mixed
	 */
	public static function get( $path, $default = null ) {
		// Memoized: rendering calls this for every element and loop item.
		if ( array_key_exists( $path, self::$memo ) ) {
			return null === self::$memo[ $path ] ? $default : self::$memo[ $path ];
		}
		$value = self::all();
		foreach ( explode( '.', $path ) as $key ) {
			if ( ! is_array( $value ) || ! array_key_exists( $key, $value ) ) {
				self::$memo[ $path ] = null;
				return $default;
			}
			$value = $value[ $key ];
		}
		self::$memo[ $path ] = $value;
		return $value;
	}

	/** @var array<string,mixed> Resolved dot paths. */
	private static $memo = array();

	public static function flush() {
		self::$cache = null;
		self::$memo  = array();
		Presets::flush(); // "My presets" live in the settings
	}

	public static function library_enabled( $lib ) {
		return ! empty( self::get( 'libraries.' . $lib ) );
	}

	/**
	 * Enabled engines able to run tween presets, default engine first.
	 *
	 * @return string[]
	 */
	public static function enabled_tween_engines() {
		$out = array();
		foreach ( Presets::TWEEN_ENGINES as $engine ) {
			if ( self::library_enabled( $engine ) ) {
				$out[] = $engine;
			}
		}
		$default = self::default_engine();
		if ( $default && in_array( $default, $out, true ) ) {
			$out = array_values( array_unique( array_merge( array( $default ), $out ) ) );
		}
		return $out;
	}

	/**
	 * The effective default engine (falls back to the first enabled tween engine).
	 *
	 * @return string Empty when no tween engine is enabled.
	 */
	public static function default_engine() {
		$engine = (string) self::get( 'default_engine', 'gsap' );
		if ( in_array( $engine, Presets::TWEEN_ENGINES, true ) && self::library_enabled( $engine ) ) {
			return $engine;
		}
		foreach ( Presets::TWEEN_ENGINES as $candidate ) {
			if ( self::library_enabled( $candidate ) ) {
				return $candidate;
			}
		}
		return '';
	}

	/**
	 * Recursive merge where saved scalars override defaults; list values (rules) are replaced wholesale.
	 *
	 * @param array $defaults Defaults.
	 * @param array $saved    Saved values.
	 * @return array
	 */
	private static function merge( array $defaults, array $saved ) {
		foreach ( $saved as $key => $value ) {
			// Lists of rows (rules, My presets) are taken whole, not merged key by key.
			if ( 'rules' === $key || 'custom_presets' === $key ) {
				$defaults[ $key ] = is_array( $value ) ? array_values( $value ) : array();
				continue;
			}
			if ( isset( $defaults[ $key ] ) && is_array( $defaults[ $key ] ) ) {
				// A group (libraries, perf…) only merges an array; a stray scalar never replaces it.
				if ( is_array( $value ) ) {
					$defaults[ $key ] = self::merge( $defaults[ $key ], $value );
				}
			} elseif ( array_key_exists( $key, $defaults ) && ! is_array( $value ) ) {
				$defaults[ $key ] = $value;
			}
		}
		return $defaults;
	}

	/* ---------------------------------------------------------------------
	 * Sanitization
	 * ------------------------------------------------------------------ */

	/**
	 * "My presets": stable slug (my-…), a name, the built-in preset it is based on, and optional
	 * timing. Empty fields mean "as the base preset / site default".
	 *
	 * @param mixed $list Submitted rows.
	 * @return array[]
	 */
	public static function sanitize_custom_presets( $list ) {
		$out  = array();
		$base = Presets::builtin();
		foreach ( array_slice( is_array( $list ) ? $list : array(), 0, 50 ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$slug = is_string( $row['slug'] ?? null ) ? strtolower( $row['slug'] ) : '';
			$from = is_string( $row['base'] ?? null ) ? $row['base'] : '';
			if ( ! preg_match( '/^my-[a-z0-9-]{1,40}$/', $slug ) || ! isset( $base[ $from ] ) || isset( $out[ $slug ] ) ) {
				continue;
			}
			$label = is_scalar( $row['label'] ?? null ) ? trim( sanitize_text_field( (string) $row['label'] ) ) : '';
			$item  = array(
				'slug'  => $slug,
				'label' => '' !== $label ? ( function_exists( 'mb_substr' ) ? mb_substr( $label, 0, 60 ) : wp_html_excerpt( $label, 60 ) ) : __( 'My preset', 'bricks-motion-studio' ),
				'base'  => $from,
			);
			foreach ( array( 'duration' => 10, 'delay' => 10, 'distance' => 400, 'stagger' => 2 ) as $key => $max ) {
				if ( isset( $row[ $key ] ) && is_scalar( $row[ $key ] ) && '' !== trim( (string) $row[ $key ] ) && is_numeric( $row[ $key ] ) ) {
					$item[ $key ] = round( min( $max, max( 0, (float) $row[ $key ] ) ), 3 );
				}
			}
			$ease = is_string( $row['ease'] ?? null ) ? $row['ease'] : '';
			if ( isset( self::eases()[ $ease ] ) ) {
				$item['ease'] = $ease;
			}
			// The motion itself (preset builder): where the element starts. Empty = as the base.
			$from = array();
			if ( isset( $row['from'] ) && is_array( $row['from'] ) && Presets::shapeable( $base[ $item['base'] ] ) ) {
				foreach ( self::MOTION_RANGES as $key => $range ) {
					$v = $row['from'][ $key ] ?? null;
					if ( is_scalar( $v ) && '' !== trim( (string) $v ) && is_numeric( $v ) ) {
						$from[ $key ] = round( min( $range[1], max( $range[0], (float) $v ) ), 3 );
					}
				}
			}
			if ( $from ) {
				$item['from'] = $from;
			}
			$out[ $slug ] = $item;
		}
		return array_values( $out );
	}

	/**
	 * Site status (live / editors / off), checked: a value that isn't one of them (a damaged or
	 * hand-edited option) reads as live instead of reaching code that looks it up.
	 *
	 * @return string
	 */
	public static function status() {
		$status = self::get( 'status', 'live' );
		return in_array( $status, array( 'live', 'editors', 'off' ), true ) ? $status : 'live';
	}

	/** Per-element features with their own site-wide switch (Motion Studio → Features). */
	const FEATURES = array( 'hover', 'roll', 'timeline', 'recipes', 'click', 'stagger_order', 'boost', 'mouse', 'follow', 'inview', 'skew', 'progress', 'lottie', 'sequence' );

	/**
	 * Is a per-element feature switched on (Motion Studio → Features)?
	 *
	 * @param string $key One of FEATURES.
	 * @return bool
	 */
	public static function feature( $key ) {
		$f = self::get( 'features', array() );
		return ! is_array( $f ) || ! array_key_exists( $key, $f ) || ! empty( $f[ $key ] );
	}

	/** Preset builder: start values a preset of your own can set (min, max). */
	const MOTION_RANGES = array(
		'opacity' => array( 0, 1 ),
		'x'       => array( -1000, 1000 ),
		'y'       => array( -1000, 1000 ),
		'scale'   => array( 0, 3 ),
		'rotate'  => array( -360, 360 ),
		'blur'    => array( 0, 50 ),
	);

	public static function eases() {
		return array(
			'smooth'  => __( 'Smooth (cubic out)', 'bricks-motion-studio' ),
			'soft'    => __( 'Soft (quad out)', 'bricks-motion-studio' ),
			'strong'  => __( 'Strong (expo out)', 'bricks-motion-studio' ),
			'in-out'  => __( 'In-out', 'bricks-motion-studio' ),
			'back'    => __( 'Back (overshoot)', 'bricks-motion-studio' ),
			'elastic' => __( 'Elastic', 'bricks-motion-studio' ),
			'bounce'  => __( 'Bounce', 'bricks-motion-studio' ),
			'sine'    => __( 'Sine in-out', 'bricks-motion-studio' ),
			'linear'  => __( 'Linear', 'bricks-motion-studio' ),
		);
	}

	/**
	 * Sanitize the whole option array (Settings API callback).
	 *
	 * @param mixed $input Raw input.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$d = self::defaults();
		// Already unslashed: options.php unslashes the form, and update_option() runs this again on
		// its result (unslashing here would eat backslashes, twice).
		$in  = is_array( $input ) ? $input : array();
		$out = array();

		// Only what was submitted changes. A setting missing from the submission (a settings tab
		// opened before an update added it, a partial import) keeps its current value instead of
		// being read as "off". Unchecked switches still arrive as an explicit 0, and the rule list
		// is replaced as a whole (the form always sends it, empty included).
		$in = self::merge( self::all(), $in );

		// Libraries.
		foreach ( $d['libraries'] as $lib => $unused ) {
			$out['libraries'][ $lib ] = empty( $in['libraries'][ $lib ] ) ? 0 : 1;
		}

		$out['status']         = self::pick( $in['status'] ?? '', array( 'live', 'editors', 'off' ), 'live' );
		$out['default_engine'] = self::pick( $in['default_engine'] ?? '', Presets::TWEEN_ENGINES, $d['default_engine'] );
		$out['source']         = self::pick( $in['source'] ?? '', array( 'local', 'cdn' ), 'local' );
		$out['level']          = self::pick( $in['level'] ?? '', array_keys( Levels::SCALE ), $d['level'] );

		// Auto-animate.
		$auto                             = $in['auto'] ?? array();
		$out['auto']['enabled']           = empty( $auto['enabled'] ) ? 0 : 1;
		$out['auto']['skip_header']       = empty( $auto['skip_header'] ) ? 0 : 1;
		$out['auto']['skip_footer']       = empty( $auto['skip_footer'] ) ? 0 : 1;
		$out['auto']['skip_popups']       = empty( $auto['skip_popups'] ) ? 0 : 1;
		$out['auto']['skip_interactions'] = empty( $auto['skip_interactions'] ) ? 0 : 1;
		// A broken selector drops only itself, never the rest of the list.
		$out['auto']['exclude'] = self::balanced_parts( self::sanitize_selector_list( $auto['exclude'] ?? '' ) );
		$out['auto']['rules']   = self::sanitize_rules( $auto['rules'] ?? array() );

		// Defaults.
		$df                          = $in['defaults'] ?? array();
		$out['defaults']['duration'] = self::num( $df['duration'] ?? null, 0, 10, $d['defaults']['duration'] );
		$out['defaults']['delay']    = self::num( $df['delay'] ?? null, 0, 10, $d['defaults']['delay'] );
		$out['defaults']['ease']     = self::pick( $df['ease'] ?? '', array_keys( self::eases() ), 'smooth' );
		$out['defaults']['distance'] = self::num( $df['distance'] ?? null, 0, 400, $d['defaults']['distance'] );
		$out['defaults']['stagger']  = self::num( $df['stagger'] ?? null, 0, 2, $d['defaults']['stagger'] );
		$out['defaults']['offset']   = self::num( $df['offset'] ?? null, 0, 50, $d['defaults']['offset'] );
		$out['defaults']['batch']    = self::num( $df['batch'] ?? null, 0, 1, $d['defaults']['batch'] );
		$out['defaults']['speed']    = self::num( $df['speed'] ?? null, -2, 2, $d['defaults']['speed'] );
		$out['defaults']['replay']   = empty( $df['replay'] ) ? 0 : 1;
		$out['defaults']['pace']     = self::num( $df['pace'] ?? null, 0.25, 4, $d['defaults']['pace'] );

		// Lenis.
		$ln                      = $in['lenis'] ?? array();
		$out['lenis']['lerp']    = self::num( $ln['lerp'] ?? null, 0.01, 1, $d['lenis']['lerp'] );
		$out['lenis']['wheel']   = self::num( $ln['wheel'] ?? null, 0.1, 5, $d['lenis']['wheel'] );
		$out['lenis']['touch']   = empty( $ln['touch'] ) ? 0 : 1;
		$out['lenis']['anchors'] = empty( $ln['anchors'] ) ? 0 : 1;

		// Three.
		$th                     = $in['three'] ?? array();
		$out['three']['dpr']    = self::num( $th['dpr'] ?? null, 0.5, 3, $d['three']['dpr'] );
		$out['three']['mobile'] = empty( $th['mobile'] ) ? 0 : 1;

		// Accessibility.
		$a                        = $in['a11y'] ?? array();
		$out['a11y']['reduced']   = self::pick( $a['reduced'] ?? '', array( 'respect', 'fade', 'ignore' ), 'respect' );
		$out['a11y']['min_width'] = (int) self::num( $a['min_width'] ?? null, 0, 4000, 0 );

		// Performance.
		$p                       = $in['perf'] ?? array();
		$out['perf']['fouc']     = empty( $p['fouc'] ) ? 0 : 1;
		$out['perf']['failsafe'] = (int) self::num( $p['failsafe'] ?? null, 500, 15000, $d['perf']['failsafe'] );
		$out['perf']['always']   = empty( $p['always'] ) ? 0 : 1;
		$out['perf']['native']   = empty( $p['native'] ) ? 0 : 1;
		// Older exports don't have it: keep the default instead of reading "missing" as off.
		$out['perf']['clip_x'] = array_key_exists( 'clip_x', $p ) ? ( empty( $p['clip_x'] ) ? 0 : 1 ) : (int) $d['perf']['clip_x'];

		$out['perf']['off_paths'] = self::sanitize_paths( $p['off_paths'] ?? '' );
		// Older exports don't have it: keep the default.
		$out['perf']['native_scroll'] = array_key_exists( 'native_scroll', $p ) ? ( empty( $p['native_scroll'] ) ? 0 : 1 ) : (int) $d['perf']['native_scroll'];

		// Effects.
		// Features: an export from before a feature existed keeps it on.
		$feat            = is_array( $in['features'] ?? null ) ? $in['features'] : array();
		$out['features'] = array();
		foreach ( self::FEATURES as $key ) {
			$out['features'][ $key ] = array_key_exists( $key, $feat ) ? ( empty( $feat[ $key ] ) ? 0 : 1 ) : 1;
		}
		$fx                                    = is_array( $in['effects'] ?? null ) ? $in['effects'] : array();
		$out['effects']['transition']          = self::pick( $fx['transition'] ?? '', array( 'off', 'fade', 'slide', 'zoom' ), 'off' );
		$out['effects']['transition_duration'] = self::num( $fx['transition_duration'] ?? null, 0.1, 1.5, $d['effects']['transition_duration'] );
		$out['effects']['cursor']              = self::pick( $fx['cursor'] ?? '', array( 'off', 'dot', 'ring', 'both' ), 'off' );
		$out['effects']['cursor_color']        = self::sanitize_color( $fx['cursor_color'] ?? '' );
		$out['effects']['cursor_hide']         = empty( $fx['cursor_hide'] ) ? 0 : 1;
		$out['effects']['intro']               = self::pick( $fx['intro'] ?? '', array( 'off', 'fade', 'curtain' ), 'off' );
		$out['effects']['intro_color']         = self::sanitize_color( $fx['intro_color'] ?? '' );
		$intro_text                            = is_scalar( $fx['intro_text'] ?? null ) ? trim( sanitize_text_field( (string) $fx['intro_text'] ) ) : '';
		$out['effects']['intro_text']          = function_exists( 'mb_substr' ) ? mb_substr( $intro_text, 0, 40 ) : substr( $intro_text, 0, 40 );
		$out['effects']['intro_every']         = empty( $fx['intro_every'] ) ? 0 : 1;
		$out['effects']['page_progress']       = empty( $fx['page_progress'] ) ? 0 : 1;

		$out['debug']     = empty( $in['debug'] ) ? 0 : 1;
		$out['admin_bar'] = empty( $in['admin_bar'] ) ? 0 : 1;

		$out['custom_presets'] = self::sanitize_custom_presets( $in['custom_presets'] ?? array() );

		self::flush();
		return $out;
	}

	/**
	 * A colour for the Effects settings: #rgb / #rrggbb, or empty (the theme's default).
	 *
	 * @param mixed $value Raw.
	 * @return string
	 */
	public static function sanitize_color( $value ) {
		$value = is_scalar( $value ) ? trim( (string) $value ) : '';
		$hex   = '' !== $value ? sanitize_hex_color( $value ) : '';
		return is_string( $hex ) ? $hex : '';
	}

	/**
	 * "Turn off on these pages": one URL path per line, e.g. /checkout/ or /shop/*. Full URLs
	 * are reduced to their path; anything else is dropped.
	 *
	 * @param mixed $value Raw textarea value.
	 * @return string
	 */
	public static function sanitize_paths( $value ) {
		$out = array();
		foreach ( preg_split( '/[\r\n,]+/', is_scalar( $value ) ? (string) $value : '' ) as $line ) {
			$line = trim( wp_strip_all_tags( $line ) );
			if ( '' === $line ) {
				continue;
			}
			if ( preg_match( '#^https?://#i', $line ) ) {
				$line = (string) wp_parse_url( $line, PHP_URL_PATH );
			}
			$wild                                = '*' === substr( $line, -1 );
			$path                                = '/' . trim( (string) preg_replace( '#[^A-Za-z0-9\-._~/%@]#', '', rtrim( $line, '*' ) ), '/' );
			$path                                = '/' === $path ? '/' : $path . '/';
			$out[ $path . ( $wild ? '*' : '' ) ] = true;
			if ( count( $out ) >= 100 ) {
				break;
			}
		}
		return implode( "\n", array_keys( $out ) );
	}

	/**
	 * Is this request's URL on the "Turn off on these pages" list?
	 *
	 * @return bool
	 */
	public static function path_is_off() {
		$list = (string) self::get( 'perf.off_paths', '' );
		if ( '' === $list || empty( $_SERVER['REQUEST_URI'] ) ) {
			return false;
		}
		$path = (string) wp_parse_url( esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ), PHP_URL_PATH ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		// Relative to the site address, so WordPress in a subfolder matches /checkout/ too.
		$home = untrailingslashit( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ) );
		if ( '' !== $home && 0 === strpos( $path, $home . '/' ) ) {
			$path = substr( $path, strlen( $home ) );
		}
		$path = '/' . trim( rawurldecode( $path ), '/' );
		$path = '/' === $path ? '/' : $path . '/';
		foreach ( explode( "\n", $list ) as $rule ) {
			$rule = rawurldecode( $rule );
			if ( '*' === substr( $rule, -1 ) ? 0 === strpos( $path, substr( $rule, 0, -1 ) ) : $rule === $path ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param mixed $rules Raw rules.
	 * @return array
	 */
	public static function sanitize_rules( $rules ) {
		$out = array();
		if ( ! is_array( $rules ) ) {
			return $out;
		}
		foreach ( $rules as $rule ) {
			if ( ! is_array( $rule ) ) {
				continue;
			}
			$type   = self::pick( $rule['type'] ?? '', array( 'element', 'class' ), 'element' );
			$raw    = is_scalar( $rule['target'] ?? '' ) ? (string) ( $rule['target'] ?? '' ) : '';
			$target = 'class' === $type
				? self::sanitize_class_name( $raw )
				: ( '*' === trim( $raw ) ? '*' : sanitize_key( wp_strip_all_tags( $raw ) ) );
			$preset = is_scalar( $rule['preset'] ?? '' ) ? (string) ( $rule['preset'] ?? '' ) : '';

			// An unknown preset (broken presets.json, a deactivated add-on that registered it) keeps
			// its rule: it simply doesn't animate until the preset exists again.
			if ( '' === $target || ( ! Presets::exists( $preset ) && ! preg_match( '/^[a-z0-9-]{1,40}$/', $preset ) ) ) {
				continue;
			}

			$out[] = array(
				'enabled' => empty( $rule['enabled'] ) ? 0 : 1,
				'type'    => $type,
				'target'  => $target,
				'preset'  => $preset,
				'scope'   => self::sanitize_scope( $rule['scope'] ?? 'self' ),
				'engine'  => self::pick( $rule['engine'] ?? '', array_merge( array( 'native' ), Presets::TWEEN_ENGINES ), '' ),
				'where'   => self::sanitize_where( $rule['where'] ?? '' ),
				'screens' => self::pick( $rule['screens'] ?? '', array_keys( self::SCREENS ), '' ),
			);
		}
		return $out;
	}

	/**
	 * Rule "Screens" choices → the screen sizes the rule does NOT animate on (phone < 768px,
	 * tablet 768–991px, desktop 992px and up, as in the builder's "Turn off on").
	 */
	const SCREENS = array(
		''        => array(),
		'desktop' => array( 'phone', 'tablet' ),
		'large'   => array( 'phone' ),
		'small'   => array( 'desktop' ),
		'phone'   => array( 'tablet', 'desktop' ),
	);

	/** Rule "Where" choices that aren't a post type. */
	const WHERE = array( 'front', 'blog', 'singular', 'archive', 'search', '404' );

	/**
	 * Where a rule applies: '' (everywhere), a page kind from WHERE, or "pt:<post type>" (single
	 * posts of that type). "not:" in front of any of them inverts it.
	 *
	 * @param mixed $where Raw.
	 * @return string
	 */
	public static function sanitize_where( $where ) {
		$where = is_scalar( $where ) ? strtolower( trim( (string) $where ) ) : '';
		$not   = 0 === strpos( $where, 'not:' );
		$base  = $not ? substr( $where, 4 ) : $where;
		if ( in_array( $base, self::WHERE, true ) ) {
			return $where;
		}
		if ( 0 === strpos( $base, 'pt:' ) ) {
			$type = sanitize_key( substr( $base, 3 ) );
			return '' !== $type ? ( $not ? 'not:' : '' ) . 'pt:' . $type : '';
		}
		return '';
	}

	/**
	 * Scope: "self", "children" or a CSS selector (relative to the element).
	 *
	 * @param mixed $scope Raw.
	 * @return string
	 */
	public static function sanitize_scope( $scope ) {
		$scope = trim( wp_strip_all_tags( is_scalar( $scope ) ? (string) $scope : '' ) );
		if ( '' === $scope || 'self' === $scope ) {
			return 'self';
		}
		if ( 'children' === $scope ) {
			return 'children';
		}
		return self::sanitize_selector_list( $scope );
	}

	/**
	 * Keep a CSS selector list safe for attribute/inline-JS output: no tags, braces or semicolons.
	 *
	 * @param mixed $value Raw.
	 * @return string
	 */
	public static function sanitize_selector_list( $value ) {
		$value = wp_strip_all_tags( is_scalar( $value ) ? (string) $value : '' );
		// '>' is kept (child combinator); '<', braces, semicolons and backslashes never survive.
		$value = preg_replace( '/[{}<;\\\\]/', '', $value );
		$value = preg_replace( '/\s+/', ' ', $value );
		return trim( substr( $value, 0, 1000 ) );
	}

	/**
	 * A class name as Bricks prints it: utility names such as md:hidden or w-1/2 keep every
	 * character (the rule compares names exactly; nothing is printed into CSS or a selector).
	 *
	 * @param string $name Class name, with or without the leading dot.
	 * @return string
	 */
	public static function sanitize_class_name( $name ) {
		$name = ltrim( trim( wp_strip_all_tags( $name ) ), '.' );
		return substr( (string) preg_replace( '/[^A-Za-z0-9_\-:\/@.\[\]%#!]/', '', $name ), 0, 100 );
	}

	/**
	 * The selectors of a comma-separated list that are complete on their own (commas inside
	 * :is(…) or [attr="a,b"] don't split); unbalanced ones are left out.
	 *
	 * @param string $list Selector list.
	 * @return string
	 */
	public static function balanced_parts( $list ) {
		$pieces = explode( ',', (string) preg_replace( '#/\*.*?\*/#s', '', (string) $list ) );
		$keep   = array();
		$i      = 0;
		$n      = count( $pieces );
		while ( $i < $n ) {
			// Join pieces until the selector is complete; if it never is, its first piece is the
			// broken one: drop just that piece and carry on after it.
			$cur = '';
			$end = -1;
			for ( $j = $i; $j < $n; $j++ ) {
				$cur = $j === $i ? $pieces[ $j ] : $cur . ',' . $pieces[ $j ];
				if ( self::balanced_selector( $cur ) ) {
					$end = $j;
					break;
				}
			}
			if ( $end < 0 ) {
				$i++;
				continue;
			}
			if ( '' !== trim( $cur ) ) {
				$keep[] = trim( $cur );
			}
			$i = $end + 1;
		}
		return implode( ', ', $keep );
	}

	/**
	 * Parentheses/brackets balanced and no comments, so a selector can't reshape the boot CSS rule.
	 *
	 * @param string $selector Selector list.
	 * @return bool
	 */
	public static function balanced_selector( $selector ) {
		if ( false !== strpos( $selector, '/*' ) || false !== strpos( $selector, '*/' ) ) {
			return false;
		}
		// Brackets inside quoted strings don't count (they could otherwise balance the check while
		// closing the :not(:is(...)) wrapper they are printed into).
		if ( substr_count( $selector, '"' ) % 2 || substr_count( $selector, "'" ) % 2 ) {
			return false;
		}
		$unquoted = preg_replace( '/"[^"]*"|\'[^\']*\'/', '""', $selector );
		$depth    = array( '(' => 0, '[' => 0 );
		$pairs    = array( ')' => '(', ']' => '[' );
		foreach ( str_split( (string) $unquoted ) as $ch ) {
			if ( isset( $depth[ $ch ] ) ) {
				$depth[ $ch ]++;
			} elseif ( isset( $pairs[ $ch ] ) ) {
				if ( --$depth[ $pairs[ $ch ] ] < 0 ) {
					return false;
				}
			}
		}
		return 0 === $depth['('] && 0 === $depth['['];
	}

	private static function pick( $value, array $allowed, $fallback ) {
		return in_array( $value, $allowed, true ) ? $value : $fallback;
	}

	private static function num( $value, $min, $max, $fallback ) {
		if ( ! is_numeric( $value ) ) {
			return $fallback;
		}
		$value = (float) $value;
		return max( $min, min( $max, $value ) );
	}
}
