<?php
/**
 * Bricks element: 3D Scene (Three.js).
 *
 * Renders a Three.js canvas (procedural scenes or a GLB/GLTF model). Three.js is only
 * downloaded when the element approaches the viewport.
 *
 * @package BricksMotionStudio
 */

defined( 'ABSPATH' ) || exit;

class BME_Element_3D_Scene extends \Bricks\Element {

	public $category = 'media';
	public $name     = 'bme-3d-scene';
	public $icon     = 'ti-layers-alt';
	public $tag      = 'div';

	public function get_label() {
		return esc_html__( '3D Scene (Three.js)', 'bricks-motion-studio' );
	}

	public function get_keywords() {
		return array( '3d', 'three', 'webgl', 'model', 'glb', 'gltf', 'particles', 'motion', 'animation' );
	}

	public function set_control_groups() {
		$this->control_groups['scene']    = array(
			'title' => esc_html__( 'Scene', 'bricks-motion-studio' ),
			'tab'   => 'content',
		);
		$this->control_groups['model']    = array(
			'title'    => esc_html__( 'Model', 'bricks-motion-studio' ),
			'tab'      => 'content',
			'required' => array( 'scene', '=', 'model' ),
		);
		$this->control_groups['fallback'] = array(
			'title' => esc_html__( 'Fallback & accessibility', 'bricks-motion-studio' ),
			'tab'   => 'content',
		);
	}

	public function set_controls() {
		$this->controls['scene'] = array(
			'tab'     => 'content',
			'group'   => 'scene',
			'label'   => esc_html__( 'Scene', 'bricks-motion-studio' ),
			'type'    => 'select',
			'options' => \BricksMotionStudio\Bricks_Integration::scene_options( true ),
			'default' => 'particles',
			'inline'  => true,
		);

		$this->controls['height'] = array(
			'tab'     => 'content',
			'group'   => 'scene',
			'label'   => esc_html__( 'Height', 'bricks-motion-studio' ),
			'type'    => 'number',
			'units'   => true,
			'default' => '420px',
			'css'     => array(
				array(
					'property' => 'height',
				),
			),
		);

		foreach ( array( 'A', 'B', 'C' ) as $i => $letter ) {
			$this->controls[ 'color' . $letter ] = array(
				'tab'    => 'content',
				'group'  => 'scene',
				/* translators: %d: color number */
				'label'  => sprintf( esc_html__( 'Color %d', 'bricks-motion-studio' ), $i + 1 ),
				'type'   => 'color',
				'inline' => true,
			);
		}

		$this->controls['density'] = array(
			'tab'         => 'content',
			'group'       => 'scene',
			'label'       => esc_html__( 'Density', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0.1,
			'max'         => 3,
			'step'        => 0.1,
			'placeholder' => '1',
			'inline'      => true,
			'required'    => array( 'scene', '=', array( 'particles', 'waves', 'orbs' ) ),
		);

		$this->controls['speed'] = array(
			'tab'         => 'content',
			'group'       => 'scene',
			'label'       => esc_html__( 'Speed', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 5,
			'step'        => 0.1,
			'placeholder' => '1',
			'inline'      => true,
		);

		$this->controls['opacity'] = array(
			'tab'         => 'content',
			'group'       => 'scene',
			'label'       => esc_html__( 'Opacity', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 1,
			'step'        => 0.05,
			'placeholder' => '1',
			'inline'      => true,
		);

		$this->controls['interactive'] = array(
			'tab'     => 'content',
			'group'   => 'scene',
			'label'   => esc_html__( 'React to pointer', 'bricks-motion-studio' ),
			'type'    => 'checkbox',
			'default' => true,
		);

		// Model.
		$this->controls['modelUrl'] = array(
			'tab'            => 'content',
			'group'          => 'model',
			'label'          => esc_html__( 'Model URL (.glb / .gltf)', 'bricks-motion-studio' ),
			'type'           => 'text',
			'placeholder'    => 'https://example.com/wp-content/uploads/model.glb',
			'hasDynamicData' => true,
			'description'    => esc_html__( 'Upload the .glb to the Media Library (you may need to allow the file type) and paste its URL. Draco-compressed models are not supported.', 'bricks-motion-studio' ),
		);

		$this->controls['autoRotate'] = array(
			'tab'     => 'content',
			'group'   => 'model',
			'label'   => esc_html__( 'Auto-rotate', 'bricks-motion-studio' ),
			'type'    => 'checkbox',
			'default' => true,
		);

		$this->controls['orbit'] = array(
			'tab'   => 'content',
			'group' => 'model',
			'label' => esc_html__( 'Drag to rotate (orbit controls)', 'bricks-motion-studio' ),
			'type'  => 'checkbox',
		);

		$this->controls['exposure'] = array(
			'tab'         => 'content',
			'group'       => 'model',
			'label'       => esc_html__( 'Exposure', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0.1,
			'max'         => 4,
			'step'        => 0.1,
			'placeholder' => '1',
			'inline'      => true,
		);

		// Fallback.
		$this->controls['poster'] = array(
			'tab'         => 'content',
			'group'       => 'fallback',
			'label'       => esc_html__( 'Poster image', 'bricks-motion-studio' ),
			'type'        => 'image',
			'description' => esc_html__( 'Shown until the scene is ready, and instead of the scene when WebGL is unavailable or reduced motion is requested.', 'bricks-motion-studio' ),
		);

		$this->controls['ariaLabel'] = array(
			'tab'         => 'content',
			'group'       => 'fallback',
			'label'       => esc_html__( 'Accessible description', 'bricks-motion-studio' ),
			'type'        => 'text',
			'placeholder' => esc_html__( 'Decorative (hidden from screen readers)', 'bricks-motion-studio' ),
		);
	}

	public function render() {
		$settings = $this->settings;
		$str      = static function ( $v, $fallback = '' ) {
			return is_string( $v ) ? $v : $fallback;
		};
		$scene    = $str( $settings['scene'] ?? null, 'particles' );

		if ( ! array_key_exists( $scene, \BricksMotionStudio\Bricks_Integration::scene_options( true ) ) ) {
			$scene = 'particles';
		}

		$config = \BricksMotionStudio\Bricks_Integration::scene_config(
			array(
				'sceneColorA'      => $settings['colorA'] ?? null,
				'sceneColorB'      => $settings['colorB'] ?? null,
				'sceneColorC'      => $settings['colorC'] ?? null,
				'sceneDensity'     => $settings['density'] ?? null,
				'sceneSpeed'       => $settings['speed'] ?? null,
				'sceneOpacity'     => $settings['opacity'] ?? null,
				'sceneInteractive' => $settings['interactive'] ?? null,
			),
			$scene,
			'scene'
		);

		$config['mode'] = 'element';

		if ( 'model' === $scene ) {
			$model_raw = $str( $settings['modelUrl'] ?? null );
			$url       = '' !== $model_raw ? trim( (string) $this->render_dynamic_data( $model_raw ) ) : '';
			$url       = $url ? esc_url_raw( $url, array( 'http', 'https' ) ) : '';
			if ( $url ) {
				$config['model'] = $url;
			}
			$config['autoRotate'] = empty( $settings['autoRotate'] ) ? 0 : 1;
			$config['orbit']      = empty( $settings['orbit'] ) ? 0 : 1;
			if ( isset( $settings['exposure'] ) && is_scalar( $settings['exposure'] ) && is_numeric( $settings['exposure'] ) ) {
				$config['exposure'] = max( 0.1, min( 4, (float) $settings['exposure'] ) );
			}
		}

		$this->set_attribute( '_root', 'class', 'bme-3d-scene' );

		$aria_raw = $str( $settings['ariaLabel'] ?? null );
		if ( '' !== $aria_raw ) {
			$this->set_attribute( '_root', 'role', 'img' );
			$this->set_attribute( '_root', 'aria-label', wp_strip_all_tags( (string) $this->render_dynamic_data( $aria_raw ) ) );
		} else {
			$this->set_attribute( '_root', 'aria-hidden', 'true' );
		}

		$poster = '';
		if ( ! empty( $settings['poster'] ) && is_array( $settings['poster'] ) ) {
			$poster_id  = isset( $settings['poster']['id'] ) && is_numeric( $settings['poster']['id'] ) ? (int) $settings['poster']['id'] : 0;
			$poster_sz  = $str( $settings['poster']['size'] ?? null, 'large' );
			$poster_url = $poster_id ? wp_get_attachment_image_url( $poster_id, $poster_sz ) : $str( $settings['poster']['url'] ?? null );
			if ( $poster_url ) {
				$poster = '<img class="bme-3d-poster" src="' . esc_url( $poster_url ) . '" alt="" loading="lazy" decoding="async">';
			}
		}

		// Builder canvas: static placeholder (the WebGL runtime only runs on the frontend).
		if ( \BricksMotionStudio\Bricks_Integration::is_passive_context() ) {
			$labels = \BricksMotionStudio\Bricks_Integration::scene_options( true );
			echo '<div ' . $this->render_attributes( '_root' ) . '>' . $poster . '<div class="bme-3d-placeholder"><strong>' . esc_html__( '3D Scene', 'bricks-motion-studio' ) . '</strong><span>' . esc_html( $labels[ $scene ] ) . ' — ' . esc_html__( 'renders on the frontend', 'bricks-motion-studio' ) . '</span></div></div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			return;
		}

		if ( ! \BricksMotionStudio\Settings::library_enabled( 'three' ) ) {
			echo '<div ' . $this->render_attributes( '_root' ) . '>' . $poster . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			return;
		}

		$this->set_attribute( '_root', 'data-bme-3d', wp_json_encode( $config ) );
		\BricksMotionStudio\Usage::feature( 'three' );

		echo '<div ' . $this->render_attributes( '_root' ) . '>' . $poster . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}
