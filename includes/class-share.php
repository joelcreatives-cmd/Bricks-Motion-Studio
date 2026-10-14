<?php
/**
 * Share codes: My presets and the auto-animate rules as one short code to paste into another site
 * (System → Share presets and rules), without exporting every setting.
 *
 * A code is "BMS1." followed by base64url JSON { p: My presets, r: rules }. Importing runs both
 * through the same sanitizing as a save. "Add" keeps what the site has: presets with a slug it
 * already has are skipped, rules it already has are not added twice. "Replace" swaps both lists.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Share {

	const PREFIX = 'BMS1.';

	/** Codes longer than this are refused (a full rule list is a few kilobytes). */
	const MAX = 200000;

	public static function init() {
		add_action( 'admin_post_bme_share_import', array( __CLASS__, 'handle_import' ) );
	}

	/**
	 * This site's code.
	 *
	 * @return string
	 */
	public static function code() {
		$data = array(
			'p' => array_values( (array) Settings::get( 'custom_presets', array() ) ),
			'r' => array_values( (array) Settings::get( 'auto.rules', array() ) ),
		);
		return self::PREFIX . rtrim( strtr( base64_encode( (string) wp_json_encode( $data ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- encodes the share code (JSON of presets and rules), nothing executable.
	}

	/**
	 * A pasted code as sanitized lists, or null when it isn't one.
	 *
	 * @param mixed $code Pasted text.
	 * @return array|null { presets: array, rules: array }
	 */
	public static function decode( $code ) {
		$code = is_scalar( $code ) ? preg_replace( '/\s+/', '', (string) $code ) : '';
		if ( strlen( $code ) > self::MAX || 0 !== strpos( $code, self::PREFIX ) ) {
			return null;
		}
		$b64  = strtr( substr( $code, strlen( self::PREFIX ) ), '-_', '+/' );
		$json = base64_decode( $b64 . str_repeat( '=', ( 4 - strlen( $b64 ) % 4 ) % 4 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- a share code, decoded and sanitized.
		$data = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $data ) || ! isset( $data['p'], $data['r'] ) || ! is_array( $data['p'] ) || ! is_array( $data['r'] ) ) {
			return null;
		}
		return array(
			'presets' => Settings::sanitize_custom_presets( $data['p'] ),
			'rules'   => Settings::sanitize_rules( $data['r'] ),
		);
	}

	/**
	 * Merge a decoded code into the current lists.
	 *
	 * @param array  $current { custom_presets, rules }.
	 * @param array  $incoming decode() result.
	 * @param string $mode     add | replace.
	 * @return array { custom_presets, rules, added_presets, added_rules }
	 */
	public static function merge( array $current, array $incoming, $mode ) {
		if ( 'replace' === $mode ) {
			return array(
				'custom_presets' => $incoming['presets'],
				'rules'          => $incoming['rules'],
				'added_presets'  => count( $incoming['presets'] ),
				'added_rules'    => count( $incoming['rules'] ),
			);
		}
		$presets = array_values( (array) $current['custom_presets'] );
		$slugs   = array_column( $presets, 'slug' );
		$ap      = 0;
		foreach ( $incoming['presets'] as $p ) {
			if ( ! in_array( $p['slug'], $slugs, true ) && count( $presets ) < 50 ) {
				$presets[] = $p;
				$slugs[]   = $p['slug'];
				++$ap;
			}
		}
		$rules = array_values( (array) $current['rules'] );
		$keys  = array_map( array( __CLASS__, 'rule_key' ), $rules );
		$ar    = 0;
		foreach ( $incoming['rules'] as $r ) {
			$k = self::rule_key( $r );
			if ( ! in_array( $k, $keys, true ) ) {
				$rules[] = $r;
				$keys[]  = $k;
				++$ar;
			}
		}
		return array(
			'custom_presets' => $presets,
			'rules'          => $rules,
			'added_presets'  => $ap,
			'added_rules'    => $ar,
		);
	}

	/**
	 * What makes two rules the same rule (on / off does not).
	 *
	 * @param array $r Rule.
	 * @return string
	 */
	private static function rule_key( $r ) {
		$r = is_array( $r ) ? $r : array();
		return implode( '|', array( $r['type'] ?? '', $r['target'] ?? '', $r['preset'] ?? '', $r['scope'] ?? '', $r['engine'] ?? '', $r['where'] ?? '', $r['screens'] ?? '' ) );
	}

	public static function handle_import() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'bricks-motion-studio' ) );
		}
		check_admin_referer( 'bme_share_import' );
		$raw      = isset( $_POST['bme_share_code'] ) ? wp_unslash( $_POST['bme_share_code'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- decoded and sanitized in decode().
		$mode     = isset( $_POST['bme_share_mode'] ) && 'replace' === $_POST['bme_share_mode'] ? 'replace' : 'add';
		$incoming = self::decode( $raw );
		if ( ! $incoming ) {
			wp_safe_redirect( add_query_arg( 'bme_notice', 'share_failed', Admin::page_url() ) . '#system' );
			exit;
		}
		$s                   = Settings::all();
		$merged              = self::merge(
			array(
				'custom_presets' => $s['custom_presets'],
				'rules'          => $s['auto']['rules'],
			),
			$incoming,
			$mode
		);
		$s['custom_presets'] = $merged['custom_presets'];
		$s['auto']['rules']  = $merged['rules'];
		update_option( BME_OPTION, $s ); // sanitized by the registered callback; kept in Recent changes
		Settings::flush();
		Presets::flush();
		wp_safe_redirect(
			add_query_arg(
				array(
					'bme_notice' => 'shared',
					'bme_np'     => $merged['added_presets'],
					'bme_nr'     => $merged['added_rules'],
				),
				Admin::page_url()
			) . '#system'
		);
		exit;
	}
}
