<?php
/**
 * Updates from GitHub releases.
 *
 * WordPress asks "update_plugins_{host}" for plugins whose Update URI points outside
 * WordPress.org (WP 5.8+). The latest release must carry the built zip
 * (bricks-motion-studio-<version>.zip, made by `npm run zip`) as an asset: GitHub's
 * automatic source archives unpack into a differently named folder and are ignored.
 * Runs only in the dashboard and in WordPress's background update checks.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Updater {

	const REPO      = 'joelcreatives-cmd/Bricks-Motion-Studio';
	const SLUG      = 'bricks-motion-studio';
	const TRANSIENT = 'bme_github_release';

	public function __construct() {
		add_filter( 'update_plugins_github.com', array( $this, 'check' ), 10, 3 );
		add_filter( 'plugins_api', array( $this, 'details' ), 10, 3 );
		// A manual "Check again" on Dashboard → Updates also refreshes the cached release.
		add_action( 'load-update-core.php', array( $this, 'maybe_flush' ) );
	}

	/**
	 * @param array|false $update      Update data from an earlier filter, or false.
	 * @param array       $plugin_data Plugin headers.
	 * @param string      $plugin_file Plugin basename.
	 * @return array|false
	 */
	public function check( $update, $plugin_data, $plugin_file ) {
		if ( plugin_basename( BME_FILE ) !== $plugin_file ) {
			return $update;
		}
		$release = self::release();
		// "1.1" and "1.1.0" are the same version: never offer what is already installed.
		if ( ! $release || version_compare( self::normalize( $release['version'] ), self::normalize( BME_VERSION ), '<=' ) ) {
			return $update;
		}
		return array_filter(
			array(
				'id'           => 'https://github.com/' . self::REPO,
				'slug'         => self::SLUG,
				'plugin'       => $plugin_file,
				'version'      => $release['version'],
				'url'          => $release['url'],
				'package'      => $release['package'],
				'requires'     => $release['requires'],
				'requires_php' => $release['requires_php'],
				'tested'       => $release['tested'],
			)
		);
	}

	/** "1.2.0.0" → "1.2", so equal versions compare equal. */
	private static function normalize( $version ) {
		return preg_replace( '/(\.0+)+$/', '', (string) $version );
	}

	/** The "View details" popup on the Plugins screen. */
	public function details( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || ! isset( $args->slug ) || self::SLUG !== $args->slug ) {
			return $result;
		}
		$release = self::release();
		if ( ! $release ) {
			return $result;
		}
		return (object) array(
			'name'          => 'Bricks Motion Studio',
			'slug'          => self::SLUG,
			'version'       => $release['version'],
			'author'        => 'JoelCreatives',
			'homepage'      => 'https://github.com/' . self::REPO,
			'download_link' => $release['package'],
			'requires'      => $release['requires'],
			'requires_php'  => $release['requires_php'],
			'tested'        => $release['tested'],
			'last_updated'  => $release['date'],
			'sections'      => array(
				'changelog' => $release['notes'] ? wpautop( esc_html( $release['notes'] ) ) : '<p>' . esc_html__( 'See the release notes on GitHub.', 'bricks-motion-studio' ) . '</p>',
			),
		);
	}

	public function maybe_flush() {
		if ( isset( $_GET['force-check'] ) && current_user_can( 'update_plugins' ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only cache refresh.
			delete_site_transient( self::TRANSIENT );
		}
	}

	/**
	 * Latest usable release, cached (6 hours; 1 hour after a failed or empty lookup).
	 *
	 * @return array|null
	 */
	public static function release() {
		$cached = get_site_transient( self::TRANSIENT );
		if ( is_array( $cached ) ) {
			return empty( $cached['version'] ) ? null : $cached;
		}
		$release = self::fetch();
		set_site_transient( self::TRANSIENT, $release ? $release : array(), $release ? 6 * HOUR_IN_SECONDS : HOUR_IN_SECONDS );
		return $release;
	}

	/** @return array|null */
	private static function fetch() {
		$response = wp_remote_get(
			'https://api.github.com/repos/' . self::REPO . '/releases/latest',
			array(
				'timeout' => 5,
				'headers' => array(
					'Accept'     => 'application/vnd.github+json',
					'User-Agent' => 'Bricks-Motion-Studio/' . BME_VERSION,
				),
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}
		return self::parse( json_decode( wp_remote_retrieve_body( $response ), true ) );
	}

	/**
	 * Picks the built plugin zip out of a GitHub release payload.
	 *
	 * @param mixed $data Decoded /releases/latest response.
	 * @return array|null
	 */
	public static function parse( $data ) {
		if ( ! is_array( $data ) || ! empty( $data['draft'] ) || ! empty( $data['prerelease'] ) || empty( $data['tag_name'] ) ) {
			return null;
		}
		$version = ltrim( (string) $data['tag_name'], 'vV' );
		if ( ! preg_match( '/^\d+(\.\d+){1,3}$/', $version ) ) {
			return null;
		}
		$package = '';
		foreach ( (array) ( $data['assets'] ?? array() ) as $asset ) {
			$name = (string) ( $asset['name'] ?? '' );
			$url  = (string) ( $asset['browser_download_url'] ?? '' );
			if ( self::SLUG . '-' . $version . '.zip' === $name && 0 === strpos( $url, 'https://github.com/' . self::REPO . '/releases/download/' ) ) {
				$package = $url;
				break;
			}
		}
		if ( ! $package ) {
			return null;
		}
		// Requirements of the NEW version come from its release notes ("Requires PHP: 7.4" lines the
		// release workflow writes), never from the installed copy. Unknown → not sent.
		$notes = (string) ( $data['body'] ?? '' );
		$req   = array();
		foreach ( array( 'requires' => 'Requires at least', 'requires_php' => 'Requires PHP', 'tested' => 'Tested up to' ) as $key => $label ) {
			$req[ $key ] = preg_match( '/^\s*' . preg_quote( $label, '/' ) . ':\s*(\d+(?:\.\d+){0,2})\s*$/mi', $notes, $m ) ? $m[1] : '';
		}
		return array(
			'version'      => $version,
			'package'      => $package,
			'url'          => esc_url_raw( (string) ( $data['html_url'] ?? 'https://github.com/' . self::REPO . '/releases' ) ),
			'notes'        => (string) ( $data['body'] ?? '' ),
			'date'         => (string) ( $data['published_at'] ?? '' ),
			'requires'     => $req['requires'],
			'requires_php' => $req['requires_php'],
			'tested'       => $req['tested'],
		);
	}
}
