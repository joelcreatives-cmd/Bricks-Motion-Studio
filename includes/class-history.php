<?php
/**
 * Settings history: the last versions of the settings, so a change can be rolled back.
 *
 * Every time the settings option changes (Save, Import, Reset, a restore, WP-CLI), the version
 * it replaced is kept with when, who and how. Restoring one is itself a change, so it can be
 * undone the same way.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class History {

	const OPTION = 'bme_history';

	/** Versions kept. */
	const MAX = 10;

	public static function init() {
		add_action( 'update_option_' . BME_OPTION, array( __CLASS__, 'remember' ), 10, 2 );
		add_action( 'admin_post_bme_restore', array( __CLASS__, 'handle_restore' ) );
	}

	/**
	 * How this change was made, from the request that made it.
	 *
	 * @return string save|import|reset|restore|cli|other
	 */
	private static function source() {
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			return 'cli';
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- read-only label; the handlers verify their own nonces.
		$action = isset( $_POST['action'] ) && is_string( $_POST['action'] ) ? sanitize_key( wp_unslash( $_POST['action'] ) ) : '';
		$map    = array(
			'bme_import'  => 'import',
			'bme_reset'   => 'reset',
			'bme_restore' => 'restore',
			'update'      => 'save', // options.php
		);
		return $map[ $action ] ?? 'other';
	}

	/**
	 * update_option_bme_settings: keep the version that was just replaced.
	 *
	 * @param mixed $old Previous value.
	 * @param mixed $new New value.
	 */
	public static function remember( $old, $new ) {
		if ( ! is_array( $old ) || $old === $new ) {
			return;
		}
		$user  = wp_get_current_user();
		$entry = array(
			'time'     => time(),
			'user'     => $user && $user->exists() ? $user->display_name : '',
			'source'   => self::source(),
			'settings' => self::complete( $old ),
		);
		$list  = self::all();
		array_unshift( $list, $entry );
		update_option( self::OPTION, array_slice( $list, 0, self::MAX ), false );
	}

	/**
	 * A complete version: a setting missing from it (saved before that setting existed) had its
	 * default then. Restoring must set it to that default, not keep today's value.
	 *
	 * @param array $v Settings version.
	 * @return array
	 */
	public static function complete( array $v ) {
		$d = Settings::defaults();
		// Lists replace the default list whole (merging by position would mix the two).
		if ( isset( $v['auto']['rules'] ) && is_array( $v['auto']['rules'] ) ) {
			$d['auto']['rules'] = array();
		}
		if ( isset( $v['custom_presets'] ) && is_array( $v['custom_presets'] ) ) {
			$d['custom_presets'] = array();
		}
		return array_replace_recursive( $d, $v );
	}

	/** @return array[] Newest first. */
	public static function all() {
		$list = get_option( self::OPTION, array() );
		return is_array( $list ) ? array_values(
			array_filter(
				$list,
				static function ( $e ) {
					return is_array( $e ) && isset( $e['settings'] ) && is_array( $e['settings'] );
				}
			)
		) : array();
	}

	/**
	 * Setting paths that differ between two versions ("defaults.duration", "auto.rules").
	 *
	 * @param array  $a      Version.
	 * @param array  $b      Version.
	 * @param string $prefix Path so far.
	 * @return string[]
	 */
	public static function diff( array $a, array $b, $prefix = '' ) {
		$out = array();
		foreach ( array_unique( array_merge( array_keys( $a ), array_keys( $b ) ) ) as $key ) {
			$path = '' === $prefix ? (string) $key : $prefix . '.' . $key;
			$va   = $a[ $key ] ?? null;
			$vb   = $b[ $key ] ?? null;
			// Lists (rules, My presets) count as one change.
			if ( is_array( $va ) && is_array( $vb ) && ! self::is_list( $va ) && ! self::is_list( $vb ) ) {
				$out = array_merge( $out, self::diff( $va, $vb, $path ) );
			} elseif ( $va != $vb ) { // phpcs:ignore Universal.Operators.StrictComparisons.LooseNotEqual -- "1" and 1 are the same setting.
				$out[] = $path;
			}
		}
		return $out;
	}

	/**
	 * @param array $a Array.
	 * @return bool Keys are 0, 1, 2… (a list such as the rules).
	 */
	private static function is_list( array $a ) {
		return array_keys( $a ) === range( 0, count( $a ) - 1 ) || array() === $a;
	}

	/**
	 * Readable names for changed setting paths, grouped by dashboard section.
	 *
	 * @param string[] $paths Paths from diff().
	 * @return string[]
	 */
	public static function describe( array $paths ) {
		$sections = array(
			'status'         => __( 'Site status', 'bricks-motion-studio' ),
			'admin_bar'      => __( 'Admin bar menu', 'bricks-motion-studio' ),
			'libraries'      => __( 'Libraries', 'bricks-motion-studio' ),
			'default_engine' => __( 'Default engine', 'bricks-motion-studio' ),
			'source'         => __( 'Library source', 'bricks-motion-studio' ),
			'level'          => __( 'Animation level', 'bricks-motion-studio' ),
			'auto.rules'     => __( 'Rules', 'bricks-motion-studio' ),
			'auto'           => __( 'Auto-animate', 'bricks-motion-studio' ),
			'defaults'       => __( 'Timing & feel', 'bricks-motion-studio' ),
			'lenis'          => __( 'Smooth scrolling', 'bricks-motion-studio' ),
			'three'          => __( '3D', 'bricks-motion-studio' ),
			'a11y'           => __( 'Accessibility', 'bricks-motion-studio' ),
			'perf.off_paths' => __( 'Pages turned off', 'bricks-motion-studio' ),
			'perf'           => __( 'Performance', 'bricks-motion-studio' ),
			'debug'          => __( 'Debug mode', 'bricks-motion-studio' ),
			'custom_presets' => __( 'My presets', 'bricks-motion-studio' ),
		);
		$out      = array();
		foreach ( $paths as $path ) {
			$label = '';
			foreach ( $sections as $key => $text ) {
				if ( $path === $key || 0 === strpos( $path, $key . '.' ) ) {
					$label = $text;
					break;
				}
			}
			$out[] = '' !== $label ? $label : $path;
		}
		return array_values( array_unique( $out ) );
	}

	/** Labels for how a version was replaced. */
	public static function source_labels() {
		return array(
			'save'    => __( 'Saved', 'bricks-motion-studio' ),
			'import'  => __( 'Imported', 'bricks-motion-studio' ),
			'reset'   => __( 'Reset to defaults', 'bricks-motion-studio' ),
			'restore' => __( 'Restored an earlier version', 'bricks-motion-studio' ),
			'cli'     => __( 'Changed with WP-CLI', 'bricks-motion-studio' ),
			'other'   => __( 'Changed', 'bricks-motion-studio' ),
		);
	}

	public static function handle_restore() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'bricks-motion-studio' ) );
		}
		check_admin_referer( 'bme_restore' );
		$index = isset( $_POST['version'] ) ? absint( $_POST['version'] ) : -1;
		$time  = isset( $_POST['time'] ) ? absint( $_POST['time'] ) : 0;
		$list  = self::all();
		// The time must match too: the list shifts when someone saves in another tab meanwhile.
		if ( ! isset( $list[ $index ] ) || (int) $list[ $index ]['time'] !== $time ) {
			wp_safe_redirect( add_query_arg( 'bme_notice', 'restore_failed', Admin::page_url() ) . '#system' );
			exit;
		}
		update_option( BME_OPTION, self::complete( $list[ $index ]['settings'] ) ); // sanitized by the registered callback
		Settings::flush();
		wp_safe_redirect( add_query_arg( 'bme_notice', 'restored', Admin::page_url() ) . '#system' );
		exit;
	}
}
