<?php
/**
 * Bricks element: "Lottie animation".
 *
 * Plays a Lottie (After Effects / Bodymovin JSON) animation with the light SVG player (no
 * expressions, no eval), loaded only on pages that have one. Triggers: on load, when scrolled
 * into view, on hover, on click (a real toggle button) or scrubbed by scroll position. Visitors
 * who prefer reduced motion, and pages where Motion Studio is off, get a still frame. The
 * "Pause animations" button pauses it like any other loop. assets/js/lottie.js does the work.
 *
 * @package BricksMotionStudio
 */

defined( 'ABSPATH' ) || exit;

class BME_Element_Lottie extends \Bricks\Element {

	public $category = 'media';
	public $name     = 'bme-lottie';
	public $icon     = 'ti-video-clapper';

	public function get_label() {
		return esc_html__( 'Lottie animation', 'bricks-motion-studio' );
	}

	public function get_keywords() {
		return array( 'lottie', 'bodymovin', 'after effects', 'animation', 'json', 'motion' );
	}

	public function set_controls() {
		$this->controls['src'] = array(
			'tab'            => 'content',
			'label'          => esc_html__( 'Lottie file (JSON URL)', 'bricks-motion-studio' ),
			'type'           => 'text',
			'placeholder'    => 'https://…/animation.json',
			'hasDynamicData' => true,
			'description'    => esc_html__( 'The URL of a Lottie .json file: upload it to the Media Library (administrators can upload .json there) or use a file from LottieFiles. Other sites must allow it to be loaded (CORS).', 'bricks-motion-studio' ),
		);

		$this->controls['trigger'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Play', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'autoplay' => esc_html__( 'On load', 'bricks-motion-studio' ),
				'view'     => esc_html__( 'When scrolled into view', 'bricks-motion-studio' ),
				'hover'    => esc_html__( 'On hover (reverses on leave)', 'bricks-motion-studio' ),
				'click'    => esc_html__( 'On click (play / pause)', 'bricks-motion-studio' ),
				'scroll'   => esc_html__( 'With scrolling (scrubbed)', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'On load', 'bricks-motion-studio' ),
			'inline'      => true,
		);

		$this->controls['loop'] = array(
			'tab'      => 'content',
			'label'    => esc_html__( 'Loop', 'bricks-motion-studio' ),
			'type'     => 'checkbox',
			'default'  => true,
			'required' => array( 'trigger', '!=', array( 'hover', 'scroll' ) ),
		);

		$this->controls['speed'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Speed', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0.1,
			'max'         => 5,
			'step'        => 0.1,
			'placeholder' => '1',
			'inline'      => true,
			'required'    => array( 'trigger', '!=', 'scroll' ),
		);

		$this->controls['still'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Still frame', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'first' => esc_html__( 'First frame', 'bricks-motion-studio' ),
				'last'  => esc_html__( 'Last frame', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'First frame', 'bricks-motion-studio' ),
			'inline'      => true,
			'description' => esc_html__( 'Shown instead of the animation to visitors who prefer reduced motion.', 'bricks-motion-studio' ),
		);

		$this->controls['label'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Description (for screen readers)', 'bricks-motion-studio' ),
			'type'        => 'text',
			'placeholder' => esc_html__( 'Decorative', 'bricks-motion-studio' ),
			'description' => esc_html__( 'Describe what the animation shows if it carries meaning. Empty: decorative, hidden from screen readers.', 'bricks-motion-studio' ),
		);
	}

	/** The player and the light Lottie build, registered here so only pages with the element load them. */
	public function enqueue_scripts() {
		$ver = class_exists( '\BricksMotionStudio\Assets' ) ? \BricksMotionStudio\Assets::asset_version() : BME_VERSION;
		$min = class_exists( '\BricksMotionStudio\Assets' ) ? \BricksMotionStudio\Assets::min() : '.min';
		wp_register_script( 'bme-lottie-lib', BME_URL . 'assets/vendor/lottie/lottie_light.min.js', array(), '5.13.0', array( 'in_footer' => true, 'strategy' => 'defer' ) );
		wp_enqueue_script( 'bme-lottie', BME_URL . 'assets/js/lottie' . $min . '.js', array( 'bme-lottie-lib' ), $ver, array( 'in_footer' => true, 'strategy' => 'defer' ) );
	}

	public function render() {
		$s       = $this->settings;
		$src     = isset( $s['src'] ) && is_scalar( $s['src'] ) ? trim( (string) $s['src'] ) : '';
		$src     = '' !== $src ? esc_url_raw( $this->render_dynamic_data( $src ) ) : '';
		$trigger = isset( $s['trigger'] ) && in_array( $s['trigger'], array( 'autoplay', 'view', 'hover', 'click', 'scroll' ), true ) ? $s['trigger'] : 'autoplay';
		$speed   = isset( $s['speed'] ) && is_numeric( $s['speed'] ) ? max( 0.1, min( 5, (float) $s['speed'] ) ) : 1;
		$label   = isset( $s['label'] ) && is_scalar( $s['label'] ) ? trim( sanitize_text_field( (string) $s['label'] ) ) : '';

		if ( '' === $src ) {
			if ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() || bricks_is_builder_call() ) ) {
				return $this->render_element_placeholder(
					array(
						'title' => esc_html__( 'Add the URL of a Lottie .json file.', 'bricks-motion-studio' ),
					)
				);
			}
			return; // nothing to show on the page
		}

		$config = array(
			'src'     => $src,
			'trigger' => $trigger,
			'loop'    => in_array( $trigger, array( 'hover', 'scroll' ), true ) ? false : ! empty( $s['loop'] ),
			'speed'   => $speed,
			'still'   => isset( $s['still'] ) && 'last' === $s['still'] ? 'last' : 'first',
			// Motion Studio off for this page or visitor (status, excluded path): a still frame.
			'static'  => class_exists( '\BricksMotionStudio\Bricks_Integration' ) && \BricksMotionStudio\Bricks_Integration::is_passive_context(),
		);

		$this->set_attribute( '_root', 'class', 'bme-lottie' );
		$this->set_attribute( '_root', 'data-bme-lottie', wp_json_encode( $config ) );
		if ( 'click' === $trigger ) {
			// A real control: focusable, announced as a toggle.
			$this->set_attribute( '_root', 'role', 'button' );
			$this->set_attribute( '_root', 'tabindex', '0' );
			$this->set_attribute( '_root', 'aria-pressed', 'false' );
			$this->set_attribute( '_root', 'aria-label', '' !== $label ? $label : __( 'Play animation', 'bricks-motion-studio' ) );
		} elseif ( '' !== $label ) {
			$this->set_attribute( '_root', 'role', 'img' );
			$this->set_attribute( '_root', 'aria-label', $label );
		} else {
			$this->set_attribute( '_root', 'aria-hidden', 'true' );
		}

		static $styled = false;
		$out           = '';
		if ( ! $styled ) {
			$styled = true;
			// Zero specificity: the element's own size settings win. The box takes the animation's
			// proportions once it has loaded (lottie.js) unless a height is set.
			$out .= '<style id="bme-lottie-css">:where(.bme-lottie){display:block;width:100%;line-height:0}:where(.bme-lottie) svg{display:block}:where(.bme-lottie[role="button"]){cursor:pointer}</style>';
		}
		$out .= '<div ' . $this->render_attributes( '_root' ) . '></div>';
		echo $out; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- attributes escaped by Bricks.
	}
}
