<?php
/**
 * Plugin bootstrap.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Plugin {

	/** @var Plugin|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/** @var Bricks_Integration The element controls and attribute builder (the builder preview calls it). */
	public $bricks;

	/** Settings schema version; bump when a release needs to migrate saved options. */
	const SCHEMA = 3;

	private function __construct() {
		add_action( 'init', array( $this, 'load_textdomain' ) );
		add_action( 'init', array( __CLASS__, 'maybe_upgrade' ), 5 );

		$this->bricks = new Bricks_Integration();
		History::init();

		// Lottie files are JSON: let administrators upload .json to the Media Library.
		add_filter( 'upload_mimes', array( __CLASS__, 'json_mime' ) );
		add_filter( 'wp_check_filetype_and_ext', array( __CLASS__, 'json_filetype' ), 10, 3 );
		// Without Bricks nothing on the front end can be animated: load nothing there.
		// (Checked once the theme is set up; the settings screen still loads.)
		add_action(
			'after_setup_theme',
			static function () {
				if ( self::bricks_active() ) {
					new Assets();
					new Builder();
					new Effects();
					Usage_Log::init();
				}
			},
			20
		);

		// Frontend admin bar menu (status, view without animations, settings).
		add_action( 'admin_bar_menu', array( Admin::class, 'admin_bar' ), 90 );
		if ( is_admin() ) {
			new Admin();
			Usage_Log::init_admin();
			Share::init();
		}
		// Update checks run in the dashboard, in background cron and in WP-CLI, never on the front end.
		if ( is_admin() || wp_doing_cron() || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			new Updater();
		}

		add_filter( 'plugin_action_links_' . plugin_basename( BME_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * upload_mimes: .json for administrators (Lottie animations).
	 *
	 * @param array $mimes Allowed types.
	 * @return array
	 */
	public static function json_mime( $mimes ) {
		if ( is_array( $mimes ) && current_user_can( 'manage_options' ) ) {
			$mimes['json'] = 'application/json';
		}
		return $mimes;
	}

	/**
	 * wp_check_filetype_and_ext: the server may detect a .json upload as text/plain; accept it as
	 * JSON when the user may upload JSON and the file really parses as JSON.
	 *
	 * @param array  $data     Checked type data.
	 * @param string $file     Temporary file path.
	 * @param string $filename Original name.
	 * @return array
	 */
	public static function json_filetype( $data, $file, $filename ) {
		if ( ! is_array( $data ) || ! empty( $data['ext'] ) || ! current_user_can( 'manage_options' ) ) {
			return $data;
		}
		if ( 'json' !== strtolower( pathinfo( (string) $filename, PATHINFO_EXTENSION ) ) || ! is_readable( $file ) || filesize( $file ) > 20 * 1024 * 1024 ) {
			return $data;
		}
		$json = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local temp upload.
		if ( is_array( $json ) ) {
			$data['ext']  = 'json';
			$data['type'] = 'application/json';
		}
		return $data;
	}

	public function load_textdomain() {
		load_plugin_textdomain( 'bricks-motion-studio', false, dirname( plugin_basename( BME_FILE ) ) . '/languages' );
	}

	public function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( Admin::page_url() ) . '">' . esc_html__( 'Settings', 'bricks-motion-studio' ) . '</a>' );
		return $links;
	}

	public static function activate() {
		if ( false === get_option( BME_OPTION ) ) {
			add_option( BME_OPTION, Settings::defaults() );
			self::set_schema();
		}
		self::maybe_upgrade();
	}

	/**
	 * Idempotent, versioned migrations of saved settings (runs once per schema bump).
	 */
	public static function maybe_upgrade() {
		// Read from the autoloaded options cache: no extra query on normal requests.
		$all  = wp_load_alloptions();
		$from = isset( $all['bme_schema'] ) ? (int) $all['bme_schema'] : (int) get_option( 'bme_schema', 1 );
		if ( $from >= self::SCHEMA ) {
			return;
		}
		$saved = get_option( BME_OPTION, array() );
		if ( is_array( $saved ) && isset( $saved['auto']['rules'] ) && is_array( $saved['auto']['rules'] ) ) {
			// Schema 2: add the new default rules (post titles, pie charts, catch-all) if missing.
			if ( $from < 2 ) {
				$targets = array_map(
					static function ( $r ) {
						return is_array( $r ) ? ( $r['type'] ?? 'element' ) . ':' . ( $r['target'] ?? '' ) : '';
					},
					$saved['auto']['rules']
				);
				foreach ( Settings::default_rules() as $rule ) {
					if ( in_array( $rule['target'], array( 'post-title', 'pie-chart', '*' ), true ) && ! in_array( 'element:' . $rule['target'], $targets, true ) ) {
						$saved['auto']['rules'][] = $rule;
					}
				}
			}
		}
		// Schema 3: never auto-animate inside Swiper sliders (testimonials) or the fixed back-to-top button.
		if ( $from < 3 && is_array( $saved ) && isset( $saved['auto']['exclude'] ) && is_string( $saved['auto']['exclude'] ) ) {
			$have = array_map( 'trim', explode( ',', $saved['auto']['exclude'] ) );
			foreach ( array( '.swiper', '.brxe-back-to-top' ) as $sel ) {
				if ( ! in_array( $sel, $have, true ) ) {
					$saved['auto']['exclude'] = trim( $saved['auto']['exclude'] ) ? rtrim( trim( $saved['auto']['exclude'] ), ',' ) . ', ' . $sel : $sel;
				}
			}
		}
		if ( is_array( $saved ) && $saved ) {
			update_option( BME_OPTION, $saved );
			Settings::flush();
		}
		self::set_schema();
	}

	/** Store the schema version autoloaded (earlier versions stored it with autoload off). */
	private static function set_schema() {
		delete_option( 'bme_schema' );
		add_option( 'bme_schema', self::SCHEMA, '', true );
	}

	/**
	 * Bricks is the active (parent) theme.
	 *
	 * @return bool
	 */
	/**
	 * JSON for the page (attributes, inline config, exports) with numbers as typed: hosts with an
	 * old php.ini (serialize_precision = 17) would print 1.4 as 1.3999999999999999.
	 *
	 * @param mixed $data  Value.
	 * @param int   $flags json_encode flags.
	 * @return string|false
	 */
	public static function json( $data, $flags = 0 ) {
		$prev = ini_get( 'serialize_precision' );
		if ( '-1' !== $prev ) {
			ini_set( 'serialize_precision', '-1' ); // phpcs:ignore WordPress.PHP.IniSet.Risky -- restored right below.
		}
		$out = wp_json_encode( $data, $flags );
		if ( '-1' !== $prev && false !== $prev ) {
			ini_set( 'serialize_precision', $prev ); // phpcs:ignore WordPress.PHP.IniSet.Risky -- restoring the host's value.
		}
		return $out;
	}

	public static function bricks_active() {
		return 'bricks' === get_template() || defined( 'BRICKS_VERSION' );
	}
}
