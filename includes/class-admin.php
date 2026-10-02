<?php
/**
 * Admin settings screen (dashboard → Motion Studio).
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Admin {

	const SLUG  = 'bricks-motion-studio';
	const GROUP = 'bme_settings_group';

	/** Brand mark: a motion wave with a leading dot. */
	const WAVE_PATH = 'M2 14c3-8 6-8 8-4s5 4 8-4v3c-3 7-6 7-8 3s-5-4-8 4z';

	/** @var string */
	private $hook = '';

	public function __construct() {
		add_action( 'admin_init', array( $this, 'register_setting' ) );
		add_action( 'admin_menu', array( $this, 'redirect_old_slug' ), 1 ); // before WordPress rejects the unknown page
		add_action( 'admin_menu', array( $this, 'menu' ), 99 );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) );
		add_action( 'admin_post_bme_import', array( $this, 'handle_import' ) );
		add_action( 'admin_post_bme_reset', array( $this, 'handle_reset' ) );
		add_action( 'admin_notices', array( $this, 'notices' ) );
	}

	/** Bookmarks from before the rename (Bricks Motion Engine) still open the settings screen. */
	public function redirect_old_slug() {
		if ( isset( $_GET['page'] ) && 'bricks-motion-engine' === $_GET['page'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			wp_safe_redirect( self::page_url() );
			exit;
		}
	}

	public static function page_url() {
		return admin_url( 'admin.php?page=' . self::SLUG );
	}

	public function register_setting() {
		register_setting(
			self::GROUP,
			BME_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( Settings::class, 'sanitize' ),
				'default'           => Settings::defaults(),
				'show_in_rest'      => false,
			)
		);
	}

	public function menu() {
		$title = __( 'Motion Studio', 'bricks-motion-studio' );
		// Own top-level item (right below Bricks) so it is visible in the dashboard sidebar.
		// The Motion Studio wave mark (same shape as the settings header). Filled, so WordPress can tint it.
		$icon       = 'data:image/svg+xml;base64,' . base64_encode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="black" d="' . self::WAVE_PATH . '"/><circle fill="black" cx="4" cy="5" r="2"/></svg>' );
		$this->hook = (string) add_menu_page( $title, $title, 'manage_options', self::SLUG, array( $this, 'render' ), $icon, 3 );
	}

	public function assets( $hook ) {
		if ( $hook !== $this->hook ) {
			return;
		}
		$ver = static function ( $file ) {
			$mtime = @filemtime( BME_PATH . $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			return BME_VERSION . ( $mtime ? '.' . $mtime : '' );
		};
		wp_enqueue_style( 'bme-admin', BME_URL . 'assets/css/admin.css', array(), $ver( 'assets/css/admin.css' ) );
		wp_enqueue_script( 'bme-admin', BME_URL . 'assets/js/admin.js', array(), $ver( 'assets/js/admin.js' ), true );
		wp_add_inline_script(
			'bme-admin',
			'window.BME_ADMIN=' . wp_json_encode(
				array(
					'presets' => Presets::all(),
					'i18n'    => array(
						'unsaved' => __( 'Unsaved changes', 'bricks-motion-studio' ),
						'saved'   => __( 'All changes saved', 'bricks-motion-studio' ),
						'copied'  => __( 'Copied', 'bricks-motion-studio' ),
						'ctrlS'   => _x( 'Ctrl S', 'keyboard shortcut', 'bricks-motion-studio' ),
						'leave'   => __( 'You have unsaved changes.', 'bricks-motion-studio' ),
						'libOff'  => __( '(library off)', 'bricks-motion-studio' ),
						'sample'  => __( 'Hello there', 'bricks-motion-studio' ),
						/* translators: %s: a number, e.g. 1,250 */
						'counter' => __( '%s+ launches', 'bricks-motion-studio' ),
						'noLibs'  => __( 'No libraries', 'bricks-motion-studio' ),
						/* translators: 1: number of rules, 2: animation level name */
						'autoOn1' => __( 'auto-animate on, %1$s rule, %2$s level', 'bricks-motion-studio' ),
						/* translators: 1: number of rules, 2: animation level name */
						'autoOnN' => __( 'auto-animate on, %1$s rules, %2$s level', 'bricks-motion-studio' ),
						'autoOff' => __( 'auto-animate off', 'bricks-motion-studio' ),
						'levels'  => array_map(
							static function ( $t ) {
								return $t[0];
							},
							Levels::all()
						),
					),
				)
			) . ';',
			'before'
		);
	}

	public function notices() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( ! Plugin::bricks_active() ) {
			echo '<div class="notice notice-warning"><p>' . esc_html__( 'Bricks Motion Studio needs the Bricks Builder theme (or a Bricks child theme) to be active.', 'bricks-motion-studio' ) . '</p></div>';
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		// options.php redirects back with settings-updated=true; top-level pages don't get the core notice.
		if ( $screen && $screen->id === $this->hook && ! empty( $_GET['settings-updated'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'bricks-motion-studio' ) . '</p></div>';
		}
		if ( $screen && $screen->id === $this->hook && isset( $_GET['bme_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$code = sanitize_key( wp_unslash( $_GET['bme_notice'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$map  = array(
				'imported'      => array( 'success', __( 'Settings imported.', 'bricks-motion-studio' ) ),
				'import_failed' => array( 'error', __( 'Import failed: paste a valid Motion Studio JSON export.', 'bricks-motion-studio' ) ),
				'reset'         => array( 'success', __( 'Settings reset to defaults.', 'bricks-motion-studio' ) ),
			);
			if ( isset( $map[ $code ] ) ) {
				printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $map[ $code ][0] ), esc_html( $map[ $code ][1] ) );
			}
		}
	}

	/* ---------------------------------------------------------------------
	 * Tools handlers
	 * ------------------------------------------------------------------ */

	public function handle_import() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'bricks-motion-studio' ) );
		}
		check_admin_referer( 'bme_import' );

		$raw  = isset( $_POST['bme_import'] ) ? wp_unslash( $_POST['bme_import'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON, sanitized by Settings::sanitize().
		$data = json_decode( (string) $raw, true );

		if ( ! is_array( $data ) ) {
			wp_safe_redirect( add_query_arg( 'bme_notice', 'import_failed', self::page_url() ) . '#system' ); // back to where Import / Reset live
			exit;
		}

		// A partial or older export only changes the keys it contains: merge it over the current
		// settings, so a missing checkbox is not read as "off". The rule list is replaced as a whole.
		$merged = array_replace_recursive( Settings::all(), $data );
		if ( isset( $data['auto'] ) && is_array( $data['auto'] ) && array_key_exists( 'rules', $data['auto'] ) ) {
			$merged['auto']['rules'] = is_array( $data['auto']['rules'] ) ? $data['auto']['rules'] : array();
		}

		update_option( BME_OPTION, Settings::sanitize( wp_slash( $merged ) ) );
		Settings::flush();
		wp_safe_redirect( add_query_arg( 'bme_notice', 'imported', self::page_url() ) . '#system' ); // back to where Import / Reset live
		exit;
	}

	public function handle_reset() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'bricks-motion-studio' ) );
		}
		check_admin_referer( 'bme_reset' );
		update_option( BME_OPTION, Settings::defaults() );
		Settings::flush();
		wp_safe_redirect( add_query_arg( 'bme_notice', 'reset', self::page_url() ) . '#system' ); // back to where Import / Reset live
		exit;
	}

	/* ---------------------------------------------------------------------
	 * Render helpers
	 * ------------------------------------------------------------------ */

	/**
	 * Engines that can run a preset, with their real names (for the Reference cards).
	 *
	 * @param string $slug Preset slug.
	 * @param array  $p    Preset.
	 * @return string
	 */
	private static function engine_list( $slug, array $p ) {
		$names = array(
			'gsap'   => 'GSAP',
			'anime'  => 'Anime.js',
			'motion' => 'Motion',
		);
		$list  = array();
		if ( ! empty( $p['core'] ) || Presets::native_ok( $slug ) ) {
			$list[] = __( 'Built-in', 'bricks-motion-studio' );
		}
		if ( empty( $p['core'] ) ) {
			foreach ( Presets::engines_for( $slug ) as $engine ) {
				$list[] = $names[ $engine ] ?? $engine;
			}
		}
		/* translators: separator between engine names */
		return implode( _x( ', ', 'list separator', 'bricks-motion-studio' ), $list );
	}

	/** @var array|null */
	private static $icons = null;

	/**
	 * Tabler icon (MIT, includes/data/icons.json). Trusted local markup.
	 *
	 * @param string $name Icon key.
	 * @return string
	 */
	private static function icon( $name ) {
		if ( null === self::$icons ) {
			$json        = file_get_contents( BME_PATH . 'includes/data/icons.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			self::$icons = json_decode( (string) $json, true );
			self::$icons = is_array( self::$icons ) ? self::$icons : array();
		}
		return self::$icons[ $name ] ?? '';
	}

	private function name( $path ) {
		$out = BME_OPTION;
		foreach ( explode( '.', $path ) as $part ) {
			$out .= '[' . $part . ']';
		}
		return $out;
	}

	private function id( $path ) {
		return 'bme-' . str_replace( '.', '-', $path );
	}

	/** Setting row: label + help on the left, switch on the right. */
	private function switch_row( $path, $label, $help = '' ) {
		$id = $this->id( $path );
		?>
		<div class="bme-row">
			<div class="bme-row__text">
				<label class="bme-row__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<?php if ( $help ) : ?><p class="bme-row__help"><?php echo esc_html( $help ); ?></p><?php endif; ?>
			</div>
			<div class="bme-row__control">
				<?php $this->switch_input( $path, $label ); ?>
			</div>
		</div>
		<?php
	}

	private function switch_input( $path, $label ) {
		$id = $this->id( $path );
		?>
		<span class="bme-switch">
			<input type="hidden" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="0">
			<input type="checkbox" role="switch" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="1" <?php checked( ! empty( Settings::get( $path ) ) ); ?> data-bme-bind="<?php echo esc_attr( $path ); ?>">
			<span class="bme-switch__track" aria-hidden="true"></span>
		</span>
		<?php
	}

	private function number_row( $path, $label, $min, $max, $step, $unit = '', $help = '' ) {
		$id = $this->id( $path );
		?>
		<div class="bme-row">
			<div class="bme-row__text">
				<label class="bme-row__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<?php if ( $help ) : ?><p class="bme-row__help"><?php echo esc_html( $help ); ?></p><?php endif; ?>
			</div>
			<div class="bme-row__control">
				<span class="bme-input">
					<input type="number" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( (string) Settings::get( $path ) ); ?>" min="<?php echo esc_attr( (string) $min ); ?>" max="<?php echo esc_attr( (string) $max ); ?>" step="<?php echo esc_attr( (string) $step ); ?>" data-bme-bind="<?php echo esc_attr( $path ); ?>">
					<?php if ( $unit ) : ?><span class="bme-input__unit"><?php echo esc_html( $unit ); ?></span><?php endif; ?>
				</span>
			</div>
		</div>
		<?php
	}

	private function select_row( $path, $label, array $options, $help = '' ) {
		$id      = $this->id( $path );
		$current = (string) Settings::get( $path );
		?>
		<div class="bme-row">
			<div class="bme-row__text">
				<label class="bme-row__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<?php if ( $help ) : ?><p class="bme-row__help"><?php echo esc_html( $help ); ?></p><?php endif; ?>
			</div>
			<div class="bme-row__control">
				<select class="bme-select" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" data-bme-bind="<?php echo esc_attr( $path ); ?>">
					<?php foreach ( $options as $value => $text ) : ?>
						<option value="<?php echo esc_attr( (string) $value ); ?>" <?php selected( $current, (string) $value ); ?>><?php echo esc_html( $text ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
		</div>
		<?php
	}

	/** Segmented control (radio group). */
	private function segmented( $path, array $options, $label, $extra_class = '' ) {
		$current = (string) Settings::get( $path );
		?>
		<div class="bme-seg <?php echo esc_attr( $extra_class ); ?>" role="radiogroup" aria-label="<?php echo esc_attr( $label ); ?>">
			<?php foreach ( $options as $value => $text ) : ?>
				<label class="bme-seg__opt" data-value="<?php echo esc_attr( (string) $value ); ?>">
					<input type="radio" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( (string) $value ); ?>" <?php checked( $current, (string) $value ); ?> data-bme-bind="<?php echo esc_attr( $path ); ?>">
					<span><?php echo esc_html( $text ); ?></span>
				</label>
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * Registered Bricks element names (for the rule target suggestions).
	 *
	 * @return array name => label
	 */
	private function element_choices() {
		$out = array();
		if ( class_exists( '\Bricks\Elements' ) && ! empty( \Bricks\Elements::$elements ) && is_array( \Bricks\Elements::$elements ) ) {
			foreach ( \Bricks\Elements::$elements as $name => $el ) {
				$label        = ! empty( $el['label'] ) ? $el['label'] : ucwords( str_replace( array( '-', '_' ), ' ', (string) $name ) );
				$out[ $name ] = $label;
			}
		}
		if ( ! $out ) {
			foreach ( array( 'heading', 'text-basic', 'text', 'image', 'button', 'icon', 'icon-box', 'list', 'video', 'divider', 'posts', 'image-gallery', 'social-icons', 'section', 'container', 'block', 'div' ) as $name ) {
				$out[ $name ] = ucwords( str_replace( '-', ' ', $name ) );
			}
		}
		ksort( $out );
		return array( '*' => __( 'Any other content element', 'bricks-motion-studio' ) ) + $out;
	}

	/** Preset <option>s grouped with <optgroup>. */
	private function preset_optgroups( $selected ) {
		// A rule whose preset isn't available right now keeps it (saving must not swap it silently).
		if ( '' !== $selected && ! Presets::exists( $selected ) ) {
			/* translators: %s: preset slug. */
			printf( '<option value="%1$s" selected>%2$s</option>', esc_attr( $selected ), esc_html( sprintf( __( '%s (unavailable)', 'bricks-motion-studio' ), $selected ) ) );
		}
		$groups = Presets::group_labels();
		foreach ( $groups as $group => $group_label ) {
			echo '<optgroup label="' . esc_attr( $group_label ) . '">';
			foreach ( Presets::all() as $slug => $p ) {
				if ( ( $p['group'] ?? '' ) !== $group ) {
					continue;
				}
				printf( '<option value="%1$s" %2$s>%3$s</option>', esc_attr( $slug ), selected( $selected, $slug, false ), esc_html( $p['label'] ) );
			}
			echo '</optgroup>';
		}
	}

	private function rule_row( $index, array $rule ) {
		$base    = BME_OPTION . '[auto][rules][' . $index . ']';
		$engines = array(
			''       => __( 'Default', 'bricks-motion-studio' ),
			'native' => __( 'Built-in', 'bricks-motion-studio' ),
			'gsap'   => 'GSAP',
			'anime'  => 'Anime.js',
			'motion' => 'Motion',
		);
		?>
		<div class="bme-rule" role="row">
			<span class="bme-switch bme-switch--sm" role="cell">
				<input type="hidden" name="<?php echo esc_attr( $base . '[enabled]' ); ?>" value="0">
				<input type="checkbox" role="switch" name="<?php echo esc_attr( $base . '[enabled]' ); ?>" value="1" <?php checked( ! empty( $rule['enabled'] ) ); ?> aria-label="<?php esc_attr_e( 'Rule enabled', 'bricks-motion-studio' ); ?>">
				<span class="bme-switch__track" aria-hidden="true"></span>
			</span>
			<span class="bme-rule__target" role="cell">
				<select class="bme-select bme-select--quiet" name="<?php echo esc_attr( $base . '[type]' ); ?>" aria-label="<?php esc_attr_e( 'Match by', 'bricks-motion-studio' ); ?>">
					<option value="element" <?php selected( $rule['type'] ?? 'element', 'element' ); ?>><?php esc_html_e( 'Element', 'bricks-motion-studio' ); ?></option>
					<option value="class" <?php selected( $rule['type'] ?? '', 'class' ); ?>><?php esc_html_e( 'Class', 'bricks-motion-studio' ); ?></option>
				</select>
				<input type="text" class="bme-text bme-mono" list="bme-element-list" name="<?php echo esc_attr( $base . '[target]' ); ?>" value="<?php echo esc_attr( (string) ( $rule['target'] ?? '' ) ); ?>" placeholder="heading" aria-label="<?php esc_attr_e( 'Element name or class', 'bricks-motion-studio' ); ?>" spellcheck="false">
			</span>
			<span role="cell">
				<select class="bme-select" name="<?php echo esc_attr( $base . '[preset]' ); ?>" aria-label="<?php esc_attr_e( 'Preset', 'bricks-motion-studio' ); ?>" data-bme-preset>
					<?php $this->preset_optgroups( (string) ( $rule['preset'] ?? '' ) ); ?>
				</select>
			</span>
			<span role="cell">
				<input type="text" class="bme-text bme-mono" name="<?php echo esc_attr( $base . '[scope]' ); ?>" value="<?php echo esc_attr( (string) ( $rule['scope'] ?? 'self' ) ); ?>" list="bme-scope-list" placeholder="self" aria-label="<?php esc_attr_e( 'Animate: self, children or a selector', 'bricks-motion-studio' ); ?>" spellcheck="false">
			</span>
			<span role="cell">
				<select class="bme-select" name="<?php echo esc_attr( $base . '[engine]' ); ?>" aria-label="<?php esc_attr_e( 'Engine', 'bricks-motion-studio' ); ?>" data-bme-engine-select>
					<?php foreach ( $engines as $value => $label ) : ?>
						<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $rule['engine'] ?? '', $value ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</span>
			<span class="bme-rule__actions" role="cell">
				<button type="button" class="bme-icon-btn" data-bme-preview-rule aria-label="<?php esc_attr_e( 'Preview this preset', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Preview', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				<button type="button" class="bme-icon-btn bme-icon-btn--danger" data-bme-remove-rule aria-label="<?php esc_attr_e( 'Remove rule', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Remove', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'trash' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
			</span>
		</div>
		<?php
	}

	/**
	 * Environment checks for the System panel.
	 *
	 * @return array[] { label, value, status: ok|warn|fail, note }
	 */
	public static function system_checks() {
		global $wp_version;
		$checks = array();

		$checks[] = array(
			'label'  => 'WordPress',
			'value'  => $wp_version,
			'status' => version_compare( $wp_version, '6.5', '>=' ) ? 'ok' : 'fail',
			'note'   => __( 'Requires 6.5 or newer.', 'bricks-motion-studio' ),
		);
		$checks[] = array(
			'label'  => 'PHP',
			'value'  => PHP_VERSION,
			'status' => version_compare( PHP_VERSION, '7.4', '>=' ) ? 'ok' : 'fail',
			'note'   => __( 'Requires 7.4 or newer.', 'bricks-motion-studio' ),
		);
		$bricks   = defined( 'BRICKS_VERSION' ) ? BRICKS_VERSION : '';
		$checks[] = array(
			'label'  => 'Bricks',
			'value'  => $bricks ? $bricks : __( 'Not active', 'bricks-motion-studio' ),
			'status' => ! $bricks ? 'fail' : ( version_compare( $bricks, '2.0', '>=' ) ? 'ok' : 'warn' ),
			'note'   => __( 'Built and tested for Bricks 2.x (verified on 2.4.2).', 'bricks-motion-studio' ),
		);

		$count    = class_exists( '\Bricks\Elements' ) && is_array( \Bricks\Elements::$elements ) ? count( \Bricks\Elements::$elements ) : 0;
		$checks[] = array(
			'label'  => __( 'Elements with Motion controls', 'bricks-motion-studio' ),
			'value'  => (string) $count,
			'status' => $count > 0 ? 'ok' : 'fail',
			'note'   => __( 'Every registered Bricks element receives the Motion Studio control group.', 'bricks-motion-studio' ),
		);

		// PHP drops form fields past max_input_vars: a long rule list could be cut off on save.
		$max_vars = (int) ini_get( 'max_input_vars' );
		$needed   = 80 + 8 * count( (array) Settings::get( 'auto.rules', array() ) );
		if ( $max_vars > 0 ) {
			$checks[] = array(
				'label'  => __( 'Form size limit', 'bricks-motion-studio' ),
				/* translators: 1: fields the settings form sends, 2: PHP max_input_vars */
				'value'  => sprintf( __( '%1$d of %2$d fields', 'bricks-motion-studio' ), $needed, $max_vars ),
				'status' => $needed < $max_vars * 0.8 ? 'ok' : ( $needed < $max_vars ? 'warn' : 'fail' ),
				'note'   => __( 'PHP max_input_vars. Each rule adds 8 fields; ask your host to raise the limit before adding many more rules.', 'bricks-motion-studio' ),
			);
		}

		$missing = array();
		// The files this install actually serves (minified builds unless SCRIPT_DEBUG).
		$min   = Assets::min();
		$files = array( 'assets/js/runtime' . $min . '.js', 'assets/js/adapter-gsap' . $min . '.js', 'assets/js/adapter-anime' . $min . '.js', 'assets/js/adapter-motion' . $min . '.js', 'assets/js/smooth-scroll' . $min . '.js', 'assets/css/frontend' . $min . '.css', 'assets/js/three/bme-three.js', 'assets/vendor/gsap/gsap.min.js', 'assets/vendor/gsap/ScrollTrigger.min.js', 'assets/vendor/gsap/SplitText.min.js', 'assets/vendor/anime/anime.slim.min.js', 'assets/vendor/motion/motion.slim.min.js', 'assets/vendor/lenis/lenis.min.js' );
		foreach ( $files as $file ) {
			if ( ! is_readable( BME_PATH . $file ) ) {
				$missing[] = $file;
			}
		}
		$checks[] = array(
			'label'  => __( 'Bundled libraries', 'bricks-motion-studio' ),
			'value'  => $missing ? sprintf( /* translators: %d: number of files */ _n( '%d file missing', '%d files missing', count( $missing ), 'bricks-motion-studio' ), count( $missing ) ) : __( 'All present', 'bricks-motion-studio' ),
			'status' => $missing ? 'fail' : 'ok',
			'note'   => $missing ? implode( ', ', $missing ) : __( 'Pinned versions ship with the plugin, so library releases never change your site unexpectedly.', 'bricks-motion-studio' ),
		);

		$checks[] = array(
			'label'  => __( 'Script loading', 'bricks-motion-studio' ),
			'value'  => version_compare( $wp_version, '6.3', '>=' ) ? __( 'Deferred', 'bricks-motion-studio' ) : __( 'Footer', 'bricks-motion-studio' ),
			'status' => 'ok',
			'note'   => __( 'Scripts load in the footer with the defer strategy and only on pages that use them.', 'bricks-motion-studio' ),
		);

		return $checks;
	}

	/* ---------------------------------------------------------------------
	 * Page
	 * ------------------------------------------------------------------ */

	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$s       = Settings::all();
		$meta    = Libraries::meta();
		$eases   = Settings::eases();
		$checks  = self::system_checks();
		$issues  = count(
			array_filter(
				$checks,
				static function ( $c ) {
					return 'ok' !== $c['status'];
				}
			)
		);
		$panels  = array(
			'libraries' => array( __( 'Libraries', 'bricks-motion-studio' ), 'libraries' ),
			'auto'      => array( __( 'Auto-animate', 'bricks-motion-studio' ), 'auto' ),
			'defaults'  => array( __( 'Timing & feel', 'bricks-motion-studio' ), 'defaults' ),
			'scroll3d'  => array( __( 'Scroll & 3D', 'bricks-motion-studio' ), 'scroll3d' ),
			'a11y'      => array( __( 'Accessibility', 'bricks-motion-studio' ), 'a11y' ),
			'system'    => array( __( 'System', 'bricks-motion-studio' ), 'tools' ),
			'help'      => array( __( 'Reference', 'bricks-motion-studio' ), 'help' ),
		);
		$engines = array(
			'gsap'   => 'GSAP',
			'anime'  => 'Anime.js',
			'motion' => 'Motion',
		);
		$rules   = array_values( (array) $s['auto']['rules'] );
		?>
		<div class="wrap bme-wrap">
			<h1 class="screen-reader-text"><?php esc_html_e( 'Motion Studio', 'bricks-motion-studio' ); ?></h1>

			<div class="bme-app">
				<header class="bme-bar">
					<div class="bme-brand">
						<span class="bme-brand__mark" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16" focusable="false"><path fill="currentColor" d="<?php echo esc_attr( self::WAVE_PATH ); ?>"/><circle fill="currentColor" cx="4" cy="5" r="2"/></svg></span>
						<span class="bme-brand__name"><?php esc_html_e( 'Motion Studio', 'bricks-motion-studio' ); ?></span>
						<span class="bme-brand__ver">v<?php echo esc_html( BME_VERSION ); ?></span>
					</div>
					<p class="bme-bar__summary" data-bme-summary></p>
					<div class="bme-bar__actions">
						<span class="bme-bar__state" data-bme-state><?php esc_html_e( 'All changes saved', 'bricks-motion-studio' ); ?></span>
						<button type="submit" form="bme-form" class="bme-btn bme-btn--primary" data-bme-save>
							<?php esc_html_e( 'Save', 'bricks-motion-studio' ); ?>
							<kbd class="bme-kbd" aria-hidden="true" data-bme-kbd><?php echo esc_html_x( 'Ctrl S', 'keyboard shortcut', 'bricks-motion-studio' ); ?></kbd>
						</button>
					</div>
				</header>

				<div class="bme-shell">
					<nav class="bme-nav" aria-label="<?php esc_attr_e( 'Motion Studio settings', 'bricks-motion-studio' ); ?>">
						<?php foreach ( $panels as $id => $panel ) : ?>
							<a class="bme-nav__item" href="#<?php echo esc_attr( $id ); ?>" data-bme-nav="<?php echo esc_attr( $id ); ?>">
								<?php echo self::icon( $panel[1] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
								<span><?php echo esc_html( $panel[0] ); ?></span>
								<?php if ( 'system' === $id && $issues ) : ?>
									<span class="bme-nav__badge"><?php echo esc_html( (string) $issues ); ?></span>
								<?php endif; ?>
							</a>
						<?php endforeach; ?>
					</nav>

					<main class="bme-main">
						<form id="bme-form" method="post" action="options.php" novalidate>
							<?php settings_fields( self::GROUP ); ?>

							<!-- Libraries -->
							<section class="bme-panel" id="bme-panel-libraries" data-bme-panel="libraries" aria-labelledby="bme-h-libraries">
								<header class="bme-panel__head">
									<h2 id="bme-h-libraries"><?php esc_html_e( 'Libraries', 'bricks-motion-studio' ); ?></h2>
									<p><?php esc_html_e( 'Turn on any combination. Each element is animated by one engine, and a page only downloads the libraries it uses.', 'bricks-motion-studio' ); ?></p>
								</header>

								<ul class="bme-libs">
									<?php foreach ( $meta as $lib => $info ) : ?>
										<li class="bme-lib" data-bme-lib="<?php echo esc_attr( $lib ); ?>">
											<?php $this->switch_input( 'libraries.' . $lib, $info['label'] ); ?>
											<div class="bme-lib__body">
												<p class="bme-lib__title">
													<label for="<?php echo esc_attr( $this->id( 'libraries.' . $lib ) ); ?>"><?php echo esc_html( $info['label'] ); ?></label>
													<span class="bme-mono bme-lib__ver"><?php echo esc_html( Libraries::VERSIONS[ $lib ] ); ?></span>
												</p>
												<p class="bme-lib__role"><?php echo esc_html( $info['role'] ); ?></p>
												<p class="bme-lib__meta">
													<span><?php echo esc_html( $info['size'] ); ?></span>
													<a href="<?php echo esc_url( $info['url'] ); ?>" target="_blank" rel="noopener noreferrer"><?php echo 'gsap' === $lib ? esc_html__( 'GSAP Standard License', 'bricks-motion-studio' ) : esc_html( $info['license'] ); ?></a>
												</p>
												<?php if ( 'gsap' === $lib ) : ?>
													<p class="bme-note"><?php echo self::icon( 'info' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span><?php esc_html_e( 'Free for your own and client sites, including commercial work. It is not GPL, and selling or publicly distributing a plugin that bundles it needs written consent from GSAP.', 'bricks-motion-studio' ); ?></span></p>
												<?php endif; ?>
											</div>
										</li>
									<?php endforeach; ?>
								</ul>

								<div class="bme-group">
									<?php $this->switch_row( 'perf.native', __( 'Lightweight engine for simple effects', 'bricks-motion-studio' ), __( 'Reveals, loops and word/character text run on the browser\'s built-in animation engine: no library download and smoother scrolling. Your libraries still run everything that needs them (scroll-linked, pinning, SVG drawing, scramble, lines) and any element or rule set to a specific engine. Recommended.', 'bricks-motion-studio' ) ); ?>
								</div>

								<div class="bme-group">
									<div class="bme-row bme-row--stack">
										<div class="bme-row__text">
											<span class="bme-row__label"><?php esc_html_e( 'Default engine', 'bricks-motion-studio' ); ?></span>
											<p class="bme-row__help"><?php esc_html_e( 'Runs effects that need a library (and every effect when the lightweight engine is off) for rules and elements set to Default. If it cannot run a preset, the next enabled engine that can takes over.', 'bricks-motion-studio' ); ?></p>
										</div>
										<?php $this->segmented( 'default_engine', $engines, __( 'Default engine', 'bricks-motion-studio' ), 'bme-seg--engines' ); ?>
									</div>
									<div class="bme-row bme-row--stack">
										<div class="bme-row__text">
											<span class="bme-row__label"><?php esc_html_e( 'Load libraries from', 'bricks-motion-studio' ); ?></span>
											<p class="bme-row__help"><?php esc_html_e( 'Bundled files keep visitors off third-party servers and cannot change under you. The CDN option shares visitor IP addresses with jsDelivr; its files are integrity-checked.', 'bricks-motion-studio' ); ?></p>
										</div>
										<?php
										$this->segmented(
											'source',
											array(
												'local' => __( 'This site', 'bricks-motion-studio' ),
												'cdn'   => 'jsDelivr CDN',
											),
											__( 'Load libraries from', 'bricks-motion-studio' )
										);
										?>
									</div>
								</div>
							</section>

							<!-- Auto-animate -->
							<section class="bme-panel" id="bme-panel-auto" data-bme-panel="auto" aria-labelledby="bme-h-auto" hidden>
								<header class="bme-panel__head">
									<h2 id="bme-h-auto"><?php esc_html_e( 'Auto-animate', 'bricks-motion-studio' ); ?></h2>
									<p><?php esc_html_e( 'Rules apply presets to Bricks elements across the whole site. Settings on an element in the builder always win.', 'bricks-motion-studio' ); ?></p>
								</header>

								<div class="bme-group">
									<?php $this->switch_row( 'auto.enabled', __( 'Animate elements automatically', 'bricks-motion-studio' ), __( 'Class rules are checked before element rules. Set an element to Disabled in the builder to opt it out.', 'bricks-motion-studio' ) ); ?>
								</div>

								<fieldset class="bme-choices bme-choices--levels">
									<legend class="bme-row__label"><?php esc_html_e( 'Animation level', 'bricks-motion-studio' ); ?></legend>
									<?php
									$step = 0;
									foreach ( Levels::all() as $value => $text ) :
										++$step;
										?>
										<label class="bme-choice">
											<input type="radio" name="<?php echo esc_attr( $this->name( 'level' ) ); ?>" value="<?php echo esc_attr( $value ); ?>" <?php checked( $s['level'], $value ); ?>>
											<span class="bme-choice__text">
												<strong><span class="bme-meter" aria-hidden="true"><?php echo str_repeat( '<i class="is-on"></i>', $step ) . str_repeat( '<i></i>', 3 - $step ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span><?php echo esc_html( $text[0] ); ?></strong>
												<span><?php echo esc_html( $text[1] ); ?></span>
											</span>
										</label>
									<?php endforeach; ?>
									<p class="bme-choices__note"><?php esc_html_e( 'Applies to element-type rules. Class rules always keep the exact preset you chose, and Custom animations keep their own settings. A page (Page settings) or an element can pick its own level in the builder.', 'bricks-motion-studio' ); ?></p>
								</fieldset>

								<?php // Marks the rule list as submitted, so removing every rule really clears it. ?>
								<input type="hidden" name="<?php echo esc_attr( BME_OPTION . '[auto][rules]' ); ?>" value="">
								<div class="bme-rules">
									<div role="table" aria-label="<?php esc_attr_e( 'Auto-animate rules', 'bricks-motion-studio' ); ?>">
									<div role="rowgroup">
									<div class="bme-rule bme-rule--head" role="row">
										<span role="columnheader"><span class="screen-reader-text"><?php esc_html_e( 'On', 'bricks-motion-studio' ); ?></span></span>
										<span role="columnheader"><?php esc_html_e( 'Applies to', 'bricks-motion-studio' ); ?></span>
										<span role="columnheader"><?php esc_html_e( 'Preset', 'bricks-motion-studio' ); ?></span>
										<span role="columnheader"><?php esc_html_e( 'Animate', 'bricks-motion-studio' ); ?></span>
										<span role="columnheader"><?php esc_html_e( 'Engine', 'bricks-motion-studio' ); ?></span>
										<span role="columnheader"><span class="screen-reader-text"><?php esc_html_e( 'Actions', 'bricks-motion-studio' ); ?></span></span>
									</div>
									</div>
									<div id="bme-rules-body" role="rowgroup">
										<?php
										foreach ( $rules as $i => $rule ) {
											$this->rule_row( $i, $rule );
										}
										?>
									</div>
									</div>
									<p class="bme-empty" data-bme-empty <?php echo $rules ? 'hidden' : ''; ?>><?php esc_html_e( 'No rules yet. Add one to animate an element type or class everywhere.', 'bricks-motion-studio' ); ?></p>
									<div class="bme-rules__foot">
										<button type="button" class="bme-btn" data-bme-add-rule><?php echo self::icon( 'plus' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Add rule', 'bricks-motion-studio' ); ?></button>
										<span class="bme-rules__hint"><?php esc_html_e( 'Animate accepts self, children, or a CSS selector inside the element.', 'bricks-motion-studio' ); ?></span>
									</div>
								</div>
								<template id="bme-rule-template">
									<?php
									$this->rule_row(
										'__INDEX__',
										array(
											'enabled' => 1,
											'type'    => 'element',
											'target'  => '',
											'preset'  => 'fade-up',
											'scope'   => 'self',
											'engine'  => '',
										)
									);
									?>
								</template>
								<datalist id="bme-element-list">
									<?php foreach ( $this->element_choices() as $name => $label ) : ?>
										<option value="<?php echo esc_attr( $name ); ?>"><?php echo esc_html( $label ); ?></option>
									<?php endforeach; ?>
								</datalist>
								<datalist id="bme-scope-list">
									<option value="self"></option>
									<option value="children"></option>
									<option value=".bricks-layout-item"></option>
								</datalist>

								<h3 class="bme-subhead"><?php esc_html_e( 'Leave these alone', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'auto.skip_header', __( 'Header template', 'bricks-motion-studio' ), __( 'Sticky headers and menus should never be transformed.', 'bricks-motion-studio' ) );
									$this->switch_row( 'auto.skip_footer', __( 'Footer template', 'bricks-motion-studio' ) );
									$this->switch_row( 'auto.skip_popups', __( 'Popups', 'bricks-motion-studio' ), __( 'When off, popup content animates every time the popup opens.', 'bricks-motion-studio' ) );
									$this->switch_row( 'auto.skip_interactions', __( 'Elements using Bricks "Start animation"', 'bricks-motion-studio' ), __( 'Avoids animating an element twice.', 'bricks-motion-studio' ) );
									?>
									<div class="bme-row bme-row--stack">
										<div class="bme-row__text">
											<label class="bme-row__label" for="bme-auto-exclude"><?php esc_html_e( 'Never animate inside', 'bricks-motion-studio' ); ?></label>
											<p class="bme-row__help"><?php esc_html_e( 'Comma-separated selectors. Sliders, off-canvas panels and menus are covered by default.', 'bricks-motion-studio' ); ?></p>
										</div>
										<textarea id="bme-auto-exclude" class="bme-textarea bme-mono" name="<?php echo esc_attr( $this->name( 'auto.exclude' ) ); ?>" rows="3" spellcheck="false"><?php echo esc_textarea( (string) $s['auto']['exclude'] ); ?></textarea>
									</div>
								</div>
							</section>

							<!-- Timing & feel -->
							<section class="bme-panel" id="bme-panel-defaults" data-bme-panel="defaults" aria-labelledby="bme-h-defaults" hidden>
								<header class="bme-panel__head">
									<h2 id="bme-h-defaults"><?php esc_html_e( 'Timing & feel', 'bricks-motion-studio' ); ?></h2>
									<p><?php esc_html_e( 'Site-wide defaults. Presets and elements can override them. Changes play in the preview as you type.', 'bricks-motion-studio' ); ?></p>
								</header>

								<div class="bme-split">
									<div>
										<div class="bme-group">
											<?php
											$this->number_row( 'defaults.duration', __( 'Duration', 'bricks-motion-studio' ), 0, 10, 0.05, 's' );
											$this->number_row( 'defaults.delay', __( 'Delay', 'bricks-motion-studio' ), 0, 10, 0.05, 's' );
											$this->select_row( 'defaults.ease', __( 'Easing', 'bricks-motion-studio' ), $eases );
											$this->number_row( 'defaults.distance', __( 'Travel distance', 'bricks-motion-studio' ), 0, 400, 1, 'px' );
											?>
										</div>
										<div class="bme-group">
											<?php
											$this->number_row( 'defaults.stagger', __( 'Stagger', 'bricks-motion-studio' ), 0, 2, 0.01, 's', __( 'Between children and between words or letters.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.batch', __( 'Cascade', 'bricks-motion-studio' ), 0, 1, 0.01, 's', __( 'Between elements that enter the screen together, like grid items.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.offset', __( 'Start line', 'bricks-motion-studio' ), 0, 50, 1, '%', __( 'How far above the bottom of the screen an element starts.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.speed', __( 'Parallax speed', 'bricks-motion-studio' ), -2, 2, 0.05 );
											$this->switch_row( 'defaults.replay', __( 'Replay when scrolling back up', 'bricks-motion-studio' ) );
											?>
										</div>
									</div>

									<aside class="bme-preview" aria-label="<?php esc_attr_e( 'Live preview', 'bricks-motion-studio' ); ?>">
										<div class="bme-preview__stage" data-bme-stage>
											<div class="bme-preview__heading" data-bme-sample="text"><?php esc_html_e( 'Motion that feels intentional', 'bricks-motion-studio' ); ?></div>
											<div class="bme-preview__cards">
												<span data-bme-sample="card"></span><span data-bme-sample="card"></span><span data-bme-sample="card"></span>
											</div>
										</div>
										<div class="bme-preview__bar">
											<select class="bme-select" data-bme-preview-preset aria-label="<?php esc_attr_e( 'Preset to preview', 'bricks-motion-studio' ); ?>">
												<?php $this->preset_optgroups( 'fade-up' ); ?>
											</select>
											<button type="button" class="bme-btn" data-bme-play><?php echo self::icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Play', 'bricks-motion-studio' ); ?></button>
										</div>
									</aside>
								</div>
							</section>

							<!-- Scroll & 3D -->
							<section class="bme-panel" id="bme-panel-scroll3d" data-bme-panel="scroll3d" aria-labelledby="bme-h-scroll3d" hidden>
								<header class="bme-panel__head">
									<h2 id="bme-h-scroll3d"><?php esc_html_e( 'Scroll & 3D', 'bricks-motion-studio' ); ?></h2>
									<p><?php esc_html_e( 'Smooth scrolling with Lenis and rendering limits for Three.js scenes.', 'bricks-motion-studio' ); ?></p>
								</header>

								<h3 class="bme-subhead"><?php esc_html_e( 'Smooth scroll', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-inline-note" data-bme-when-off="libraries.lenis"><?php esc_html_e( 'Lenis is off. Turn it on under Libraries to use these settings.', 'bricks-motion-studio' ); ?></p>
								<div class="bme-group" data-bme-depends="libraries.lenis">
									<?php
									$this->number_row( 'lenis.lerp', __( 'Smoothness', 'bricks-motion-studio' ), 0.01, 1, 0.01, '', __( 'Lower is smoother. 0.1 suits most sites.', 'bricks-motion-studio' ) );
									$this->number_row( 'lenis.wheel', __( 'Wheel speed', 'bricks-motion-studio' ), 0.1, 5, 0.1, 'x' );
									$this->switch_row( 'lenis.anchors', __( 'Smooth anchor links', 'bricks-motion-studio' ), __( 'Offsets for a sticky header automatically.', 'bricks-motion-studio' ) );
									$this->switch_row( 'lenis.touch', __( 'Smooth touch scrolling', 'bricks-motion-studio' ), __( 'Usually better left off: phones already scroll smoothly.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Three.js', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-inline-note" data-bme-when-off="libraries.three"><?php esc_html_e( 'Three.js is off. Turn it on under Libraries to use 3D backgrounds and the 3D Scene element.', 'bricks-motion-studio' ); ?></p>
								<div class="bme-group" data-bme-depends="libraries.three">
									<?php
									$this->number_row( 'three.dpr', __( 'Max pixel ratio', 'bricks-motion-studio' ), 0.5, 3, 0.25, 'x', __( 'Caps resolution on high-density screens. 1.5 balances sharpness and battery.', 'bricks-motion-studio' ) );
									$this->switch_row( 'three.mobile', __( 'Render on phones', 'bricks-motion-studio' ), __( 'When off, phones show the poster image or section background.', 'bricks-motion-studio' ) );
									?>
								</div>
							</section>

							<!-- Accessibility & performance -->
							<section class="bme-panel" id="bme-panel-a11y" data-bme-panel="a11y" aria-labelledby="bme-h-a11y" hidden>
								<header class="bme-panel__head">
									<h2 id="bme-h-a11y"><?php esc_html_e( 'Accessibility', 'bricks-motion-studio' ); ?></h2>
									<p><?php esc_html_e( 'How the site behaves for visitors who ask for less motion, and when scripts are slow or blocked.', 'bricks-motion-studio' ); ?></p>
								</header>

								<fieldset class="bme-choices">
									<legend class="bme-row__label"><?php esc_html_e( 'Visitors who prefer reduced motion', 'bricks-motion-studio' ); ?></legend>
									<?php
									$reduced = array(
										'respect' => array( __( 'No animation', 'bricks-motion-studio' ), __( 'Content appears instantly. Recommended.', 'bricks-motion-studio' ) ),
										'fade'    => array( __( 'Gentle fades', 'bricks-motion-studio' ), __( 'Opacity only, no movement.', 'bricks-motion-studio' ) ),
										'ignore'  => array( __( 'Full animation', 'bricks-motion-studio' ), __( 'Ignores the visitor setting. Not recommended.', 'bricks-motion-studio' ) ),
									);
									foreach ( $reduced as $value => $text ) :
										?>
										<label class="bme-choice">
											<input type="radio" name="<?php echo esc_attr( $this->name( 'a11y.reduced' ) ); ?>" value="<?php echo esc_attr( $value ); ?>" <?php checked( $s['a11y']['reduced'], $value ); ?>>
											<span class="bme-choice__text"><strong><?php echo esc_html( $text[0] ); ?></strong><span><?php echo esc_html( $text[1] ); ?></span></span>
										</label>
									<?php endforeach; ?>
								</fieldset>

								<div class="bme-group">
									<?php
									$this->number_row( 'a11y.min_width', __( 'Turn animations off below', 'bricks-motion-studio' ), 0, 4000, 1, 'px', __( '0 keeps animations on every screen size.', 'bricks-motion-studio' ) );
									$this->switch_row( 'perf.fouc', __( 'Hide elements until they animate', 'bricks-motion-studio' ), __( 'Prevents a flash of the final state. Content stays readable by screen readers and search engines.', 'bricks-motion-studio' ) );
									$this->number_row( 'perf.failsafe', __( 'Show everything after', 'bricks-motion-studio' ), 500, 15000, 100, 'ms', __( 'If scripts are blocked or delayed by an optimization plugin, content appears anyway.', 'bricks-motion-studio' ) );
									$this->switch_row( 'perf.always', __( 'Load engines on every page', 'bricks-motion-studio' ), __( 'Only needed for content added by custom code or other plugins after the page loads.', 'bricks-motion-studio' ) );
									$this->switch_row( 'debug', __( 'Debug mode', 'bricks-motion-studio' ), __( 'Logs decisions to the browser console and shows scroll trigger markers.', 'bricks-motion-studio' ) );
									?>
								</div>
							</section>
						</form>

						<!-- System (separate forms: import / reset) -->
						<section class="bme-panel" id="bme-panel-system" data-bme-panel="system" aria-labelledby="bme-h-system" hidden>
							<header class="bme-panel__head">
								<h2 id="bme-h-system"><?php esc_html_e( 'System', 'bricks-motion-studio' ); ?></h2>
								<p><?php esc_html_e( 'Compatibility checks, backup and restore.', 'bricks-motion-studio' ); ?></p>
							</header>

							<ul class="bme-checks">
								<?php foreach ( $checks as $check ) : ?>
									<li class="bme-check bme-check--<?php echo esc_attr( $check['status'] ); ?>">
										<span class="bme-check__dot" aria-hidden="true"></span>
										<span class="bme-check__label"><?php echo esc_html( $check['label'] ); ?></span>
										<span class="bme-check__value bme-mono"><?php echo esc_html( $check['value'] ); ?></span>
										<span class="bme-check__note"><?php echo esc_html( $check['note'] ); ?></span>
										<span class="screen-reader-text"><?php echo 'ok' === $check['status'] ? esc_html__( 'Passed', 'bricks-motion-studio' ) : esc_html__( 'Needs attention', 'bricks-motion-studio' ); ?></span>
									</li>
								<?php endforeach; ?>
							</ul>

							<h3 class="bme-subhead"><?php esc_html_e( 'Export', 'bricks-motion-studio' ); ?></h3>
							<div class="bme-code">
								<textarea class="bme-textarea bme-mono" rows="6" readonly data-bme-export aria-label="<?php esc_attr_e( 'Settings JSON', 'bricks-motion-studio' ); ?>"><?php echo esc_textarea( (string) wp_json_encode( $s, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) ); ?></textarea>
								<button type="button" class="bme-btn" data-bme-copy><?php esc_html_e( 'Copy', 'bricks-motion-studio' ); ?></button>
							</div>

							<h3 class="bme-subhead"><?php esc_html_e( 'Import', 'bricks-motion-studio' ); ?></h3>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="bme-code">
								<input type="hidden" name="action" value="bme_import">
								<?php wp_nonce_field( 'bme_import' ); ?>
								<textarea class="bme-textarea bme-mono" name="bme_import" rows="5" placeholder="{ }" aria-label="<?php esc_attr_e( 'Paste exported JSON', 'bricks-motion-studio' ); ?>" spellcheck="false"></textarea>
								<button class="bme-btn"><?php esc_html_e( 'Import', 'bricks-motion-studio' ); ?></button>
							</form>

							<div class="bme-danger">
								<div>
									<strong><?php esc_html_e( 'Reset all settings', 'bricks-motion-studio' ); ?></strong>
									<p><?php esc_html_e( 'Restores the defaults. Animation settings saved on individual elements are not affected.', 'bricks-motion-studio' ); ?></p>
								</div>
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-bme-confirm="<?php esc_attr_e( 'Reset all Motion Studio settings to their defaults?', 'bricks-motion-studio' ); ?>">
									<input type="hidden" name="action" value="bme_reset">
									<?php wp_nonce_field( 'bme_reset' ); ?>
									<button class="bme-btn bme-btn--danger"><?php esc_html_e( 'Reset', 'bricks-motion-studio' ); ?></button>
								</form>
							</div>
						</section>

						<!-- Reference -->
						<section class="bme-panel" id="bme-panel-help" data-bme-panel="help" aria-labelledby="bme-h-help" hidden>
							<header class="bme-panel__head">
								<h2 id="bme-h-help"><?php esc_html_e( 'Reference', 'bricks-motion-studio' ); ?></h2>
								<p><?php esc_html_e( 'Hover a preset to watch it. Use the slug in attributes and rules.', 'bricks-motion-studio' ); ?></p>
							</header>

							<?php foreach ( Presets::group_labels() as $group => $group_label ) : ?>
								<h3 class="bme-subhead"><?php echo esc_html( $group_label ); ?></h3>
								<div class="bme-presets">
									<?php
									foreach ( Presets::all() as $slug => $p ) :
										if ( ( $p['group'] ?? '' ) !== $group ) {
											continue;
										}
										?>
										<button type="button" class="bme-preset" data-bme-demo="<?php echo esc_attr( $slug ); ?>">
											<span class="bme-preset__stage" aria-hidden="true"><span class="bme-preset__shape">Aa</span></span>
											<span class="bme-preset__name"><?php echo esc_html( $p['label'] ); ?></span>
											<code class="bme-preset__slug"><?php echo esc_html( $slug ); ?></code>
											<span class="bme-preset__engines"><?php echo esc_html( self::engine_list( $slug, $p ) ); ?></span>
										</button>
									<?php endforeach; ?>
								</div>
							<?php endforeach; ?>

							<h3 class="bme-subhead"><?php esc_html_e( 'Attributes (no code)', 'bricks-motion-studio' ); ?></h3>
							<p class="bme-panel__text"><?php esc_html_e( 'Add these under Style, Attributes on any element:', 'bricks-motion-studio' ); ?></p>
<pre class="bme-pre"><code>data-bme         fade-up
data-bme-engine  motion
data-bme-opts    {"duration":1.2,"delay":0.2,"scope":"children","stagger":0.1}
data-bme-hover   magnetic
data-bme-skip    (no value, opts the element out)</code></pre>

							<h3 class="bme-subhead"><?php esc_html_e( 'JavaScript', 'bricks-motion-studio' ); ?></h3>
<pre class="bme-pre"><code>BricksMotion.refresh();        // re-scan after custom AJAX
BricksMotion.play( el );       // replay an element (also from Interactions → JavaScript (Function), %brx%)
BricksMotion.reset( el );      // back to the start state
BricksMotion.destroy( el );    // stop and restore
BricksMotion.lenis;            // Lenis instance, when enabled
document.addEventListener( 'bme:ready', ( e ) =&gt; console.log( e.detail ) );</code></pre>
						</section>
					</main>
				</div>
			</div>
		</div>
		<?php
	}
}
