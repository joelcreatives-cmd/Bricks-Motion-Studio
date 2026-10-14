<?php
/**
 * Usage report: what each rendered page actually loaded.
 *
 * At the end of every frontend page that printed Motion Studio scripts, the page's engines,
 * presets and script weight are written to one small option (only when something changed or the
 * entry is older than six hours, so a busy site barely writes). The dashboard's Usage panel reads
 * it, and its "Scan site" button visits the site's pages so the report covers more than the pages
 * people happened to open.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Usage_Log {

	const OPTION = 'bme_usage_log';

	/** Pages kept (most recently seen first). */
	const MAX = 300;

	/** Seconds before an unchanged page is written again (its "last seen" time). */
	const REFRESH = 21600;

	/** Frontend: record pages (only where Bricks renders them). */
	public static function init() {
		add_action( 'wp_footer', array( __CLASS__, 'record' ), 1000 );
	}

	/** Dashboard: the report (works without Bricks too, showing what was recorded). */
	public static function init_admin() {
		add_action( 'wp_ajax_bme_usage', array( __CLASS__, 'ajax_report' ) );
		add_action( 'wp_ajax_bme_usage_clear', array( __CLASS__, 'ajax_clear' ) );
	}

	/**
	 * Script handles this page printed that belong to Motion Studio, with their size in bytes.
	 *
	 * @return array<string,int>
	 */
	private static function printed_scripts() {
		$scripts = wp_scripts();
		$out     = array();
		foreach ( (array) $scripts->done as $handle ) {
			if ( ! is_string( $handle ) || 0 !== strpos( $handle, 'bme-' ) || 'bme-inspector' === $handle ) {
				continue;
			}
			$src            = isset( $scripts->registered[ $handle ] ) ? (string) $scripts->registered[ $handle ]->src : '';
			$out[ $handle ] = self::size_of( $src );
		}
		return $out;
	}

	/**
	 * Size of a script on disk: the plugin's own file, or (CDN mode) the same file in the bundled
	 * vendor folder. 0 when unknown.
	 *
	 * @param string $src Script URL.
	 * @return int
	 */
	private static function size_of( $src ) {
		if ( '' === $src ) {
			return 0;
		}
		$path = strtok( $src, '?' );
		if ( 0 === strpos( $path, BME_URL ) ) {
			$file = BME_PATH . substr( $path, strlen( BME_URL ) );
			return is_readable( $file ) ? (int) filesize( $file ) : 0;
		}
		$name  = basename( $path );
		$found = glob( BME_PATH . 'assets/vendor/*/' . $name );
		return $found && is_readable( $found[0] ) ? (int) filesize( $found[0] ) : 0;
	}

	/**
	 * The current request's URL without its query string (the report's key).
	 *
	 * @return string
	 */
	private static function current_url() {
		$path = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '/'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- only the path is kept, escaped on output.
		$path = (string) strtok( $path, '?' );
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		$home = '' === $home ? '/' : $home;
		if ( 0 === strpos( $path, $home ) ) {
			$path = substr( $path, strlen( $home ) ); // a site in a subfolder: relative to it
		}
		return esc_url_raw( home_url( '/' . ltrim( $path, '/' ) ) );
	}

	/** wp_footer: remember what this page loaded. */
	public static function record() {
		if ( is_admin() || is_feed() || is_preview() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || Bricks_Integration::in_builder() || is_customize_preview() ) {
			return;
		}
		if ( isset( $_GET['bme-debug'] ) || isset( $_GET['bme-disable'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return;
		}
		$scripts = self::printed_scripts();
		if ( ! $scripts ) {
			return; // nothing of ours on this page
		}

		$presets = Usage::presets();
		arsort( $presets );
		$entry = array(
			'url'      => self::current_url(),
			'title'    => wp_strip_all_tags( html_entity_decode( wp_get_document_title(), ENT_QUOTES, 'UTF-8' ) ),
			'engines'  => array_values(
				array_intersect(
					array( 'gsap', 'anime', 'motion' ),
					array_map(
						static function ( $h ) {
							return substr( $h, strlen( 'bme-adapter-' ) );
						},
						array_keys( $scripts )
					)
				)
			),
			'lenis'    => isset( $scripts['bme-smooth'] ),
			'timeline' => isset( $scripts['bme-timeline'] ),
			'presets'  => array_slice( $presets, 0, 30, true ),
			'count'    => (int) array_sum( $presets ),
			'bytes'    => (int) array_sum( $scripts ),
			'files'    => count( $scripts ),
			'time'     => time(),
		);

		$log  = self::all();
		$key  = md5( $entry['url'] );
		$prev = $log[ $key ] ?? null;
		if ( is_array( $prev ) ) {
			$same = $prev;
			unset( $same['time'] );
			$now = $entry;
			unset( $now['time'] );
			if ( $same === $now && time() - (int) ( $prev['time'] ?? 0 ) < self::REFRESH ) {
				return;
			}
			unset( $log[ $key ] );
		}
		$log = array( $key => $entry ) + $log; // newest first
		if ( count( $log ) > self::MAX ) {
			$log = array_slice( $log, 0, self::MAX, true );
		}
		update_option( self::OPTION, $log, false );
	}

	/** @return array<string,array> */
	public static function all() {
		$log = get_option( self::OPTION, array() );
		return is_array( $log ) ? array_filter( $log, 'is_array' ) : array();
	}

	/**
	 * Pages the "Scan site" button visits: front page, blog, published pages, recent posts and
	 * entries of other public post types, and the busiest category.
	 *
	 * @return string[]
	 */
	public static function scan_urls() {
		$urls = array( home_url( '/' ) );
		$blog = (int) get_option( 'page_for_posts' );
		if ( $blog ) {
			$urls[] = get_permalink( $blog );
		}
		$types = array_diff( get_post_types( array( 'public' => true ) ), array( 'attachment', 'bricks_template' ) );
		foreach ( $types as $type ) {
			$ids = get_posts(
				array(
					'post_type'        => $type,
					'post_status'      => 'publish',
					'posts_per_page'   => 'page' === $type ? 150 : 25,
					'fields'           => 'ids',
					'orderby'          => 'modified',
					'no_found_rows'    => true,
					'suppress_filters' => false,
				)
			);
			foreach ( $ids as $id ) {
				$urls[] = get_permalink( $id );
			}
		}
		$cats = get_categories(
			array(
				'orderby' => 'count',
				'order'   => 'DESC',
				'number'  => 1,
			)
		);
		if ( $cats ) {
			$urls[] = get_category_link( $cats[0] );
		}
		$urls = array_values( array_unique( array_filter( array_map( 'strval', $urls ) ) ) );
		return array_slice( $urls, 0, 250 );
	}

	/**
	 * The report the Usage panel draws.
	 *
	 * @return array
	 */
	public static function report() {
		$pages = array_values( self::all() );
		usort(
			$pages,
			static function ( $a, $b ) {
				return (int) ( $b['bytes'] ?? 0 ) <=> (int) ( $a['bytes'] ?? 0 );
			}
		);
		$presets = array();
		$engines = array(
			'gsap'   => 0,
			'anime'  => 0,
			'motion' => 0,
		);
		foreach ( $pages as $page ) {
			foreach ( (array) ( $page['presets'] ?? array() ) as $slug => $n ) {
				$presets[ $slug ] = ( $presets[ $slug ] ?? 0 ) + (int) $n;
			}
			foreach ( (array) ( $page['engines'] ?? array() ) as $engine ) {
				if ( isset( $engines[ $engine ] ) ) {
					++$engines[ $engine ];
				}
			}
		}
		arsort( $presets );
		$labels = array();
		foreach ( array_keys( $presets ) as $slug ) {
			$p               = Presets::get( $slug );
			$labels[ $slug ] = is_array( $p ) && ! empty( $p['label'] ) ? (string) $p['label'] : (string) $slug;
		}
		return array(
			'pages'    => $pages,
			'presets'  => $presets,
			'labels'   => $labels,
			'engines'  => $engines,
			'enabled'  => array(
				'gsap'   => Settings::library_enabled( 'gsap' ),
				'anime'  => Settings::library_enabled( 'anime' ),
				'motion' => Settings::library_enabled( 'motion' ),
				'lenis'  => Settings::library_enabled( 'lenis' ),
			),
			'always'   => (bool) Settings::get( 'perf.always' ),
			'external' => 'cdn' === Settings::get( 'source' ),
		);
	}

	public static function ajax_report() {
		check_ajax_referer( 'bme_usage', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'forbidden', 403 );
		}
		wp_send_json_success( self::report() );
	}

	public static function ajax_clear() {
		check_ajax_referer( 'bme_usage', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'forbidden', 403 );
		}
		delete_option( self::OPTION );
		wp_send_json_success( self::report() );
	}
}
