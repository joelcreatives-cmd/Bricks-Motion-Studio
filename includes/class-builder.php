<?php
/**
 * Live preview and the timeline helper inside the Bricks builder.
 *
 * - Canvas (iframe): loads the runtime, timeline.js and every enabled engine, plus
 *   builder-canvas.js, which plays an element's animation on request.
 * - Panel (main window): builder-panel.js plays the selected element's animation whenever its
 *   Motion Studio settings change (or on "Preview animation"), and adds the visual keyframe
 *   track under each timeline row.
 * - The attributes come from the server (AJAX), computed by exactly the code that renders the
 *   live page, so the preview always matches the frontend (auto rules, levels, presets…).
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Builder {

	const NONCE = 'bme_preview';

	public function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_panel' ), 20 );
		add_action( 'wp_ajax_bme_preview', array( $this, 'ajax_preview' ) );
	}

	/** The builder canvas iframe (where elements are drawn). */
	public static function canvas() {
		return function_exists( 'bricks_is_builder_iframe' ) && bricks_is_builder_iframe();
	}

	/** Panel window: preview trigger + timeline helper. */
	public function enqueue_panel() {
		if ( ! function_exists( 'bricks_is_builder_main' ) || ! bricks_is_builder_main() ) {
			return;
		}
		wp_enqueue_script( 'bme-builder-panel', BME_URL . 'assets/js/builder-panel.js', array(), Assets::asset_version(), true );
		wp_add_inline_script(
			'bme-builder-panel',
			'window.BME_BUILDER=' . wp_json_encode(
				array(
					'ajax'   => admin_url( 'admin-ajax.php' ),
					'nonce'  => wp_create_nonce( self::NONCE ),
					'postId' => (int) get_the_ID(),
					'i18n'   => array(
						/* translators: %s: the part of the keyframes text that is wrong */
						'fits'      => __( 'This row is skipped. Values must suit the property: lengths for position and size, deg or turn for rotate, numbers or percent for scale and opacity, colors for colors. Check: "%s"', 'bricks-motion-studio' ),
						/* translators: %s: the part of the keyframes text that is wrong */
						'pair'      => __( 'This row is skipped. Write keyframes as percent: value, separated by commas, e.g. 0: 40px, 100: 0px. Check: "%s"', 'bricks-motion-studio' ),
						'empty'     => __( 'This row is skipped. Add at least one keyframe, e.g. 0: 0, 100: 1', 'bricks-motion-studio' ),
						'ok'        => __( 'Keyframes OK', 'bricks-motion-studio' ),
						'dragHint'  => __( 'Drag a dot to move a keyframe; click the track to add one.', 'bricks-motion-studio' ),
						/* translators: 1: keyframe position with its unit, e.g. 25%, 2: its value, e.g. 40px */
						'keyframe'  => __( 'Keyframe at %1$s: %2$s', 'bricks-motion-studio' ),
						'noPreview' => __( 'Nothing to preview: this element has no animation.', 'bricks-motion-studio' ),
					),
				)
			) . ';',
			'before'
		);
	}

	/**
	 * The root attributes the live page would give this element (data-bme…, data-bme-tl…).
	 * POST: nonce, postId, element (JSON: id, name, settings).
	 */
	public function ajax_preview() {
		check_ajax_referer( self::NONCE, 'nonce' );
		$post_id = isset( $_POST['postId'] ) ? absint( $_POST['postId'] ) : 0;
		$allowed = $post_id ? current_user_can( 'edit_post', $post_id ) : current_user_can( 'edit_posts' );
		if ( ! $allowed && class_exists( '\Bricks\Capabilities' ) && method_exists( '\Bricks\Capabilities', 'current_user_can_use_builder' ) ) {
			$allowed = \Bricks\Capabilities::current_user_can_use_builder( $post_id );
		}
		if ( ! $allowed ) {
			wp_send_json_error( 'forbidden', 403 );
		}
		$raw     = isset( $_POST['element'] ) ? wp_unslash( $_POST['element'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON, validated below.
		$element = json_decode( is_string( $raw ) ? $raw : '', true );
		if ( ! is_array( $element ) || empty( $element['name'] ) || ! is_string( $element['name'] ) ) {
			wp_send_json_error( 'bad element', 400 );
		}
		$name     = sanitize_key( $element['name'] );
		$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();

		// Page settings (Animations off / custom only, level) of the page being edited.
		if ( $post_id && class_exists( '\Bricks\Database' ) && defined( 'BRICKS_DB_PAGE_SETTINGS' ) ) {
			$page = get_post_meta( $post_id, BRICKS_DB_PAGE_SETTINGS, true );
			if ( is_array( $page ) ) {
				\Bricks\Database::$page_settings = $page;
			}
		}

		// A stand-in for the Bricks element: the attribute builder only reads name + settings.
		$instance           = new \stdClass();
		$instance->name     = $name;
		$instance->settings = $settings;
		$instance->id       = isset( $element['id'] ) && is_string( $element['id'] ) ? sanitize_key( $element['id'] ) : '';

		// Only our own attribute builder runs: other plugins' callbacks on the shared Bricks filter may
		// expect a real \Bricks\Element and must not run (or fatal) for a preview.
		$attributes = array( 'class' => array( 'brxe-' . $name ) );
		// Bricks' own interaction attributes first (they decide conflicts, as on the live page).
		$theme = class_exists( '\Bricks\Theme' ) && method_exists( '\Bricks\Theme', 'instance' ) ? \Bricks\Theme::instance() : null;
		if ( $theme && isset( $theme->interactions ) && is_object( $theme->interactions ) && method_exists( $theme->interactions, 'add_data_attributes' ) ) {
			try {
				$attributes = (array) $theme->interactions->add_data_attributes( $attributes, $instance );
			} catch ( \Throwable $e ) {
				unset( $e ); // a Bricks change must not break the preview
			}
		}
		Bricks_Integration::$previewing = true;
		try {
			$out = Plugin::instance()->bricks->root_attributes( $attributes, $instance );
		} finally {
			Bricks_Integration::$previewing = false;
		}

		$keep = array();
		foreach ( (array) $out as $key => $value ) {
			if ( is_string( $key ) && 0 === strpos( $key, 'data-bme' ) && is_scalar( $value ) ) {
				$keep[ $key ] = (string) $value;
			}
		}
		wp_send_json_success( $keep );
	}
}
