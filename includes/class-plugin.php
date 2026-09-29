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

	/** Settings schema version; bump when a release needs to migrate saved options. */
	const SCHEMA = 3;

	private function __construct() {
		add_action( 'init', array( $this, 'load_textdomain' ) );
		add_action( 'init', array( __CLASS__, 'maybe_upgrade' ), 5 );

		new Bricks_Integration();
		new Assets();

		if ( is_admin() ) {
			new Admin();
		}
		// Update checks run in the dashboard, in background cron and in WP-CLI, never on the front end.
		if ( is_admin() || wp_doing_cron() || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			new Updater();
		}

		add_filter( 'plugin_action_links_' . plugin_basename( BME_FILE ), array( $this, 'action_links' ) );
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
	public static function bricks_active() {
		return 'bricks' === get_template() || defined( 'BRICKS_VERSION' );
	}
}
