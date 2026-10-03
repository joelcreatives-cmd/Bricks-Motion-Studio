<?php
/**
 * Bricks element: "Pause animations" button.
 *
 * Pauses and resumes everything on the page that keeps moving (loops, marquees, timeline loops,
 * 3D backgrounds): the pause control WCAG 2.2.2 asks for when motion lasts longer than five
 * seconds. The choice is remembered for the rest of the visit. The runtime (or timeline.js on
 * timeline-only pages) handles the click through the data-bme-pause-toggle attribute.
 *
 * @package BricksMotionStudio
 */

defined( 'ABSPATH' ) || exit;

class BME_Element_Pause_Toggle extends \Bricks\Element {

	public $category = 'general';
	public $name     = 'bme-pause-toggle';
	public $icon     = 'ti-control-pause';
	public $tag      = 'button';

	public function get_label() {
		return esc_html__( 'Pause animations button', 'bricks-motion-studio' );
	}

	public function get_keywords() {
		return array( 'pause', 'stop', 'motion', 'animation', 'accessibility', 'a11y', 'wcag' );
	}

	public function set_controls() {
		$this->controls['label'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Label', 'bricks-motion-studio' ),
			'type'        => 'text',
			'default'     => __( 'Pause animations', 'bricks-motion-studio' ), // saved as text, escaped on output
			'placeholder' => __( 'Pause animations', 'bricks-motion-studio' ),
			'description' => esc_html__( 'Screen readers announce it as a toggle that is pressed while animations are paused. The icon switches between pause and play.', 'bricks-motion-studio' ),
		);

		$this->controls['showIcon'] = array(
			'tab'     => 'content',
			'label'   => esc_html__( 'Show icon', 'bricks-motion-studio' ),
			'type'    => 'checkbox',
			'default' => true,
		);

		$this->controls['hideLabel'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Icon only', 'bricks-motion-studio' ),
			'type'        => 'checkbox',
			'description' => esc_html__( 'The label stays readable for screen readers.', 'bricks-motion-studio' ),
			'required'    => array( 'showIcon', '=', true ),
		);

		$this->controls['gap'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Gap', 'bricks-motion-studio' ),
			'type'        => 'number',
			'units'       => true,
			'placeholder' => '0.5em',
			'css'         => array(
				array(
					'property' => 'gap',
				),
			),
			'required'    => array( 'showIcon', '=', true ),
		);
	}

	public function render() {
		$settings = $this->settings;
		$label    = isset( $settings['label'] ) && is_scalar( $settings['label'] ) && '' !== trim( (string) $settings['label'] ) ? (string) $settings['label'] : __( 'Pause animations', 'bricks-motion-studio' );
		$icon     = ! empty( $settings['showIcon'] );
		$only     = $icon && ! empty( $settings['hideLabel'] );

		$this->set_attribute( '_root', 'type', 'button' );
		$this->set_attribute( '_root', 'data-bme-pause-toggle', '' );
		$this->set_attribute( '_root', 'aria-pressed', 'false' );
		$this->set_attribute( '_root', 'class', 'bme-pause' );

		$svg = static function ( $path, $which ) {
			return '<svg data-bme-icon="' . $which . '" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"' . ( 'play' === $which ? ' hidden' : '' ) . '><path d="' . $path . '"/></svg>';
		};

		// Base styles once per page, at zero specificity so the Gap control and the Style tab win.
		// Inline here: pages with timelines only don't load the plugin stylesheet.
		static $styled = false;
		$out           = '';
		if ( ! $styled ) {
			$styled = true;
			$out   .= '<style id="bme-pause-css">:where(.bme-pause){display:inline-flex;align-items:center;gap:.5em;cursor:pointer}:where(.bme-pause) svg[hidden]{display:none}</style>';
		}
		$out .= '<' . $this->tag . ' ' . $this->render_attributes( '_root' ) . '>';
		if ( $icon ) {
			$out .= $svg( 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', 'pause' ) . $svg( 'M8 5.5v13l10.5-6.5z', 'play' );
		}
		$text_style = $only ? ' style="position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0"' : '';
		$out       .= '<span class="bme-pause__label"' . $text_style . '>' . esc_html( $label ) . '</span>';
		$out       .= '</' . $this->tag . '>';

		// Usage: the runtime (or timeline.js) must be on the page for the button to work; both
		// already load wherever something moves. Nothing moving: the button is simply inert.
		echo $out; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- attributes escaped by Bricks, label by esc_html.
	}
}
