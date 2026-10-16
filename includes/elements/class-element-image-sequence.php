<?php
/**
 * Bricks element: "Image sequence (scroll)".
 *
 * A series of frames (an exported video or 3D render) drawn on a canvas by scroll position: the
 * product turns, the scene plays as the visitor scrolls. Frames come from the Media Library or
 * from a numbered URL pattern. Two ways to play: while the element crosses the screen, or pinned
 * (it stays on screen for a scroll length you choose, CSS sticky, no library). Visitors who prefer
 * reduced motion, and pages where Motion Studio is off, see a still frame.
 * assets/js/sequence.js does the drawing.
 *
 * @package BricksMotionStudio
 */

defined( 'ABSPATH' ) || exit;

class BME_Element_Image_Sequence extends \Bricks\Element {

	public $category = 'media';
	public $name     = 'bme-image-sequence';
	public $icon     = 'ti-layout-slider';

	/** Frames per element (each is a download). */
	const MAX_FRAMES = 300;

	public function get_label() {
		return esc_html__( 'Image sequence (scroll)', 'bricks-motion-studio' );
	}

	public function get_keywords() {
		return array( 'image sequence', 'frames', 'scroll', 'scrub', 'video', 'apple', 'canvas', 'motion' );
	}

	public function set_controls() {
		$this->controls['source'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Frames', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'pattern' => esc_html__( 'Numbered URLs (frame_{n}.webp)', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'Images from the Media Library', 'bricks-motion-studio' ),
			'inline'      => true,
		);

		$this->controls['images'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Images (in order)', 'bricks-motion-studio' ),
			'type'        => 'image-gallery',
			'description' => esc_html__( 'Select the frames in playing order (sorted by file name in the Media Library).', 'bricks-motion-studio' ),
			'required'    => array( 'source', '!=', 'pattern' ),
		);

		$this->controls['pattern'] = array(
			'tab'            => 'content',
			'label'          => esc_html__( 'URL pattern', 'bricks-motion-studio' ),
			'type'           => 'text',
			'placeholder'    => 'https://…/frames/frame_{n}.webp',
			'hasDynamicData' => true,
			'description'    => esc_html__( '{n} is replaced by the frame number.', 'bricks-motion-studio' ),
			'required'       => array( 'source', '=', 'pattern' ),
		);
		$this->controls['first']   = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'First number', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'placeholder' => '1',
			'inline'      => true,
			'small'       => true,
			'required'    => array( 'source', '=', 'pattern' ),
		);
		$this->controls['last']    = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Last number', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'placeholder' => '60',
			'inline'      => true,
			'small'       => true,
			'required'    => array( 'source', '=', 'pattern' ),
		);
		$this->controls['digits']  = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Digits (zero padding)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 1,
			'max'         => 6,
			'placeholder' => '1',
			'description' => esc_html__( '4 turns 7 into 0007.', 'bricks-motion-studio' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( 'source', '=', 'pattern' ),
		);

		$this->controls['mode']   = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Play', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'pin' => esc_html__( 'Pinned: stays on screen while it plays', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'While it crosses the screen', 'bricks-motion-studio' ),
			'inline'      => true,
		);
		$this->controls['length'] = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Scroll length (% of the screen height)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 100,
			'max'         => 1000,
			'step'        => 10,
			'placeholder' => '300',
			'inline'      => true,
			'required'    => array( 'mode', '=', 'pin' ),
		);
		$this->controls['fit']    = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Fit', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'contain' => esc_html__( 'Whole frame (contain)', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'Fill (cover)', 'bricks-motion-studio' ),
			'inline'      => true,
		);
		$this->controls['still']  = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Still frame', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'last' => esc_html__( 'Last frame', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'First frame', 'bricks-motion-studio' ),
			'description' => esc_html__( 'Shown instead of the sequence to visitors who prefer reduced motion.', 'bricks-motion-studio' ),
			'inline'      => true,
		);
		$this->controls['label']  = array(
			'tab'         => 'content',
			'label'       => esc_html__( 'Description (for screen readers)', 'bricks-motion-studio' ),
			'type'        => 'text',
			'placeholder' => esc_html__( 'Decorative', 'bricks-motion-studio' ),
			'description' => esc_html__( 'Describe what the sequence shows if it carries meaning. Empty: decorative.', 'bricks-motion-studio' ),
		);
	}

	public function enqueue_scripts() {
		$ver = class_exists( '\BricksMotionStudio\Assets' ) ? \BricksMotionStudio\Assets::asset_version() : BME_VERSION;
		$min = class_exists( '\BricksMotionStudio\Assets' ) ? \BricksMotionStudio\Assets::min() : '.min';
		wp_enqueue_script( 'bme-sequence', BME_URL . 'assets/js/sequence' . $min . '.js', array(), $ver, array( 'in_footer' => true, 'strategy' => 'defer' ) );
	}

	/**
	 * Frame URLs in playing order.
	 *
	 * @param array $s Settings.
	 * @return string[]
	 */
	private function frames( array $s ) {
		$out = array();
		if ( isset( $s['source'] ) && 'pattern' === $s['source'] ) {
			$pattern = isset( $s['pattern'] ) && is_scalar( $s['pattern'] ) ? trim( $this->render_dynamic_data( (string) $s['pattern'] ) ) : '';
			if ( false === strpos( $pattern, '{n}' ) ) {
				return $out;
			}
			$first  = isset( $s['first'] ) && is_numeric( $s['first'] ) ? max( 0, (int) $s['first'] ) : 1;
			$last   = isset( $s['last'] ) && is_numeric( $s['last'] ) ? max( 0, (int) $s['last'] ) : 60;
			$digits = isset( $s['digits'] ) && is_numeric( $s['digits'] ) ? max( 1, min( 6, (int) $s['digits'] ) ) : 1;
			$step   = $last >= $first ? 1 : -1;
			for ( $n = $first, $i = 0; $i < self::MAX_FRAMES; $n += $step, $i++ ) {
				$url = esc_url_raw( str_replace( '{n}', str_pad( (string) $n, $digits, '0', STR_PAD_LEFT ), $pattern ), array( 'http', 'https' ) );
				if ( $url ) {
					$out[] = $url;
				}
				if ( $n === $last ) {
					break;
				}
			}
			return $out;
		}
		$images = isset( $s['images']['images'] ) && is_array( $s['images']['images'] ) ? $s['images']['images'] : array();
		$size   = isset( $s['images']['size'] ) && is_string( $s['images']['size'] ) ? $s['images']['size'] : 'full';
		foreach ( array_slice( $images, 0, self::MAX_FRAMES ) as $img ) {
			$url = \BricksMotionStudio\Bricks_Integration::image_url( array_merge( is_array( $img ) ? $img : array(), array( 'size' => $size ) ) );
			if ( '' !== $url ) {
				$out[] = $url;
			}
		}
		return $out;
	}

	public function render() {
		$s      = $this->settings;
		$frames = $this->frames( $s );
		if ( ! $frames ) {
			if ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() || bricks_is_builder_call() ) ) {
				return $this->render_element_placeholder( array( 'title' => esc_html__( 'Add the frames: images from the Media Library or a numbered URL pattern.', 'bricks-motion-studio' ) ) );
			}
			return;
		}
		$pin    = isset( $s['mode'] ) && 'pin' === $s['mode'];
		$length = isset( $s['length'] ) && is_numeric( $s['length'] ) ? (int) max( 100, min( 1000, (float) $s['length'] ) ) : 300;
		$still  = isset( $s['still'] ) && 'last' === $s['still'] ? 'last' : 'first';
		$label  = isset( $s['label'] ) && is_scalar( $s['label'] ) ? trim( sanitize_text_field( (string) $s['label'] ) ) : '';
		$config = array(
			'frames' => $frames,
			'mode'   => $pin ? 'pin' : 'view',
			'fit'    => isset( $s['fit'] ) && 'contain' === $s['fit'] ? 'contain' : 'cover',
			'still'  => $still,
			// Motion Studio off for this page or visitor (status, excluded path): the still frame.
			'static' => class_exists( '\BricksMotionStudio\Bricks_Integration' ) && \BricksMotionStudio\Bricks_Integration::is_passive_context(),
		);

		$this->set_attribute( '_root', 'class', 'bme-seq' );
		$this->set_attribute( '_root', 'data-mode', $config['mode'] );
		$this->set_attribute( '_root', 'data-bme-seq', \BricksMotionStudio\Plugin::json( $config ) );
		if ( $pin ) {
			$this->set_attribute( '_root', 'style', '--bme-seq-len:' . $length . 'vh' );
		}
		if ( '' !== $label ) {
			$this->set_attribute( '_root', 'role', 'img' );
			$this->set_attribute( '_root', 'aria-label', $label );
		} else {
			$this->set_attribute( '_root', 'aria-hidden', 'true' );
		}

		static $styled = false;
		$out           = '';
		if ( ! $styled ) {
			$styled = true;
			// Zero specificity: the element's own size settings win. "While it crosses the screen"
			// takes the frames' proportions (from the still frame) unless a height is set.
			$out .= '<style id="bme-seq-css">:where(.bme-seq){display:block;position:relative;width:100%}'
				. ':where(.bme-seq[data-mode="pin"]){height:var(--bme-seq-len,300vh)}'
				. ':where(.bme-seq) .bme-seq__stage{position:relative;width:100%;height:100%;overflow:hidden}'
				. ':where(.bme-seq[data-mode="pin"]) .bme-seq__stage{position:sticky;top:0;height:100vh;height:100svh}'
				. '.bme-seq__still,.bme-seq canvas{display:block;width:100%;height:100%;object-fit:cover}'
				. '.bme-seq[data-fit="contain"] .bme-seq__still{object-fit:contain}'
				. '.bme-seq canvas{position:absolute;inset:0}'
				. '.bme-seq.is-ready .bme-seq__still{visibility:hidden}'
				. ':where(.bme-seq[data-mode="view"]) .bme-seq__still{height:auto}</style>';
		}
		$still_src = 'last' === $still ? end( $frames ) : $frames[0];
		if ( 'contain' === $config['fit'] ) {
			$this->set_attribute( '_root', 'data-fit', 'contain' );
		}
		$out .= '<div ' . $this->render_attributes( '_root' ) . '><div class="bme-seq__stage">'
			. '<img class="bme-seq__still" src="' . esc_url( $still_src ) . '" alt="" decoding="async"' . ( $pin ? '' : ' loading="lazy"' ) . '>'
			. '</div></div>';
		echo $out; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- attributes escaped by Bricks, URL escaped above.
	}
}
