<?php
/**
 * Bricks Builder integration:
 *  - injects a "Motion Studio" control group into every registered element (native + third-party),
 *  - resolves per-element settings / auto-animate rules at render time and prints data attributes,
 *  - tracks which engines/plugins the page needs (see Usage),
 *  - registers the "3D Scene" element.
 *
 * Verified against Bricks 2.3.x source:
 *  - Elements::init_elements() runs on `init` (10); custom elements register on `init` (11);
 *    Element::load() applies "bricks/elements/{name}/controls" lazily on `wp` or on demand,
 *    so filters added on `init` (late priority) reach every element.
 *  - Bricks adds its own interaction attributes on "bricks/element/set_root_attributes" (10);
 *    we run at 20 so data-interactions is already present for conflict detection.
 *  - Frontend::render_data() fires bricks/frontend/before_render_data with $area
 *    ('header' | 'content' | 'footer' | 'popup').
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Bricks_Integration {

	/** Control group key. */
	const GROUP = 'bmeMotion';

	/** Tab the group lives in. Content-tab settings are always stored on the element itself. */
	const TAB = 'content';

	/** Elements that can host a Three.js background. */
	const LAYOUT_ELEMENTS = array( 'section', 'container', 'block', 'div' );

	/** Elements never auto-animated (they animate themselves or break when transformed). */
	const NEVER_AUTO = array( 'slider', 'slider-nested', 'carousel', 'nav-menu', 'nav-nested', 'offcanvas', 'toggle', 'back-to-top', 'post-reading-progress-bar', 'animated-typing', 'counter', 'testimonials', 'map', 'map-leaflet', 'map-connector', 'code', 'html', 'shortcode', 'template', 'slot', 'bme-3d-scene', 'bme-pause-toggle', 'dropdown', 'toggle-mode', 'post-content', 'wordpress', 'sidebar', 'facebook-page', 'instagram-feed', 'pagination', 'query-results-summary' );

	/** @var string[] Render area stack (header/content/footer/popup). */
	private $areas = array();

	/** @var array|null Global class id → name map. */
	private $class_names = null;

	public function __construct() {
		add_action( 'init', array( $this, 'register_element' ), 11 );
		// After every element (native @10, third-party @11+) registered, before `wp` loads controls.
		add_action( 'init', array( $this, 'hook_controls' ), 9999 );
		// Page settings (Settings → Page settings → Motion Studio) in the builder.
		add_filter( 'builder/settings/page/controls_data', array( $this, 'page_controls' ) );

		// Second pass right before Bricks loads controls: catches element packs that register late.
		add_action( 'bricks/load_elements/before', array( $this, 'hook_controls' ) );

		add_filter( 'bricks/element/set_root_attributes', array( $this, 'root_attributes' ), 20, 2 );
		add_action( 'bricks/render_query_page/start', array( __CLASS__, 'load_request_page_settings' ) );
		add_action( 'bricks/render_query_result/start', array( __CLASS__, 'load_request_page_settings' ) );
		// Root attributes are built before Bricks checks element conditions: only count what renders.
		add_filter( 'bricks/element/render', array( $this, 'commit_usage' ), 9999, 2 );
		// As late as possible before footer scripts print (wp_footer:20): Bricks templates assigned
		// to wp_footer up to priority 18 are counted too.
		add_action( 'wp_footer', array( $this, 'flush_usage' ), 18 );

		add_action( 'bricks/frontend/before_render_data', array( $this, 'push_area' ), 10, 2 );
		add_action( 'bricks/frontend/after_render_data', array( $this, 'pop_area' ), 10, 2 );
	}

	/* ---------------------------------------------------------------------
	 * Builder controls
	 * ------------------------------------------------------------------ */

	public function register_element() {
		if ( class_exists( '\Bricks\Elements' ) ) {
			\Bricks\Elements::register_element( BME_PATH . 'includes/elements/class-element-3d-scene.php', 'bme-3d-scene', 'BME_Element_3D_Scene' );
			\Bricks\Elements::register_element( BME_PATH . 'includes/elements/class-element-pause-toggle.php', 'bme-pause-toggle', 'BME_Element_Pause_Toggle' );
		}
	}

	public function hook_controls() {
		if ( ! class_exists( '\Bricks\Elements' ) || empty( \Bricks\Elements::$elements ) ) {
			return;
		}

		foreach ( array_keys( \Bricks\Elements::$elements ) as $name ) {
			if ( isset( $this->hooked[ $name ] ) ) {
				continue;
			}
			$this->hooked[ $name ] = true;
			add_filter( "bricks/elements/{$name}/control_groups", array( $this, 'add_control_group' ) );
			add_filter( "bricks/elements/{$name}/controls", array( $this, 'add_controls' ) );
		}
	}

	/** @var array<string,bool> Element names whose control filters are hooked. */
	private $hooked = array();

	public function add_control_group( $groups ) {
		$groups[ self::GROUP ] = array(
			'title' => esc_html__( 'Motion Studio', 'bricks-motion-studio' ),
			'tab'   => self::TAB,
		);
		return $groups;
	}

	/**
	 * Adds the controls. The element name is not passed to the filter, so read it from the
	 * current filter name ("bricks/elements/{name}/controls").
	 *
	 * @param array $controls Controls.
	 * @return array
	 */
	/** @var array<string,array> Built controls per element name. */
	private $controls_cache = array();

	/**
	 * Controls are only needed where Bricks shows or saves them (builder, builder REST/AJAX, admin).
	 * On frontend renders Bricks calls load() for every element (and every loop iteration), so skip.
	 *
	 * @return bool
	 */
	private function controls_needed() {
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return true;
		}
		if ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_call() ) ) {
			return true;
		}
		return ! did_action( 'wp' ) || (bool) apply_filters( 'bme/force_controls', false );
	}

	public function add_controls( $controls ) {
		if ( ! is_array( $controls ) ) {
			return $controls;
		}
		if ( ! $this->controls_needed() ) {
			// Frontend: only the control type Bricks needs to merge component-instance values
			// into the timeline rows (it does that for repeaters only). No labels, no fields.
			$controls['bmeTimeline'] = $controls['bmeTimeline'] ?? array(
				'type'   => 'repeater',
				'fields' => array(), // Bricks' inline-CSS pass reads the fields of every repeater
			);
			return $controls;
		}
		$matches = array();
		$key     = preg_match( '#^bricks/elements/(.+)/controls$#', (string) current_filter(), $matches ) ? $matches[1] : '';
		if ( ! isset( $this->controls_cache[ $key ] ) ) {
			$this->controls_cache[ $key ] = $this->build_controls( $key );
		}
		return array_merge( $controls, $this->controls_cache[ $key ] );
	}

	/**
	 * @param string $name Element name.
	 * @return array
	 */
	private function build_controls( $name ) {

		$engines      = Settings::enabled_tween_engines();
		$engine_names = array(
			'gsap'   => 'GSAP',
			'anime'  => 'Anime.js',
			'motion' => 'Motion',
		);

		$engine_options = array();
		foreach ( $engines as $engine ) {
			$engine_options[ $engine ] = $engine_names[ $engine ];
		}

		$g = array(
			'tab'      => self::TAB,
			'group'    => self::GROUP,
			'rerender' => false,
		);

		$custom = array( 'bmeMode', '=', 'custom' );

		$scroll_presets = $this->preset_slugs( 'scroll' );
		$loop_presets   = $this->preset_slugs( 'loop' );
		$timed_presets  = array_values( array_diff( array_keys( Presets::all() ), $scroll_presets ) );
		$reveal_like    = array_values( array_diff( $timed_presets, $loop_presets ) );

		$c = array();

		$c['bmeMode'] = $g + array(
			'label'       => esc_html__( 'Animation', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'custom' => esc_html__( 'Custom', 'bricks-motion-studio' ),
				'off'    => esc_html__( 'Disabled', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'Auto (site rules)', 'bricks-motion-studio' ),
			'inline'      => true,
		);

		$c['bmeInfoAuto'] = $g + array(
			'type'     => 'info',
			'content'  => esc_html__( 'Auto: this element follows the site-wide rules in the Motion Studio dashboard menu.', 'bricks-motion-studio' ),
			'required' => array( 'bmeMode', '!=', array( 'custom', 'off' ) ),
		);

		// Live preview (builder-panel.js): plays on the canvas whenever these settings change, or here.
		$c['bmePreview'] = $g + array(
			'type'     => 'info',
			'content'  => '<button type="button" class="bme-preview-trigger" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><span aria-hidden="true">&#9654;</span> ' . esc_html__( 'Preview animation', 'bricks-motion-studio' ) . '</button>',
			'required' => array( 'bmeMode', '!=', 'off' ),
		);

		$level_options = array();
		foreach ( Levels::all() as $slug => $text ) {
			$level_options[ $slug ] = $text[0];
		}
		$c['bmeLevel'] = $g + array(
			'label'       => esc_html__( 'Level', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => $level_options,
			'placeholder' => esc_html__( 'Automatic', 'bricks-motion-studio' ),
			'inline'      => true,
			'description' => esc_html__( 'Automatic: element rules follow the page / site level; class rules keep their exact preset.', 'bricks-motion-studio' ),
			'required'    => array( 'bmeMode', '!=', array( 'custom', 'off' ) ),
		);

		$c['bmePreset'] = $g + array(
			'label'       => esc_html__( 'Preset', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => Presets::select_options(),
			'placeholder' => esc_html__( 'Select preset', 'bricks-motion-studio' ),
			'searchable'  => true,
			'required'    => $custom,
		);

		$engine_options = array( 'native' => esc_html__( 'Built-in (no library)', 'bricks-motion-studio' ) ) + $engine_options;
		if ( $engine_options ) {
			$c['bmeEngine'] = $g + array(
				'label'       => esc_html__( 'Engine', 'bricks-motion-studio' ),
				'type'        => 'select',
				'options'     => $engine_options,
				'placeholder' => esc_html__( 'Site default', 'bricks-motion-studio' ),
				'required'    => $custom,
			);
		}

		$c['bmeTrigger'] = $g + array(
			'label'       => esc_html__( 'Start', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'scroll' => esc_html__( 'When scrolled into view', 'bricks-motion-studio' ),
				'load'   => esc_html__( 'On page load', 'bricks-motion-studio' ),
				'manual' => esc_html__( 'By a Bricks interaction', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'When scrolled into view', 'bricks-motion-studio' ),
			'required'    => array( $custom, array( 'bmePreset', '=', $timed_presets ) ),
		);

		$c['bmeInfoManual'] = $g + array(
			'type'     => 'info',
			'content'  => esc_html(
				sprintf(
					/* translators: %s: the Bricks token %brx% (shown as is) */
					__( 'On the element that starts it: Interactions → add. Action: JavaScript (Function). Target: a CSS selector for this element: its class, or a custom attribute such as [data-reveal="hero"] (inside query loops and components the element has no CSS ID). Function name: BricksMotion.play (or BricksMotion.reset). Arguments: click "Add item" (fills in %s).', 'bricks-motion-studio' ),
					'%brx%'
				)
			),
			'required' => array( $custom, array( 'bmeTrigger', '=', 'manual' ) ),
		);

		$c['bmeScope'] = $g + array(
			'label'       => esc_html__( 'Animate', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'children' => esc_html__( 'Children (staggered)', 'bricks-motion-studio' ),
				'selector' => esc_html__( 'Custom selector (staggered)', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'This element', 'bricks-motion-studio' ),
			'required'    => array( $custom, array( 'bmePreset', '=', array_merge( $this->preset_slugs( 'reveal' ), $loop_presets, array( 'parallax', 'parallax-x', 'scroll-fade', 'scroll-scale', 'horizontal-scroll' ) ) ) ),
		);

		$c['bmeScopeSelector'] = $g + array(
			'label'       => esc_html__( 'Selector', 'bricks-motion-studio' ),
			'type'        => 'text',
			'placeholder' => '.card',
			'inline'      => true,
			'required'    => array( $custom, array( 'bmeScope', '=', 'selector' ) ),
		);

		$c['bmeDuration'] = $g + array(
			'label'       => esc_html__( 'Duration (s)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 20,
			'step'        => 0.1,
			'placeholder' => (string) Settings::get( 'defaults.duration' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( $custom, array( 'bmePreset', '=', $timed_presets ) ),
		);

		$c['bmeDelay'] = $g + array(
			'label'       => esc_html__( 'Delay (s)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 20,
			'step'        => 0.1,
			'placeholder' => (string) Settings::get( 'defaults.delay' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( $custom, array( 'bmePreset', '=', $timed_presets ) ),
		);

		$c['bmeStagger'] = $g + array(
			'label'       => esc_html__( 'Stagger (s)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 2,
			'step'        => 0.01,
			'placeholder' => (string) Settings::get( 'defaults.stagger' ),
			'inline'      => true,
			'small'       => true,
			'required'    => $custom,
		);

		$c['bmeEase'] = $g + array(
			'label'       => esc_html__( 'Easing', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => Settings::eases(),
			'placeholder' => Settings::eases()[ Settings::get( 'defaults.ease', 'smooth' ) ] ?? '',
			'inline'      => true,
			'required'    => array( $custom, array( 'bmePreset', '=', $timed_presets ) ),
		);

		$c['bmeDistance'] = $g + array(
			'label'       => esc_html__( 'Travel distance (px)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 400,
			'step'        => 1,
			'placeholder' => (string) Settings::get( 'defaults.distance' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( $custom, array( 'bmePreset', '=', $reveal_like ) ),
		);

		$c['bmeOffset'] = $g + array(
			'label'       => esc_html__( 'Start line (%)', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => 0,
			'max'         => 50,
			'step'        => 1,
			'placeholder' => (string) Settings::get( 'defaults.offset' ),
			'description' => esc_html__( 'Start when the element is this far above the bottom of the viewport.', 'bricks-motion-studio' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( $custom, array( 'bmePreset', '=', $reveal_like ) ),
		);

		$c['bmeSpeed'] = $g + array(
			'label'       => esc_html__( 'Speed / intensity', 'bricks-motion-studio' ),
			'type'        => 'number',
			'min'         => -2,
			'max'         => 2,
			'step'        => 0.05,
			'placeholder' => (string) Settings::get( 'defaults.speed' ),
			'inline'      => true,
			'small'       => true,
			'required'    => array( $custom, array( 'bmePreset', '=', array( 'parallax', 'parallax-x' ) ) ),
		);

		$c['bmeReplay'] = $g + array(
			'label'    => esc_html__( 'Replay when scrolled back into view', 'bricks-motion-studio' ),
			'type'     => 'checkbox',
			'required' => array( $custom, array( 'bmePreset', '=', $reveal_like ) ),
		);

		$c['bmeOffOn'] = $g + array(
			'label'       => esc_html__( 'Turn off on', 'bricks-motion-studio' ),
			'type'        => 'select',
			'multiple'    => true,
			'options'     => array(
				'phone'   => esc_html__( 'Phone (below 768px)', 'bricks-motion-studio' ),
				'tablet'  => esc_html__( 'Tablet (768–991px)', 'bricks-motion-studio' ),
				'desktop' => esc_html__( 'Desktop (992px and up)', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'Every screen size', 'bricks-motion-studio' ),
			'description' => esc_html__( 'This element shows as designed there: no animation, hover effect or timeline.', 'bricks-motion-studio' ),
			'required'    => array( 'bmeMode', '!=', 'off' ),
		);

		$c['bmeHover'] = $g + array(
			'label'       => esc_html__( 'Hover effect', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'lift'     => esc_html__( 'Lift', 'bricks-motion-studio' ),
				'grow'     => esc_html__( 'Grow', 'bricks-motion-studio' ),
				'magnetic' => esc_html__( 'Magnetic (follows pointer)', 'bricks-motion-studio' ),
				'tilt'     => esc_html__( '3D tilt', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'None', 'bricks-motion-studio' ),
			'inline'      => true,
			'required'    => array( 'bmeMode', '!=', 'off' ), // "Disabled" turns hover effects off too
		);

		// Timeline: keyframe rows for this element and the elements inside it.
		$c['bmeTlSeparator'] = $g + array(
			'label'       => esc_html__( 'Timeline (keyframes)', 'bricks-motion-studio' ),
			'type'        => 'separator',
			'required'    => array( 'bmeMode', '!=', 'off' ),
			'description' => esc_html__( 'Choreograph this element and anything inside it. Each row animates one property. Scroll rows follow this element\'s trip through the screen (0 = its top reaches the bottom of the screen, 100 = its bottom leaves the top), so a tall section can run a whole sequence.', 'bricks-motion-studio' ),
		);
		$c['bmeTimeline']    = $g + array(
			'label'         => esc_html__( 'Rows', 'bricks-motion-studio' ),
			'type'          => 'repeater',
			'required'      => array( 'bmeMode', '!=', 'off' ),
			'titleProperty' => 'prop',
			'fields'        => array(
				'on'           => array(
					'label'       => esc_html__( 'Trigger', 'bricks-motion-studio' ),
					'type'        => 'select',
					'options'     => array(
						'scroll' => esc_html__( 'Scroll position', 'bricks-motion-studio' ),
						'view'   => esc_html__( 'Scrolled into view (once)', 'bricks-motion-studio' ),
						'hover'  => esc_html__( 'Hover (reverses on leave)', 'bricks-motion-studio' ),
						'leave'  => esc_html__( 'Hover out (plays on leave instead of reversing)', 'bricks-motion-studio' ),
						'loop'   => esc_html__( 'Loop forever', 'bricks-motion-studio' ),
					),
					'placeholder' => esc_html__( 'Scroll position', 'bricks-motion-studio' ),
				),
				'target'       => array(
					'label'       => esc_html__( 'Target', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => esc_html__( 'This element', 'bricks-motion-studio' ),
					'description' => esc_html__( 'A selector inside this element (.card-image), or page:.selector for anywhere on the page.', 'bricks-motion-studio' ),
				),
				'prop'         => array(
					'label'       => esc_html__( 'Property', 'bricks-motion-studio' ),
					'type'        => 'select',
					'options'     => self::timeline_props(),
					'placeholder' => esc_html__( 'Move up / down (y)', 'bricks-motion-studio' ),
				),
				'keys'         => array(
					'label'       => esc_html__( 'Keyframes', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => '0: 100%, 100: 0%',
					'description' => esc_html__( 'percent: value pairs. Values must suit the property: lengths (px, %, vw, vh, em, rem) for position and size, deg or turn for rotate, plain numbers or % for scale and opacity, colors as #hex, rgb(), hsl(), a name or var(--color). auto = the element\'s own designed value; -overflow = slide until its far edge reaches its parent\'s edge. If one pair doesn\'t fit, the row is skipped.', 'bricks-motion-studio' ),
				),
				'duration'     => array(
					'label'       => esc_html__( 'Duration (s)', 'bricks-motion-studio' ),
					'type'        => 'number',
					'min'         => 0,
					'max'         => 60,
					'step'        => 0.05,
					'placeholder' => '0.6',
					'description' => esc_html__( 'Not used by scroll rows.', 'bricks-motion-studio' ),
				),
				'delay'        => array(
					'label'       => esc_html__( 'Delay (s)', 'bricks-motion-studio' ),
					'type'        => 'number',
					'min'         => 0,
					'max'         => 60,
					'step'        => 0.05,
					'placeholder' => '0',
				),
				'ease'         => array(
					'label'       => esc_html__( 'Easing', 'bricks-motion-studio' ),
					'type'        => 'select',
					'options'     => self::timeline_eases(),
					'placeholder' => esc_html__( 'Smooth', 'bricks-motion-studio' ),
				),
				'offset'       => array(
					'label'       => esc_html__( 'Start line (%)', 'bricks-motion-studio' ),
					'type'        => 'number',
					'min'         => 0,
					'max'         => 90,
					'placeholder' => '12',
					'description' => esc_html__( 'Scrolled-into-view rows: how far above the bottom of the screen the element must reach.', 'bricks-motion-studio' ),
				),
				'rangeStart'   => array(
					'label'       => esc_html__( 'Scroll range start', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => 'top bottom',
					'description' => esc_html__( 'Scroll rows: "<element edge> <screen line>" (top, center, bottom, 20% or 100px), e.g. top 15%. Default: the element\'s top reaches the bottom of the screen.', 'bricks-motion-studio' ),
				),
				'rangeEnd'     => array(
					'label'       => esc_html__( 'Scroll range end', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => 'bottom top',
				),
				'rangeStartEl' => array(
					'label'       => esc_html__( 'Measure start on', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => esc_html__( 'This element', 'bricks-motion-studio' ),
				),
				'rangeEndEl'   => array(
					'label'       => esc_html__( 'Measure end on', 'bricks-motion-studio' ),
					'type'        => 'text',
					'placeholder' => esc_html__( 'This element', 'bricks-motion-studio' ),
				),
				'bp'           => array(
					'label'       => esc_html__( 'Screen sizes', 'bricks-motion-studio' ),
					'type'        => 'select',
					'options'     => array(
						'desktop' => esc_html__( 'Desktop only (992px and up)', 'bricks-motion-studio' ),
						'tablet'  => esc_html__( 'Tablet and phone only (991px and below)', 'bricks-motion-studio' ),
					),
					'placeholder' => esc_html__( 'All', 'bricks-motion-studio' ),
				),
			),
		);

		// Three.js background (layout elements only).
		if ( Settings::library_enabled( 'three' ) && in_array( $name, self::LAYOUT_ELEMENTS, true ) ) {
			$c['bme3dSeparator'] = $g + array(
				'label' => esc_html__( '3D background (Three.js)', 'bricks-motion-studio' ),
				'type'  => 'separator',
			);

			$c['bme3d'] = $g + array(
				'label'       => esc_html__( 'Scene', 'bricks-motion-studio' ),
				'type'        => 'select',
				'options'     => self::scene_options( false ),
				'placeholder' => esc_html__( 'None', 'bricks-motion-studio' ),
				'inline'      => true,
			);

			$has_scene = array( 'bme3d', '!=', '' );

			foreach ( array( 'A', 'B', 'C' ) as $i => $letter ) {
				$c[ 'bme3dColor' . $letter ] = $g + array(
					/* translators: %d: color number */
					'label'    => sprintf( esc_html__( 'Color %d', 'bricks-motion-studio' ), $i + 1 ),
					'type'     => 'color',
					'inline'   => true,
					'required' => $has_scene,
				);
			}

			$c['bme3dDensity'] = $g + array(
				'label'       => esc_html__( 'Density', 'bricks-motion-studio' ),
				'type'        => 'number',
				'min'         => 0.1,
				'max'         => 3,
				'step'        => 0.1,
				'placeholder' => '1',
				'inline'      => true,
				'small'       => true,
				'required'    => array( 'bme3d', '=', array( 'particles', 'waves', 'orbs' ) ),
			);

			$c['bme3dSpeed'] = $g + array(
				'label'       => esc_html__( 'Speed', 'bricks-motion-studio' ),
				'type'        => 'number',
				'min'         => 0,
				'max'         => 5,
				'step'        => 0.1,
				'placeholder' => '1',
				'inline'      => true,
				'small'       => true,
				'required'    => $has_scene,
			);

			$c['bme3dOpacity'] = $g + array(
				'label'       => esc_html__( 'Opacity', 'bricks-motion-studio' ),
				'type'        => 'number',
				'min'         => 0,
				'max'         => 1,
				'step'        => 0.05,
				'placeholder' => '1',
				'inline'      => true,
				'small'       => true,
				'required'    => $has_scene,
			);

			$c['bme3dInteractive'] = $g + array(
				'label'    => esc_html__( 'React to pointer', 'bricks-motion-studio' ),
				'type'     => 'checkbox',
				'required' => $has_scene,
			);
		}

		return $c;
	}

	/**
	 * Scene options shared by the background control and the 3D Scene element.
	 *
	 * @param bool $with_model Include the GLB/GLTF model viewer.
	 * @return array
	 */
	public static function scene_options( $with_model = true ) {
		$scenes = array(
			'gradient'  => esc_html__( 'Liquid gradient (shader)', 'bricks-motion-studio' ),
			'particles' => esc_html__( 'Particle field', 'bricks-motion-studio' ),
			'waves'     => esc_html__( 'Wave grid', 'bricks-motion-studio' ),
			'orbs'      => esc_html__( 'Floating shapes', 'bricks-motion-studio' ),
		);
		if ( $with_model ) {
			$scenes['model'] = esc_html__( '3D model (GLB/GLTF)', 'bricks-motion-studio' );
		}
		return $scenes;
	}

	private function preset_slugs( $group ) {
		$out = array();
		foreach ( Presets::all() as $slug => $p ) {
			if ( ( $p['group'] ?? '' ) === $group ) {
				$out[] = $slug;
			}
		}
		return $out;
	}

	/* ---------------------------------------------------------------------
	 * Render
	 * ------------------------------------------------------------------ */

	public function push_area( $elements, $area ) {
		$this->areas[] = (string) $area;
	}

	public function pop_area( $elements, $area ) {
		array_pop( $this->areas );
	}

	private function in_area( $area ) {
		return in_array( $area, $this->areas, true );
	}

	/**
	 * True where no animation markup should be printed (builder canvas, builder API calls, admin, feeds).
	 *
	 * @return bool
	 */
	/**
	 * Motion Studio group in Bricks page settings (pages and templates).
	 *
	 * @param array $data { controls, controlGroups }.
	 * @return array
	 */
	public function page_controls( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		$data['controlGroups'] = isset( $data['controlGroups'] ) && is_array( $data['controlGroups'] ) ? $data['controlGroups'] : array();
		$data['controls']      = isset( $data['controls'] ) && is_array( $data['controls'] ) ? $data['controls'] : array();

		$data['controlGroups'][ self::GROUP ] = array(
			'title'      => esc_html__( 'Motion Studio', 'bricks-motion-studio' ),
			'fullAccess' => true,
		);

		$levels = array();
		foreach ( Levels::all() as $slug => $text ) {
			$levels[ $slug ] = $text[0];
		}

		$data['controls']['bmePageMode']  = array(
			'group'       => self::GROUP,
			'label'       => esc_html__( 'Animations', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => array(
				'custom' => esc_html__( 'Only elements set to Custom', 'bricks-motion-studio' ),
				'off'    => esc_html__( 'Disabled', 'bricks-motion-studio' ),
			),
			'placeholder' => esc_html__( 'Site settings', 'bricks-motion-studio' ),
			'description' => esc_html__( 'For pages and content templates. Header, footer and popup templates follow the setting of the page they appear on.', 'bricks-motion-studio' ),
		);
		$data['controls']['bmePageLevel'] = array(
			'group'       => self::GROUP,
			'label'       => esc_html__( 'Animation level', 'bricks-motion-studio' ),
			'type'        => 'select',
			'options'     => $levels,
			'placeholder' => esc_html__( 'Site level', 'bricks-motion-studio' ),
			'inline'      => true,
			'required'    => array( 'bmePageMode', '!=', array( 'custom', 'off' ) ),
			'description' => esc_html__( 'Overrides the site-wide level for element rules on this page. Class rules keep their exact preset.', 'bricks-motion-studio' ),
		);
		return $data;
	}

	/**
	 * A Motion Studio page setting of the page (or content template) being rendered.
	 *
	 * @param string $key Setting key.
	 * @return string
	 */
	public static function page_setting( $key ) {
		if ( ! class_exists( '\Bricks\Database' ) || ! is_array( \Bricks\Database::$page_settings ) ) {
			return '';
		}
		$page  = \Bricks\Database::$page_settings ? \Bricks\Database::$page_settings : self::$request_page_settings;
		$value = $page[ $key ] ?? '';
		return is_string( $value ) ? $value : '';
	}

	/** @var array Page settings for Bricks' REST renders (load more, filters, infinite scroll). */
	public static $request_page_settings = array();

	/**
	 * Bricks renders "Load more", AJAX pagination, filters and infinite scroll through its REST API,
	 * which never loads the page's settings: read them the way a page load does (the active
	 * content template's, else the post's), so "Animations" and "Animation level" apply there too.
	 *
	 * @param array $request_data Bricks request data (postId).
	 */
	public static function load_request_page_settings( $request_data ) {
		$post_id = is_array( $request_data ) && isset( $request_data['postId'] ) ? absint( $request_data['postId'] ) : 0;
		if ( ! $post_id || ! class_exists( '\Bricks\Database' ) || ! defined( 'BRICKS_DB_PAGE_SETTINGS' ) ) {
			return;
		}
		if ( empty( \Bricks\Database::$active_templates['content'] ) && method_exists( '\Bricks\Database', 'set_active_templates' ) ) {
			\Bricks\Database::set_active_templates( $post_id ); // REST requests never ran the `wp` action that sets them
		}
		$templates                   = \Bricks\Database::$active_templates;
		$source                      = is_array( $templates ) && ! empty( $templates['content'] ) ? (int) $templates['content'] : $post_id;
		$settings                    = get_post_meta( $source, BRICKS_DB_PAGE_SETTINGS, true );
		self::$request_page_settings = is_array( $settings ) ? $settings : array();
	}

	/** The Bricks builder (main window, canvas iframe, or its own render requests). */
	public static function in_builder() {
		$builder_request = wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST );
		return function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() || ( $builder_request && bricks_is_builder_call() ) );
	}

	/** @var bool Builder live preview: attributes are computed on request (Builder::ajax_preview). */
	public static $previewing = false;

	public static function is_passive_context() {
		// Page setting "Disabled": no Motion Studio output at all on this page (nor in its preview).
		if ( 'off' === self::page_setting( 'bmePageMode' ) ) {
			return true;
		}
		if ( self::$previewing ) {
			return false;
		}
		// Constant for the rest of a frontend request once WordPress parsed it: compute it once
		// instead of for every element and loop item.
		static $cached = null;
		if ( null !== $cached ) {
			return $cached;
		}
		$passive = self::compute_passive_context();
		if ( did_action( 'wp' ) ) {
			$cached = $passive;
		}
		return $passive;
	}

	private static function compute_passive_context() {
		if ( is_admin() && ! wp_doing_ajax() ) {
			return true;
		}
		// bricks_is_builder_call() is also true for any page whose Referer is the builder (e.g. "View
		// on frontend"), so only trust it for the builder's own AJAX / REST render requests.
		$builder_request = wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST );
		if ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() || ( $builder_request && bricks_is_builder_call() ) ) ) {
			return true;
		}
		if ( is_feed() || ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() && ! ( function_exists( 'bricks_is_rest_call' ) && bricks_is_rest_call() ) ) ) {
			return true;
		}
		// Debug switch: ?bme-disable=1 renders the page without any Motion Studio output.
		// Only for people who can edit (or on debug installs), and never cached.
		if ( isset( $_GET['bme-disable'] ) && ( ( defined( 'WP_DEBUG' ) && WP_DEBUG ) || ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			if ( ! headers_sent() ) {
				nocache_headers();
			}
			return true;
		}
		/**
		 * Force-disable all motion markup for the current request.
		 *
		 * @param bool $passive
		 */
		return (bool) apply_filters( 'bme/passive_context', false );
	}

	/**
	 * Adds data attributes to the element root.
	 *
	 * @param array  $attributes Root attributes.
	 * @param object $element    \Bricks\Element instance.
	 * @return array
	 */
	public function root_attributes( $attributes, $element ) {
		if ( ! is_array( $attributes ) || ! is_object( $element ) || self::is_passive_context() ) {
			return $attributes;
		}

		$settings = isset( $element->settings ) && is_array( $element->settings ) ? $element->settings : array();
		$name     = isset( $element->name ) ? (string) $element->name : '';
		$mode     = self::str( $settings, 'bmeMode' );

		$this->tracking = spl_object_id( $element );

		// Class shorthand (class="bme-fade-up") behaves like the data-bme attribute.
		if ( ! isset( $attributes['data-bme'] ) && ! empty( $attributes['class'] ) ) {
			foreach ( (array) $attributes['class'] as $class_list ) {
				foreach ( preg_split( '/\s+/', is_scalar( $class_list ) ? (string) $class_list : '' ) as $class ) {
					if ( 0 === strpos( $class, 'bme-' ) && Presets::exists( substr( $class, 4 ) ) ) {
						$attributes['data-bme'] = substr( $class, 4 );
						break 2;
					}
				}
			}
		}

		$tl_rows = 'off' !== $mode && ! empty( $settings['bmeTimeline'] ) ? self::timeline_rows( $settings['bmeTimeline'] ) : array();

		// Manual attributes (Bricks "Attributes" control) always win: just track usage.
		if ( isset( $attributes['data-bme'] ) && is_scalar( $attributes['data-bme'] ) ) {
			$preset = (string) $attributes['data-bme'];
			$engine = isset( $attributes['data-bme-engine'] ) && is_scalar( $attributes['data-bme-engine'] ) ? (string) $attributes['data-bme-engine'] : '';
			$res    = self::resolve( $preset, $engine );
			if ( $res ) {
				$this->track( 'preset', $res['preset'], $res['engine'] );
				if ( Presets::needs_hide( $res['preset'] ) && Settings::get( 'perf.fouc' ) ) {
					$attributes['data-bme-hide'] = '';
				}
			}
		} elseif ( 'off' === $mode ) {
			$attributes['data-bme-skip'] = '';
		} elseif ( 'custom' === $mode || ! self::timeline_on_self( $tl_rows ) ) {
			// An element with its own timeline is never also given a site-wide auto animation:
			// both would write the same transform / opacity every frame.
			$config = 'custom' === $mode ? $this->custom_config( $settings ) : $this->auto_config( $element, $name, $settings, $attributes );
			if ( $config ) {
				$attributes = $this->apply_config( $attributes, $config );
			}
		}

		// Screen sizes this element doesn't animate on (main animation, hover, timeline).
		$off_on = 'off' !== $mode ? self::off_on( $settings ) : array();
		if ( $off_on ) {
			$attributes['data-bme-off-on'] = implode( ' ', $off_on );
		}

		// Hover effect (independent of the main animation; engine-free CSS/JS).
		$hover = self::str( $settings, 'bmeHover' );
		if ( 'off' !== $mode && in_array( $hover, array( 'lift', 'grow', 'magnetic', 'tilt' ), true ) ) {
			$attributes['data-bme-hover'] = $hover;
			$this->track( 'feature', 'hover' ); // engine-free: loads the runtime only
		}

		// Timeline rows (their own lightweight script; no animation library).
		if ( $tl_rows ) {
			$attributes['data-bme-tl'] = wp_json_encode( $tl_rows );
			$this->track( 'feature', 'timeline' );
			// Starts invisible (no flash of the final state before the deferred script runs) when
			// the element itself fades in from its first keyframe. timeline.js removes the flag.
			if ( Settings::get( 'perf.fouc' ) && self::timeline_starts_hidden( $tl_rows ) ) {
				$attributes['data-bme-tl-hide'] = '';
			}
		}

		// Three.js background.
		$scene = self::str( $settings, 'bme3d' );
		if ( '' !== $scene && Settings::library_enabled( 'three' ) && in_array( $name, self::LAYOUT_ELEMENTS, true ) ) {
			if ( array_key_exists( $scene, self::scene_options( false ) ) ) {
				$attributes['data-bme-3d'] = wp_json_encode( self::scene_config( $settings, $scene, 'bme3d' ) );
				$attributes['class']       = isset( $attributes['class'] ) ? (array) $attributes['class'] : array();
				$attributes['class'][]     = 'bme-3d-host';
				$this->track( 'feature', 'three' );
			}
		}

		return $attributes;
	}

	/* ---------------------------------------------------------------------
	 * Usage tracking (libraries are enqueued only for elements that actually render)
	 * ------------------------------------------------------------------ */

	/** @var array<int,array> Pending usage per element instance. */
	private $pending = array();

	/** @var int Element instance whose root attributes are being built. */
	private $tracking = 0;

	private function track( $type, $a, $b = '' ) {
		$this->pending[ $this->tracking ][] = array( $type, $a, $b );
	}

	private static function apply_usage( array $items ) {
		foreach ( $items as $item ) {
			if ( 'preset' === $item[0] ) {
				Usage::preset( $item[1], $item[2] );
			} else {
				Usage::feature( $item[1] );
			}
		}
	}

	/**
	 * @param bool   $render  Whether Bricks renders the element (after conditions).
	 * @param object $element Element instance.
	 * @return bool
	 */
	public function commit_usage( $render, $element ) {
		$id = is_object( $element ) ? spl_object_id( $element ) : 0;
		if ( isset( $this->pending[ $id ] ) ) {
			if ( $render ) {
				self::apply_usage( $this->pending[ $id ] );
			}
			unset( $this->pending[ $id ] );
		}
		return $render;
	}

	/** Anything a custom render path never reported on is counted, so nothing is left without its library. */
	public function flush_usage() {
		foreach ( $this->pending as $items ) {
			self::apply_usage( $items );
		}
		$this->pending = array();
	}

	/**
	 * Scene config from element settings (shared with the 3D Scene element).
	 *
	 * @param array  $settings Element settings.
	 * @param string $scene    Scene slug.
	 * @param string $prefix   Setting key prefix.
	 * @return array
	 */
	public static function scene_config( array $settings, $scene, $prefix ) {
		$cfg = array( 'scene' => $scene );

		$colors = array();
		foreach ( array( 'A', 'B', 'C' ) as $letter ) {
			$color = self::color_value( $settings[ $prefix . 'Color' . $letter ] ?? null );
			if ( $color ) {
				$colors[] = $color;
			}
		}
		if ( $colors ) {
			$cfg['colors'] = $colors;
		}

		foreach ( array(
			'Density' => array( 'density', 0.1, 3 ),
			'Speed'   => array( 'speed', 0, 5 ),
			'Opacity' => array( 'opacity', 0, 1 ),
		) as $suffix => $def ) {
			$key = $prefix . $suffix;
			if ( isset( $settings[ $key ] ) && is_scalar( $settings[ $key ] ) && is_numeric( $settings[ $key ] ) ) {
				$cfg[ $def[0] ] = max( $def[1], min( $def[2], (float) $settings[ $key ] ) );
			}
		}

		if ( ! empty( $settings[ $prefix . 'Interactive' ] ) ) {
			$cfg['interactive'] = 1;
		}

		return $cfg;
	}

	/**
	 * Normalize a Bricks color control value to a CSS color string.
	 *
	 * @param mixed $value Color control value.
	 * @return string
	 */
	public static function color_value( $value ) {
		if ( is_string( $value ) ) {
			$value = array( 'raw' => $value );
		}
		if ( ! is_array( $value ) ) {
			return '';
		}
		foreach ( array( 'hex', 'rgb', 'hsl', 'raw' ) as $key ) {
			if ( ! empty( $value[ $key ] ) && is_string( $value[ $key ] ) ) {
				$color = trim( $value[ $key ] );
				if ( preg_match( '/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s\/deg]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]+)$/', $color ) ) {
					return $color;
				}
			}
		}
		return '';
	}

	/**
	 * Read a scalar setting as string ('' for arrays/objects/null) so malformed data never warns.
	 *
	 * @param array  $s   Settings.
	 * @param string $key Key.
	 * @return string
	 */
	/** Animatable timeline properties (keys match assets/js/timeline.js). */
	public static function timeline_props() {
		static $cache = null;
		if ( null !== $cache ) {
			return $cache;
		}
		return $cache = array( // phpcs:ignore Squiz.PHP.DisallowMultipleAssignments.Found
			'y'               => esc_html__( 'Move up / down (y)', 'bricks-motion-studio' ),
			'x'               => esc_html__( 'Move left / right (x)', 'bricks-motion-studio' ),
			'opacity'         => esc_html__( 'Opacity', 'bricks-motion-studio' ),
			'scale'           => esc_html__( 'Scale', 'bricks-motion-studio' ),
			'scaleX'          => esc_html__( 'Scale width (scaleX)', 'bricks-motion-studio' ),
			'scaleY'          => esc_html__( 'Scale height (scaleY)', 'bricks-motion-studio' ),
			'rotate'          => esc_html__( 'Rotate', 'bricks-motion-studio' ),
			'width'           => esc_html__( 'Width', 'bricks-motion-studio' ),
			'height'          => esc_html__( 'Height', 'bricks-motion-studio' ),
			'color'           => esc_html__( 'Text color', 'bricks-motion-studio' ),
			'backgroundColor' => esc_html__( 'Background color', 'bricks-motion-studio' ),
		);
	}

	public static function timeline_eases() {
		static $cache = null;
		if ( null !== $cache ) {
			return $cache;
		}
		return $cache = array( // phpcs:ignore Squiz.PHP.DisallowMultipleAssignments.Found
			'smooth' => esc_html__( 'Smooth', 'bricks-motion-studio' ),
			'linear' => esc_html__( 'Linear', 'bricks-motion-studio' ),
			'ease'   => esc_html__( 'Ease', 'bricks-motion-studio' ),
			'in'     => esc_html__( 'Ease in', 'bricks-motion-studio' ),
			'out'    => esc_html__( 'Ease out', 'bricks-motion-studio' ),
			'in-out' => esc_html__( 'Ease in-out', 'bricks-motion-studio' ),
			'soft'   => esc_html__( 'Soft', 'bricks-motion-studio' ),
			'strong' => esc_html__( 'Strong', 'bricks-motion-studio' ),
			'back'   => esc_html__( 'Back (overshoot)', 'bricks-motion-studio' ),
			'sine'   => esc_html__( 'Sine', 'bricks-motion-studio' ),
		) + self::curve_eases();
	}

	/** Exact classic curves (GSAP power1-4, expo, sine, circ, back), in / out / in-out. */
	private static function curve_eases() {
		$names = array(
			'quad'  => 'Quad (power1)',
			'cubic' => 'Cubic (power2)',
			'quart' => 'Quart (power3)',
			'quint' => 'Quint (power4)',
			'expo'  => 'Expo',
			'sine'  => 'Sine',
			'circ'  => 'Circ',
			'back'  => 'Back',
		);
		$out   = array();
		foreach ( array( 'out', 'in-out', 'in' ) as $dir ) {
			foreach ( $names as $key => $label ) {
				/* translators: 1: direction (Out, In-out, In), 2: curve name. */
				$out[ $dir . '-' . $key ] = sprintf( esc_html__( '%1$s: %2$s', 'bricks-motion-studio' ), 'out' === $dir ? esc_html__( 'Out', 'bricks-motion-studio' ) : ( 'in' === $dir ? esc_html__( 'In', 'bricks-motion-studio' ) : esc_html__( 'In-out', 'bricks-motion-studio' ) ), $label );
			}
		}
		return $out;
	}

	/**
	 * Builder repeater rows → the compact, validated rows timeline.js reads.
	 * Anything malformed is dropped row by row, never the whole timeline.
	 *
	 * @param mixed $input Saved repeater value.
	 * @return array
	 */
	public static function timeline_rows( $input ) {
		$out = array();
		if ( ! is_array( $input ) ) {
			return $out;
		}
		$props = self::timeline_props();
		$eases = self::timeline_eases();
		foreach ( array_slice( $input, 0, 100 ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$on   = isset( $row['on'] ) && is_string( $row['on'] ) && in_array( $row['on'], array( 'scroll', 'view', 'hover', 'leave', 'loop' ), true ) ? $row['on'] : 'scroll';
			$prop = isset( $row['prop'] ) && is_string( $row['prop'] ) && isset( $props[ $row['prop'] ] ) ? $row['prop'] : 'y';
			$keys = self::timeline_keys( isset( $row['keys'] ) && is_scalar( $row['keys'] ) ? (string) $row['keys'] : '', $prop );
			if ( ! $keys ) {
				continue;
			}
			$item   = array(
				'on' => $on,
				'p'  => $prop,
				'k'  => $keys,
			);
			$target = isset( $row['target'] ) && is_scalar( $row['target'] ) ? trim( wp_strip_all_tags( (string) $row['target'] ) ) : '';
			if ( '' !== $target ) {
				$item['s'] = self::loop_safe_selector( substr( $target, 0, 300 ) );
			}
			foreach ( array( 'duration' => 'd', 'delay' => 'dl' ) as $from => $to ) {
				if ( isset( $row[ $from ] ) && is_numeric( $row[ $from ] ) ) {
					$item[ $to ] = round( min( 60, max( 0, (float) $row[ $from ] ) ), 3 );
				}
			}
			if ( 'scroll' !== $on && ! isset( $item['d'] ) ) {
				$item['d'] = 0.6;
			}
			if ( isset( $row['ease'] ) && is_scalar( $row['ease'] ) ) {
				$ease = (string) $row['ease'];
				if ( ( is_string( $row['ease'] ) && isset( $eases[ $ease ] ) ) || preg_match( '/^cubic-bezier\(\s*-?(?:\d+\.?\d*|\.\d+)\s*,\s*-?(?:\d+\.?\d*|\.\d+)\s*,\s*-?(?:\d+\.?\d*|\.\d+)\s*,\s*-?(?:\d+\.?\d*|\.\d+)\s*\)$/', $ease ) ) {
					$item['e'] = $ease;
				}
			}
			if ( 'view' === $on ) {
				$item['o'] = isset( $row['offset'] ) && is_numeric( $row['offset'] ) ? (int) min( 90, max( 0, (float) $row['offset'] ) ) : 12;
			}
			if ( 'scroll' === $on ) {
				foreach ( array( 'rangeStart' => 'rs', 'rangeEnd' => 're' ) as $from => $to ) {
					$v = isset( $row[ $from ] ) && is_scalar( $row[ $from ] ) ? strtolower( trim( (string) $row[ $from ] ) ) : '';
					if ( preg_match( '/^(top|center|bottom|-?\d+(\.\d+)?(px|%))(\s+(top|center|bottom|-?\d+(\.\d+)?(px|%)))?$/', $v ) ) {
						$item[ $to ] = $v;
					}
				}
				foreach ( array( 'rangeStartEl' => 'rse', 'rangeEndEl' => 'ree' ) as $from => $to ) {
					$v = isset( $row[ $from ] ) && is_scalar( $row[ $from ] ) ? trim( wp_strip_all_tags( (string) $row[ $from ] ) ) : '';
					if ( '' !== $v ) {
						$item[ $to ] = self::loop_safe_selector( substr( $v, 0, 300 ) );
					}
				}
			}
			if ( isset( $row['bp'] ) && is_string( $row['bp'] ) && in_array( $row['bp'], array( 'desktop', 'tablet' ), true ) ) {
				$item['bp'] = $row['bp'];
			}
			$out[] = $item;
		}
		return $out;
	}

	/**
	 * "Turn off on" screen sizes; the earlier "Disable below 768px" checkbox counts as phone.
	 *
	 * @param array $settings Element settings.
	 * @return string[]
	 */
	public static function off_on( array $settings ) {
		$list = isset( $settings['bmeOffOn'] ) ? (array) $settings['bmeOffOn'] : array();
		// The old "Disable below 768px" box (Custom mode only, as it was) counts as Phone until the
		// new field is set; once it is, the new field alone decides.
		if ( ! isset( $settings['bmeOffOn'] ) && ! empty( $settings['bmeNoMobile'] ) && 'custom' === self::str( $settings, 'bmeMode' ) ) {
			$list[] = 'phone';
		}
		return array_values( array_unique( array_intersect( array( 'phone', 'tablet', 'desktop' ), array_filter( $list, 'is_string' ) ) ) );
	}

	/**
	 * Sticky or fixed at any breakpoint, on the element or through one of its global classes?
	 *
	 * @param array $settings Element settings.
	 * @return bool
	 */
	public static function positioned( array $settings ) {
		$sets = array( $settings );
		if ( ! empty( $settings['_cssGlobalClasses'] ) && is_array( $settings['_cssGlobalClasses'] ) ) {
			// id → settings, built once per request (sites can have thousands of global classes).
			static $by_id = null;
			if ( null === $by_id ) {
				$by_id = array();
				foreach ( self::global_classes() as $class ) {
					if ( is_array( $class ) && isset( $class['id'] ) && is_scalar( $class['id'] ) && ! empty( $class['settings'] ) && is_array( $class['settings'] ) ) {
						$by_id[ $class['id'] ] = $class['settings'];
					}
				}
			}
			foreach ( $settings['_cssGlobalClasses'] as $id ) {
				if ( is_scalar( $id ) && isset( $by_id[ $id ] ) ) {
					$sets[] = $by_id[ $id ];
				}
			}
		}
		foreach ( $sets as $set ) {
			foreach ( $set as $key => $value ) {
				if ( is_string( $key ) && ( '_position' === $key || 0 === strpos( $key, '_position:' ) ) && in_array( $value, array( 'fixed', 'sticky' ), true ) ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Bricks global classes as Bricks itself reads them (on multisite, possibly the main site's).
	 *
	 * @return array
	 */
	public static function global_classes() {
		$classes = class_exists( '\Bricks\Database' ) ? ( \Bricks\Database::$global_data['globalClasses'] ?? null ) : null;
		if ( ! is_array( $classes ) ) {
			$classes = get_option( 'bricks_global_classes', array() );
		}
		return is_array( $classes ) ? $classes : array();
	}

	/**
	 * Bricks element parallax (not just background parallax) on this element?
	 *
	 * @param array $attributes Root attributes.
	 * @return bool
	 */
	public static function element_parallax( array $attributes ) {
		if ( ! isset( $attributes['data-brx-motion-parallax'] ) ) {
			return false;
		}
		$data = is_string( $attributes['data-brx-motion-parallax'] ) ? json_decode( $attributes['data-brx-motion-parallax'], true ) : null;
		return ! is_array( $data ) || ! empty( $data['element'] ); // unreadable: assume it moves the element
	}

	/**
	 * Does any row animate the element itself (no target selector)?
	 *
	 * @param array $rows Validated rows.
	 * @return bool
	 */
	public static function timeline_on_self( array $rows ) {
		foreach ( $rows as $row ) {
			if ( empty( $row['s'] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Does a row fade the element itself in from below full opacity (view, hover-free rows and
	 * scroll rows start from their first keyframe)?
	 *
	 * @param array $rows Validated rows.
	 * @return bool
	 */
	public static function timeline_starts_hidden( array $rows ) {
		foreach ( $rows as $row ) {
			if ( 'opacity' !== $row['p'] || ! empty( $row['s'] ) || ! in_array( $row['on'], array( 'view', 'scroll', 'loop' ), true ) || ! empty( $row['bp'] ) ) {
				continue;
			}
			$first = $row['k'][0];
			foreach ( $row['k'] as $key ) {
				if ( $key[0] < $first[0] ) {
					$first = $key;
				}
			}
			if ( is_numeric( rtrim( $first[1], '%' ) ) && (float) $first[1] / ( '%' === substr( $first[1], -1 ) ? 100 : 1 ) < 0.5 ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Inside query loops and components Bricks drops the id="brxe-…" attribute and puts the
	 * class .brxe-… there instead: "#brxe-abc123" must match both.
	 *
	 * @param string $selector Selector typed in the builder.
	 * @return string
	 */
	public static function loop_safe_selector( $selector ) {
		return preg_replace_callback(
			'/("[^"]*"|\'[^\']*\'|\[[^\]]*\])|#(brxe-[a-z0-9]+)(?![\w-])/i',
			static function ( $m ) {
				// Quoted strings and [attribute] parts (a[href="#brxe-…"]) are left exactly as written.
				return '' !== $m[1] ? $m[1] : ':is(#' . $m[2] . ',.' . $m[2] . ')';
			},
			$selector
		);
	}

	/**
	 * "0: 100%, 50: -4%, 100: rgba(0,0,0,.5)" → [[0,"100%"],[50,"-4%"],[100,"rgba(0,0,0,.5)"]].
	 * Only values that suit the property are accepted (lengths for x / width, angles for rotate,
	 * plain numbers for scale / opacity, colours for colours), so nothing else reaches the page.
	 * One bad pair drops the whole row: a row silently missing a keyframe animates wrongly.
	 *
	 * @param string $text Keyframe text.
	 * @param string $prop Property the row animates ('' = accept any valid value).
	 * @return array
	 */
	public static function timeline_keys( $text, $prop = '' ) {
		$keys   = array();
		$number = '-?(?:\d+\.?\d*|\.\d+)';
		$length = $number . '(?:px|%|vw|vh|vmin|vmax|svh|dvh|lvh|svw|dvw|lvw|em|rem)?';
		$colour = 'transparent|currentcolor|(?!overflow\b)[a-z]{3,20}|#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|var\(--[A-Za-z0-9_-]+\)'
			. '|rgba?\((?:\d+(?:\.\d+)?%?)(?:[, ]\d+(?:\.\d+)?%?){2}(?:[,\/](?:\d*\.?\d+%?))?\)'
			. '|hsla?\(' . $number . '(?:deg|turn)?(?:[, ]\d+(?:\.\d+)?%?){2}(?:[,\/](?:\d*\.?\d+%?))?\)';
		switch ( $prop ) {
			case 'x':
			case 'y':
			case 'width':
			case 'height':
				$allowed = 'auto|-?overflow|' . $length;
				break;
			case 'rotate':
				$allowed = 'auto|' . $number . '(?:deg|turn)?';
				break;
			case 'opacity':
			case 'scale':
			case 'scaleX':
			case 'scaleY':
				$allowed = 'auto|' . $number . '%?';
				break;
			case 'color':
			case 'backgroundColor':
				$allowed = 'auto|' . $colour;
				break;
			default:
				$allowed = 'auto|-?overflow|' . $colour . '|' . $number . '(?:px|%|vw|vh|vmin|vmax|svh|dvh|lvh|svw|dvw|lvw|em|rem|deg|turn)?';
		}
		// Pairs are separated by commas outside parentheses (rgba() has its own commas).
		foreach ( array_slice( preg_split( '/,(?![^()]*\))/', (string) $text ), 0, 50 ) as $pair ) {
			if ( '' === trim( $pair ) ) {
				continue; // a trailing comma
			}
			// "50: 1" and "50%: 1" are the same keyframe.
			if ( ! preg_match( '/^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*%?\s*:\s*(.+?)\s*$/s', $pair, $m ) ) {
				return array();
			}
			// Lower case, except custom property names (var(--Brand) and var(--brand) differ).
			$value = preg_replace_callback(
				'/var\(\s*--[A-Za-z0-9_-]+\s*\)|[^v]+|v/',
				static function ( $part ) {
					return 0 === strpos( $part[0], 'var(' ) ? preg_replace( '/\s+/', '', $part[0] ) : strtolower( $part[0] );
				},
				preg_replace( '/\s+/', ' ', $m[2] )
			);
			$value = preg_replace( '/\s*([,\/()])\s*/', '$1', $value );        // rgba( 0, 0 / .5 ) → rgba(0,0/.5)
			$value = preg_replace( '/^(-?\d*\.?\d+) ([a-z%]+)$/', '$1$2', $value ); // "10 px" → "10px"
			// The whole value must match, or the row is dropped (never half-parsed).
			if ( ! preg_match( '/^(?:' . $allowed . ')$/', $value ) || in_array( $value, array( 'none', 'inherit', 'initial', 'unset', 'revert' ), true ) ) {
				return array();
			}
			$keys[] = array( round( min( 100, max( 0, (float) $m[1] ) ), 3 ), $value );
		}
		return $keys;
	}

	private static function str( array $s, $key ) {
		return isset( $s[ $key ] ) && is_scalar( $s[ $key ] ) ? trim( (string) $s[ $key ] ) : '';
	}

	/**
	 * Config from per-element "Custom" settings.
	 *
	 * @param array $s Element settings.
	 * @return array|null
	 */
	private function custom_config( array $s ) {
		$preset = self::str( $s, 'bmePreset' );
		if ( ! Presets::exists( $preset ) ) {
			return null;
		}

		$opts = array();

		$scope = self::str( $s, 'bmeScope' );
		if ( 'children' === $scope ) {
			$opts['scope'] = 'children';
		} elseif ( 'selector' === $scope && '' !== self::str( $s, 'bmeScopeSelector' ) ) {
			$selector = Settings::sanitize_selector_list( self::str( $s, 'bmeScopeSelector' ) );
			if ( $selector ) {
				$opts['scope'] = $selector;
			}
		}

		$trigger = self::str( $s, 'bmeTrigger' );
		if ( 'load' === $trigger || 'manual' === $trigger ) {
			$opts['trigger'] = $trigger;
		}

		foreach ( array(
			'bmeDuration' => array( 'duration', 0, 20 ),
			'bmeDelay'    => array( 'delay', 0, 20 ),
			'bmeStagger'  => array( 'stagger', 0, 2 ),
			'bmeDistance' => array( 'distance', 0, 400 ),
			'bmeOffset'   => array( 'offset', 0, 50 ),
			'bmeSpeed'    => array( 'speed', -2, 2 ),
		) as $key => $def ) {
			if ( isset( $s[ $key ] ) && is_scalar( $s[ $key ] ) && is_numeric( $s[ $key ] ) ) {
				$opts[ $def[0] ] = max( $def[1], min( $def[2], (float) $s[ $key ] ) );
			}
		}

		$ease = self::str( $s, 'bmeEase' );
		if ( '' !== $ease && array_key_exists( $ease, Settings::eases() ) ) {
			$opts['ease'] = $ease;
		}
		if ( ! empty( $s['bmeReplay'] ) ) {
			$opts['replay'] = 1;
		}

		return array(
			'preset' => $preset,
			'engine' => self::str( $s, 'bmeEngine' ),
			'opts'   => $opts,
		);
	}

	/**
	 * Config from the site-wide auto-animate rules.
	 *
	 * @param object $element    Element instance.
	 * @param string $name       Element name.
	 * @param array  $settings   Element settings.
	 * @param array  $attributes Root attributes built so far.
	 * @return array|null
	 */
	private function auto_config( $element, $name, array $settings, array $attributes ) {
		if ( ! Settings::get( 'auto.enabled' ) || in_array( $name, self::NEVER_AUTO, true ) || 'custom' === self::page_setting( 'bmePageMode' ) ) {
			return null;
		}

		if ( ( Settings::get( 'auto.skip_header' ) && $this->in_area( 'header' ) )
			|| ( Settings::get( 'auto.skip_footer' ) && $this->in_area( 'footer' ) )
			|| ( Settings::get( 'auto.skip_popups' ) && $this->in_area( 'popup' ) ) ) {
			return null;
		}

		// Bricks' own entrance animation (Interactions → Start animation) that animates this element
		// itself: don't double-animate. Animations aimed at other elements are handled in the browser.
		if ( Settings::get( 'auto.skip_interactions' ) && self::animates_itself( $attributes ) ) {
			return null;
		}

		// Sticky / fixed elements (any breakpoint, custom ones included, set on the element or through
		// one of its global classes): transforms would break positioning.
		if ( self::positioned( $settings ) ) {
			return null;
		}

		// Bricks' own element parallax (2.3+) moves this element with `translate`: leave it to Bricks.
		// Background parallax only moves the background, so the element can still animate.
		if ( self::element_parallax( $attributes ) ) {
			return null;
		}

		$rule = $this->match_rule( $name, $settings, $attributes );
		if ( ! $rule ) {
			return null;
		}

		// Animation level: the element's own choice, else the site-wide / page level.
		// - CSS-class rules are a deliberate per-design choice: they keep their exact preset and
		//   timing unless the element itself picks a level.
		// - The catch-all rule only gets the level's scaling in Advanced (no blur on dozens of
		//   generic elements).
		$level = self::str( $settings, 'bmeLevel' );
		if ( ! Levels::valid( $level ) ) {
			$level = 'class' === ( $rule['type'] ?? '' ) ? 'moderate' : Levels::site();
		}
		$preset = (string) $rule['preset'];
		if ( 'advanced' !== $level || '*' !== ( $rule['target'] ?? '' ) ) {
			$preset = Levels::preset( $preset, $level );
		}
		if ( null === $preset ) {
			return null;
		}

		$opts  = array( 'auto' => 1 );
		$scope = isset( $rule['scope'] ) && is_string( $rule['scope'] ) ? $rule['scope'] : 'self';
		// Masonry / filtered (Isotope) grids position their items with transforms: animate the grid
		// as a whole. Posts and Image Gallery add their Isotope classes later in render(), so the
		// settings that switch Isotope on are checked too.
		$isotope = $this->has_class( $attributes, 'bricks-masonry' )
			|| ( in_array( $name, array( 'posts', 'image-gallery' ), true ) && ( 'masonry' === self::str( $settings, 'layout' ) || ( 'posts' === $name && ! empty( $settings['filter'] ) ) ) );
		if ( 'self' !== $scope && $isotope ) {
			$scope = 'self';
		}
		if ( 'self' !== $scope ) {
			$opts['scope'] = $scope;
		}
		if ( 'moderate' !== $level ) {
			$opts['level'] = $level;
		}

		return array(
			'preset' => $preset,
			'engine' => isset( $rule['engine'] ) && is_string( $rule['engine'] ) ? $rule['engine'] : '',
			'opts'   => $opts,
		);
	}

	/**
	 * First matching enabled rule: CSS-class rules win over element-type rules.
	 *
	 * @param string $name       Element name.
	 * @param array  $settings   Element settings.
	 * @param array  $attributes Root attributes.
	 * @return array|null
	 */
	/** @var array|null Enabled rules indexed once per request: class rules (ordered), element rules by name, catch-all. */
	private $rule_index = null;

	private function rule_index() {
		if ( null === $this->rule_index ) {
			$index = array(
				'class'    => array(),
				'element'  => array(),
				'wildcard' => null,
			);
			foreach ( (array) Settings::get( 'auto.rules', array() ) as $rule ) {
				if ( ! is_array( $rule ) || empty( $rule['enabled'] ) || ! isset( $rule['target'], $rule['preset'] ) || ! is_string( $rule['target'] ) || ! is_string( $rule['preset'] ) ) {
					continue;
				}
				$type = $rule['type'] ?? 'element';
				if ( 'class' === $type ) {
					$index['class'][] = $rule;
				} elseif ( 'element' === $type ) {
					if ( '*' === $rule['target'] ) {
						$index['wildcard'] = $index['wildcard'] ? $index['wildcard'] : $rule;
					} elseif ( ! isset( $index['element'][ $rule['target'] ] ) ) {
						$index['element'][ $rule['target'] ] = $rule; // first matching rule wins
					}
				}
			}
			$this->rule_index = $index;
		}
		return $this->rule_index;
	}

	private function match_rule( $name, array $settings, array $attributes ) {
		$index = $this->rule_index();

		if ( $index['class'] ) {
			$classes = $this->element_classes( $settings, $attributes );
			if ( $classes ) {
				foreach ( $index['class'] as $rule ) {
					if ( in_array( $rule['target'], $classes, true ) ) {
						return $rule;
					}
				}
			}
		}

		if ( isset( $index['element'][ $name ] ) ) {
			return $index['element'][ $name ];
		}

		// "Any other element": content elements only. Wrappers and nestable containers are
		// skipped so their children (which have their own rules) never animate twice.
		if ( $index['wildcard'] && ! in_array( $name, self::LAYOUT_ELEMENTS, true ) && ! $this->is_nestable( $name ) ) {
			return $index['wildcard'];
		}

		return null;
	}

	/**
	 * Whether a "Start animation" interaction on this element targets the element itself.
	 *
	 * @param array $attributes Root attributes (Bricks adds data-interactions at priority 10).
	 * @return bool
	 */
	private static function animates_itself( array $attributes ) {
		if ( empty( $attributes['data-interactions'] ) || ! is_scalar( $attributes['data-interactions'] ) ) {
			return false;
		}
		$raw = (string) $attributes['data-interactions'];
		if ( false === strpos( $raw, 'startAnimation' ) ) {
			return false;
		}
		// Bricks stores the attribute HTML-escaped (&quot;…): decode before reading it.
		$list = json_decode( htmlspecialchars_decode( $raw, ENT_QUOTES ), true );
		if ( ! is_array( $list ) ) {
			$list = json_decode( $raw, true );
		}
		if ( ! is_array( $list ) ) {
			return true; // Unreadable: stay on the safe side.
		}
		foreach ( $list as $item ) {
			// Like Bricks: target "self" (or none) ignores a selector left over from "CSS selector".
			if ( is_array( $item ) && 'startAnimation' === ( $item['action'] ?? '' ) && in_array( $item['target'] ?? 'self', array( '', 'self' ), true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array  $attributes Root attributes.
	 * @param string $class      Class name.
	 * @return bool
	 */
	private function has_class( array $attributes, $class ) {
		foreach ( (array) ( $attributes['class'] ?? array() ) as $list ) {
			if ( is_scalar( $list ) && in_array( $class, preg_split( '/\s+/', (string) $list ), true ) ) {
				return true;
			}
		}
		return false;
	}

	/** @var array<string,bool> */
	private $nestable = array();

	/**
	 * Whether an element type can hold child elements (accordion-nested, tabs-nested, dropdown…).
	 *
	 * @param string $name Element name.
	 * @return bool
	 */
	private function is_nestable( $name ) {
		if ( ! isset( $this->nestable[ $name ] ) ) {
			$nestable = false;
			if ( class_exists( '\Bricks\Elements' ) && isset( \Bricks\Elements::$elements[ $name ] ) ) {
				$el = \Bricks\Elements::$elements[ $name ];
				if ( isset( $el['nestable'] ) ) {
					$nestable = (bool) $el['nestable'];
				} elseif ( ! empty( $el['class'] ) && class_exists( $el['class'] ) ) {
					$props    = get_class_vars( $el['class'] );
					$nestable = ! empty( $props['nestable'] );
				}
			}
			$this->nestable[ $name ] = $nestable;
		}
		return $this->nestable[ $name ];
	}

	/**
	 * Every class name on the element: root classes + global class names.
	 *
	 * @param array $settings   Element settings.
	 * @param array $attributes Root attributes.
	 * @return string[]
	 */
	private function element_classes( array $settings, array $attributes ) {
		$classes = array();

		if ( ! empty( $attributes['class'] ) ) {
			foreach ( (array) $attributes['class'] as $class ) {
				if ( is_scalar( $class ) ) {
					$classes = array_merge( $classes, preg_split( '/\s+/', (string) $class ) );
				}
			}
		}

		if ( ! empty( $settings['_cssGlobalClasses'] ) && is_array( $settings['_cssGlobalClasses'] ) ) {
			if ( null === $this->class_names ) {
				$this->class_names = array();
				foreach ( self::global_classes() as $global_class ) {
					if ( is_array( $global_class ) && isset( $global_class['id'], $global_class['name'] ) && is_scalar( $global_class['id'] ) && is_string( $global_class['name'] ) ) {
						$this->class_names[ $global_class['id'] ] = $global_class['name'];
					}
				}
			}
			foreach ( $settings['_cssGlobalClasses'] as $id ) {
				if ( is_scalar( $id ) && isset( $this->class_names[ $id ] ) ) {
					$classes[] = $this->class_names[ $id ];
				}
			}
		}

		return array_values( array_filter( array_unique( $classes ) ) );
	}

	/**
	 * Resolve which engine runs a preset (falls back to other enabled engines, then to the
	 * preset's fallback). Returns null when nothing enabled can run it.
	 *
	 * @param string $preset    Preset slug.
	 * @param string $preferred Preferred engine.
	 * @param int    $depth     Recursion guard.
	 * @return array|null { preset, engine }
	 */
	public static function resolve( $preset, $preferred = '', $depth = 0 ) {
		$p = Presets::get( $preset );
		if ( ! $p || $depth > 2 ) {
			return null;
		}

		$enabled = Settings::enabled_tween_engines();

		if ( ! empty( $p['core'] ) ) {
			return array(
				'preset' => $preset,
				'engine' => '',
			);
		}

		// Lightweight mode: effects the built-in engine renders identically need no library at all.
		// An engine picked explicitly (element or rule) is always respected.
		if ( ( 'native' === $preferred || ( '' === $preferred && Settings::get( 'perf.native' ) ) ) && Presets::native_ok( $preset ) ) {
			return array(
				'preset' => $preset,
				'engine' => 'native',
			);
		}

		// SVG drawing: GSAP's DrawSVG when GSAP is on, otherwise the runtime's own tween (loading
		// Anime.js or Motion would add nothing).
		if ( ! empty( $p['draw'] ) ) {
			return array(
				'preset' => $preset,
				'engine' => in_array( 'gsap', $enabled, true ) && in_array( $preferred, array( '', 'gsap' ), true ) ? 'gsap' : 'native',
			);
		}

		$supported = Presets::engines_for( $preset );
		$preferred = 'native' === $preferred ? '' : $preferred; // Built-in cannot run it: use the libraries.
		$order     = array_values( array_unique( array_filter( array_merge( array( $preferred, Settings::default_engine() ), $enabled ) ) ) );

		foreach ( $order as $engine ) {
			if ( in_array( $engine, $enabled, true ) && in_array( $engine, $supported, true ) ) {
				return array(
					'preset' => $preset,
					'engine' => $engine,
				);
			}
		}

		if ( ! empty( $p['fallback'] ) ) {
			return self::resolve( $p['fallback'], $preferred, $depth + 1 );
		}

		return null;
	}

	/**
	 * Print the resolved config as data attributes and record usage.
	 *
	 * @param array $attributes Root attributes.
	 * @param array $config     { preset, engine, opts }.
	 * @return array
	 */
	private function apply_config( array $attributes, array $config ) {
		$res = self::resolve( $config['preset'], $config['engine'] );
		if ( ! $res ) {
			return $attributes;
		}

		$attributes['data-bme'] = $res['preset'];
		if ( $res['engine'] ) {
			$attributes['data-bme-engine'] = $res['engine'];
		}
		if ( ! empty( $config['opts'] ) ) {
			$attributes['data-bme-opts'] = wp_json_encode( $config['opts'] );
		}
		if ( Settings::get( 'perf.fouc' ) && Presets::needs_hide( $res['preset'] ) ) {
			$attributes['data-bme-hide'] = '';
		}

		$this->track( 'preset', $res['preset'], $res['engine'] );

		return $attributes;
	}
}
