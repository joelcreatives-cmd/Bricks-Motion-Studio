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

	/** Library badges on the Libraries cards. */
	const LIB_MONOGRAMS = array(
		'gsap'   => 'GS',
		'anime'  => 'A',
		'motion' => 'M',
		'three'  => '3D',
		'lenis'  => 'L',
	);

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
		add_action( 'wp_ajax_bme_settings_rev', array( $this, 'ajax_rev' ) );
	}

	/**
	 * Motion Studio menu in the admin bar on the frontend: site status, this page's state, a
	 * link to view the page without animations, and the settings.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public static function admin_bar( $bar ) {
		if ( is_admin() || ! is_admin_bar_showing() || ! current_user_can( 'manage_options' ) || ! Settings::get( 'admin_bar', 1 ) ) {
			return;
		}
		if ( function_exists( 'bricks_is_builder' ) && ( bricks_is_builder() || bricks_is_builder_iframe() ) ) {
			return;
		}
		$status = Settings::status();
		$labels = self::status_labels();
		$state  = 'off' === $status ? 'off' : ( Settings::path_is_off() ? 'page-off' : $status );
		$dot    = array(
			'live'     => '#22c55e',
			'editors'  => '#f59e0b',
			'off'      => '#ef4444',
			'page-off' => '#ef4444',
		);
		$bar->add_node(
			array(
				'id'    => 'bme',
				'title' => '<span class="ab-icon" aria-hidden="true" style="top:2px"><svg viewBox="0 0 20 20" width="18" height="18" style="fill:currentColor"><path d="' . esc_attr( self::WAVE_PATH ) . '"/><circle cx="4" cy="5" r="2"/></svg></span><span class="ab-label">' . esc_html__( 'Motion', 'bricks-motion-studio' ) . '</span><span aria-hidden="true" style="display:inline-block;width:7px;height:7px;margin-left:6px;border-radius:50%;vertical-align:middle;background:' . esc_attr( $dot[ $state ] ) . '"></span>',
				'href'  => self::page_url(),
				'meta'  => array( 'title' => $labels[ $status ][0] ),
			)
		);
		$bar->add_node(
			array(
				'parent' => 'bme',
				'id'     => 'bme-status',
				/* translators: %s: site status, e.g. Live */
				'title'  => esc_html( sprintf( __( 'Status: %s', 'bricks-motion-studio' ), 'page-off' === $state ? __( 'Off on this page', 'bricks-motion-studio' ) : $labels[ $status ][0] ) ),
				'href'   => self::page_url() . '#overview',
			)
		);
		if ( isset( $_GET['bme-disable'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$bar->add_node(
				array(
					'parent' => 'bme',
					'id'     => 'bme-disable',
					'title'  => esc_html__( 'Show animations again', 'bricks-motion-studio' ),
					'href'   => esc_url( remove_query_arg( 'bme-disable' ) ),
				)
			);
		} elseif ( 'off' !== $state && 'page-off' !== $state ) {
			$bar->add_node(
				array(
					'parent' => 'bme',
					'id'     => 'bme-disable',
					'title'  => esc_html__( 'View this page without animations', 'bricks-motion-studio' ),
					'href'   => esc_url( add_query_arg( 'bme-disable', '1' ) ),
				)
			);
			$inspecting = isset( $_GET['bme-debug'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$bar->add_node(
				array(
					'parent' => 'bme',
					'id'     => 'bme-inspect',
					'title'  => $inspecting ? esc_html__( 'Stop inspecting', 'bricks-motion-studio' ) : esc_html__( 'Inspect animations', 'bricks-motion-studio' ),
					'href'   => esc_url( $inspecting ? remove_query_arg( 'bme-debug' ) : add_query_arg( 'bme-debug', '1' ) ),
					'meta'   => array( 'title' => __( 'Show a label on every animation on this page (which animation it is and where it comes from), and why some elements don\'t animate.', 'bricks-motion-studio' ) ),
				)
			);
		}
		$bar->add_node(
			array(
				'parent' => 'bme',
				'id'     => 'bme-settings',
				'title'  => esc_html__( 'Settings', 'bricks-motion-studio' ),
				'href'   => self::page_url(),
			)
		);
	}

	/**
	 * Site status choices: label, description.
	 *
	 * @return array[]
	 */
	public static function status_labels() {
		return array(
			'live'    => array( __( 'Live', 'bricks-motion-studio' ), __( 'Everyone sees your animations.', 'bricks-motion-studio' ) ),
			'editors' => array( __( 'Editors only', 'bricks-motion-studio' ), __( 'Only logged-in editors see them. Visitors get the page as designed, without motion: build and review before launch.', 'bricks-motion-studio' ) ),
			'off'     => array( __( 'Off', 'bricks-motion-studio' ), __( 'No Motion Studio output on the frontend for anyone. Your rules and element settings are kept.', 'bricks-motion-studio' ) ),
		);
	}

	/**
	 * Fingerprint of the saved settings. The screen keeps the one it was opened with, so a save
	 * from a tab opened before the settings changed elsewhere (another tab, an import, WP-CLI)
	 * asks before overwriting them.
	 *
	 * @return string
	 */
	public static function settings_rev() {
		return md5( (string) wp_json_encode( get_option( BME_OPTION, array() ) ) );
	}

	/** Current fingerprint, for the check before saving (admin.js). */
	public function ajax_rev() {
		check_ajax_referer( 'bme_settings_rev', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( null, 403 );
		}
		wp_send_json_success( array( 'rev' => self::settings_rev() ) );
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
			'window.BME_ADMIN=' . Plugin::json(
				array(
					'presets' => Presets::all(),
					'rev'     => self::settings_rev(),
					'ajax'    => admin_url( 'admin-ajax.php' ),
					'nonce'   => wp_create_nonce( 'bme_settings_rev' ),
					'usage'   => array(
						'nonce' => wp_create_nonce( 'bme_usage' ),
						'urls'  => Usage_Log::scan_urls(),
						'data'  => Usage_Log::report(),
						'page'  => self::page_url(),
					),
					'i18n'    => array(
						'changed'            => __( 'The Motion Studio settings were changed somewhere else (another tab, an import or an update) after you opened this page. Save anyway and replace those changes with yours?', 'bricks-motion-studio' ),
						/* translators: 1: rules switched on, 2: all rules */
						'ruleCount'          => __( '%1$d of %2$d on', 'bricks-motion-studio' ),
						/* translators: 1: rules shown by the filter, 2: all rules */
						'ruleShown'          => __( '%1$d of %2$d shown', 'bricks-motion-studio' ),
						'unknownEl'          => __( 'Not a Bricks element on this site', 'bricks-motion-studio' ),
						'jsonOk'             => __( 'This is a valid backup. Click Restore to apply it.', 'bricks-motion-studio' ),
						'jsonBad'            => __( 'This doesn\'t look like a Motion Studio backup. Choose the file you downloaded with Download backup, or paste all of its text.', 'bricks-motion-studio' ),
						/* translators: %s: preset slug, e.g. fade-up */
						'copySlug'           => __( 'Copied %s', 'bricks-motion-studio' ),
						'unsaved'            => __( 'Unsaved changes', 'bricks-motion-studio' ),
						'saved'              => __( 'All changes saved', 'bricks-motion-studio' ),
						'saving'             => __( 'Saving…', 'bricks-motion-studio' ),
						'section'            => __( 'Section', 'bricks-motion-studio' ),
						'preset'             => __( 'Preset', 'bricks-motion-studio' ),
						'paletteLabel'       => __( 'Search settings', 'bricks-motion-studio' ),
						'palettePlaceholder' => __( 'Search settings, sections and presets…', 'bricks-motion-studio' ),
						'paletteNone'        => __( 'Nothing found. Try another word.', 'bricks-motion-studio' ),
						'usageEmpty'         => __( 'Nothing recorded yet. Click Scan site, or open a few pages of your site.', 'bricks-motion-studio' ),
						'usagePages'         => __( 'Pages recorded', 'bricks-motion-studio' ),
						'usageAvg'           => __( 'Average per page', 'bricks-motion-studio' ),
						'usageMax'           => __( 'Heaviest page', 'bricks-motion-studio' ),
						'usageTop'           => __( 'Most used preset', 'bricks-motion-studio' ),
						'usageEngines'       => __( 'Engines', 'bricks-motion-studio' ),
						'usagePresets'       => __( 'Presets in use', 'bricks-motion-studio' ),
						'usagePageList'      => __( 'Pages, heaviest first', 'bricks-motion-studio' ),
						'usageColPage'       => __( 'Page', 'bricks-motion-studio' ),
						'usageColEngines'    => __( 'Engines', 'bricks-motion-studio' ),
						'usageColAnims'      => __( 'Animations', 'bricks-motion-studio' ),
						'usageColScript'     => __( 'Script', 'bricks-motion-studio' ),
						'usageColSeen'       => __( 'Last seen', 'bricks-motion-studio' ),
						/* translators: 1: pages using it, 2: pages recorded */
						'usageOfPages'       => __( '%1$d of %2$d pages', 'bricks-motion-studio' ),
						/* translators: %s: library name, e.g. Anime.js */
						'usageUnused'        => __( '%s is on, but no recorded page uses it. Pages only download the libraries they use, so it costs nothing; switch it off if you don\'t plan to use it.', 'bricks-motion-studio' ),
						'usageAlways'        => __( '"Load engines on every page" is on (Accessibility): every page downloads all libraries you turned on, used or not.', 'bricks-motion-studio' ),
						'usageLenis'         => __( 'Smooth scrolling is on, so every page loads Lenis.', 'bricks-motion-studio' ),
						'usageCdn'           => __( 'Libraries load from an outside server (Libraries, Load libraries from): the sizes shown are those of the same files included with the plugin.', 'bricks-motion-studio' ),
						/* translators: 1: pages done, 2: pages to scan */
						'usageScanning'      => __( 'Scanning %1$d of %2$d…', 'bricks-motion-studio' ),
						/* translators: %d: pages scanned */
						'usageDone'          => __( 'Scanned %d pages.', 'bricks-motion-studio' ),
						/* translators: %d: pages that failed to load */
						'usageFailedN'       => __( '%d could not be opened.', 'bricks-motion-studio' ),
						'usageCleared'       => __( 'Report cleared.', 'bricks-motion-studio' ),
						'usageConfirmClear'  => __( 'Clear the usage report? Pages are recorded again as they are viewed.', 'bricks-motion-studio' ),
						'usageError'         => __( 'The report could not be loaded. Reload the page and try again.', 'bricks-motion-studio' ),
						'usageBuiltIn'       => __( 'Built-in only', 'bricks-motion-studio' ),
						/* translators: %d: number of pages */
						'usageMore'          => __( 'Show all %d pages', 'bricks-motion-studio' ),
						'copied'             => __( 'Copied', 'bricks-motion-studio' ),
						'ctrlS'              => _x( 'Ctrl S', 'keyboard shortcut', 'bricks-motion-studio' ),
						/* translators: 1: button name, e.g. "Remove rule", 2: rule number */
						'ruleBtn'            => __( '%1$s (rule %2$d)', 'bricks-motion-studio' ),
						'leave'              => __( 'You have unsaved changes.', 'bricks-motion-studio' ),
						'libOff'             => __( '(library off)', 'bricks-motion-studio' ),
						'sample'             => __( 'Hello there', 'bricks-motion-studio' ),
						/* translators: %s: a number, e.g. 1,250 */
						'counter'            => __( '%s+ launches', 'bricks-motion-studio' ),
						'noLibs'             => __( 'No libraries', 'bricks-motion-studio' ),
						/* translators: 1: number of active rules (no plural form needed), 2: animation level name */
						'autoOn'             => __( 'auto-animate on, %2$s level, active rules: %1$s', 'bricks-motion-studio' ),
						'autoOff'            => __( 'auto-animate off', 'bricks-motion-studio' ),
						/* translators: 1: active rules, 2: all rules */
						'ofRules'            => __( 'of %2$d rules on', 'bricks-motion-studio' ),
						/* translators: %1$d: number of "My presets" */
						'mineCount'          => __( 'including %1$d of your own', 'bricks-motion-studio' ),
						'builtIn'            => __( 'Built in, ready to use', 'bricks-motion-studio' ),
						'status'             => array_map(
							static function ( $t ) {
								return $t[0];
							},
							self::status_labels()
						),
						'levels'             => array_map(
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
			echo '<div class="notice notice-success is-dismissible bme-notice"><p>' . esc_html__( 'Settings saved.', 'bricks-motion-studio' ) . '</p></div>';
		}
		if ( $screen && $screen->id === $this->hook && isset( $_GET['bme_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$code = sanitize_key( wp_unslash( $_GET['bme_notice'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$map  = array(
				'imported'       => array( 'success', __( 'Settings restored from the backup. You can undo it in Recent changes.', 'bricks-motion-studio' ) ),
				'import_failed'  => array( 'error', __( 'Restore failed: choose a Motion Studio backup file, or paste all of its text.', 'bricks-motion-studio' ) ),
				'restored'       => array( 'success', __( 'Earlier settings restored. The version you replaced is in Recent changes, if you want it back.', 'bricks-motion-studio' ) ),
				'restore_failed' => array( 'error', __( 'That version is no longer in the list (the settings changed meanwhile). Pick it again below.', 'bricks-motion-studio' ) ),
				'reset'          => array( 'success', __( 'Settings reset to defaults.', 'bricks-motion-studio' ) ),
				'share_failed'   => array( 'error', __( 'That is not a Motion Studio share code. Copy the whole code (it starts with BMS1.) and try again.', 'bricks-motion-studio' ) ),
				'shared'         => array(
					'success',
					sprintf(
						/* translators: 1: presets added, 2: rules added */
						__( 'Share code applied: %1$d presets and %2$d rules added.', 'bricks-motion-studio' ),
						isset( $_GET['bme_np'] ) ? absint( $_GET['bme_np'] ) : 0, // phpcs:ignore WordPress.Security.NonceVerification.Recommended
						isset( $_GET['bme_nr'] ) ? absint( $_GET['bme_nr'] ) : 0 // phpcs:ignore WordPress.Security.NonceVerification.Recommended
					),
				),
			);
			if ( isset( $map[ $code ] ) ) {
				printf( '<div class="notice notice-%1$s is-dismissible bme-notice"><p>%2$s</p></div>', esc_attr( $map[ $code ][0] ), esc_html( $map[ $code ][1] ) );
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
		// My presets too: an imported list replaces the current one (merging by position would mix them).
		if ( array_key_exists( 'custom_presets', $data ) ) {
			$merged['custom_presets'] = is_array( $data['custom_presets'] ) ? $data['custom_presets'] : array();
		}

		update_option( BME_OPTION, $merged ); // sanitized once, by the registered Settings::sanitize()
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
	 * A version for comparison: every key present, rules in their full current shape.
	 *
	 * @param array $v Settings version.
	 * @return array
	 */
	private static function normalized( array $v ) {
		$v                  = History::complete( $v );
		$v['auto']['rules'] = Settings::sanitize_rules( $v['auto']['rules'] );
		return $v;
	}

	/**
	 * Recent changes (System): each earlier version, what replaced it, and Restore.
	 *
	 * @param array $current Current settings.
	 */
	private function history_list( array $current ) {
		$list = History::all();
		if ( ! $list ) {
			echo '<p class="bme-empty bme-history__empty">' . esc_html__( 'No changes yet. After the next save, the version it replaced appears here.', 'bricks-motion-studio' ) . '</p>';
			return;
		}
		$sources = History::source_labels();
		$newer   = self::normalized( $current );
		echo '<ol class="bme-history">';
		foreach ( $list as $i => $entry ) {
			$version = self::normalized( $entry['settings'] );
			$changes = History::describe( History::diff( $version, $newer ) );
			$newer   = $version;
			$time    = (int) $entry['time'];
			/* translators: %s: human time difference, e.g. "5 mins" */
			$ago  = sprintf( __( '%s ago', 'bricks-motion-studio' ), human_time_diff( $time ) );
			$when = wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $time );
			$how  = $sources[ $entry['source'] ?? 'other' ] ?? $sources['other'];
			?>
			<li class="bme-history__item">
				<span class="bme-history__icon" aria-hidden="true"><?php echo self::icon( 'history' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
				<span class="bme-history__text">
					<strong><?php echo esc_html( $how ); ?></strong>
					<span class="bme-history__meta"><time datetime="<?php echo esc_attr( gmdate( 'c', $time ) ); ?>" title="<?php echo esc_attr( $when ); ?>"><?php echo esc_html( $ago ); ?></time><?php echo ! empty( $entry['user'] ) ? ' · ' . esc_html( (string) $entry['user'] ) : ''; ?></span>
					<span class="bme-history__changes">
						<?php
						if ( $changes ) {
							/* translators: %s: list of changed sections, e.g. "Rules, Timing & feel" */
							echo esc_html( sprintf( __( 'Changed: %s', 'bricks-motion-studio' ), implode( ', ', $changes ) ) );
						} else {
							esc_html_e( 'Same as the version after it.', 'bricks-motion-studio' );
						}
						?>
					</span>
				</span>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-bme-confirm="<?php echo esc_attr( sprintf( /* translators: %s: date and time */ __( 'Restore the settings as they were before the change of %s? Your current settings are kept in this list.', 'bricks-motion-studio' ), $when ) ); ?>">
					<input type="hidden" name="action" value="bme_restore">
					<input type="hidden" name="version" value="<?php echo esc_attr( (string) $i ); ?>">
					<input type="hidden" name="time" value="<?php echo esc_attr( (string) $time ); ?>">
					<?php wp_nonce_field( 'bme_restore' ); ?>
					<button class="bme-btn bme-btn--sm"><?php esc_html_e( 'Restore', 'bricks-motion-studio' ); ?></button>
				</form>
			</li>
			<?php
		}
		echo '</ol>';
	}

	/**
	 * Engines that can run a preset, with their real names (for the Reference cards).
	 *
	 * @param string $slug Preset slug.
	 * @param array  $p    Preset.
	 * @return string
	 */
	/** Plain-language explanation of each animation group (Guide). */
	private static function group_help() {
		return array(
			'reveal'  => __( 'The element appears as the visitor scrolls to it, once. Good for almost anything: cards, images, buttons, sections.', 'bricks-motion-studio' ),
			'text'    => __( 'Headings and text appear line by line, word by word or letter by letter. Best on short text such as headings.', 'bricks-motion-studio' ),
			'scroll'  => __( 'Moves with the scrollbar: forward as the visitor scrolls down, back as they scroll up. Good for depth and storytelling.', 'bricks-motion-studio' ),
			'loop'    => __( 'Keeps moving gently to draw the eye (it pauses when off screen, and visitors can pause it with the Pause animations button). Use sparingly.', 'bricks-motion-studio' ),
			'special' => __( 'For numbers and line drawings.', 'bricks-motion-studio' ),
		);
	}

	/** One plain sentence per built-in animation: what it does, when to use it (Guide). */
	private static function preset_help() {
		return array(
			'fade'              => __( 'Softly appears in place. The calmest choice; works everywhere.', 'bricks-motion-studio' ),
			'fade-up'           => __( 'Appears while rising a little. The classic, for text, cards and buttons.', 'bricks-motion-studio' ),
			'fade-down'         => __( 'Appears while dropping in from slightly above.', 'bricks-motion-studio' ),
			'fade-left'         => __( 'Slides in from the right while appearing. Nice for the right column.', 'bricks-motion-studio' ),
			'fade-right'        => __( 'Slides in from the left while appearing. Nice for the left column.', 'bricks-motion-studio' ),
			'zoom-in'           => __( 'Grows from slightly smaller to full size. Good for buttons, icons and cards.', 'bricks-motion-studio' ),
			'zoom-out'          => __( 'Settles from slightly larger to full size. Good for big images.', 'bricks-motion-studio' ),
			'flip-up'           => __( 'Tips up into place like a card turning over. Playful.', 'bricks-motion-studio' ),
			'flip-left'         => __( 'Swings in from the side like a door opening.', 'bricks-motion-studio' ),
			'rotate-in'         => __( 'Turns slightly as it appears. For badges and icons.', 'bricks-motion-studio' ),
			'skew-up'           => __( 'Rises with a slight lean that straightens out. Energetic.', 'bricks-motion-studio' ),
			'blur-in'           => __( 'Comes into focus, from blurry to sharp.', 'bricks-motion-studio' ),
			'blur-up'           => __( 'Comes into focus while rising. Elegant for headings and quotes.', 'bricks-motion-studio' ),
			'clip-up'           => __( 'Revealed from the bottom up, as if a cover slides away.', 'bricks-motion-studio' ),
			'clip-down'         => __( 'Revealed from the top down.', 'bricks-motion-studio' ),
			'clip-left'         => __( 'Revealed from right to left.', 'bricks-motion-studio' ),
			'clip-right'        => __( 'Revealed from left to right.', 'bricks-motion-studio' ),
			'reveal-image'      => __( 'The image is uncovered while gently zooming. Made for photos.', 'bricks-motion-studio' ),
			'split-lines'       => __( 'Each line of text slides up from behind an invisible edge. Striking on big headings.', 'bricks-motion-studio' ),
			'split-words'       => __( 'Words appear one after another, rising a little. The go-to for headings.', 'bricks-motion-studio' ),
			'split-words-blur'  => __( 'Words come into focus one after another. Soft and premium.', 'bricks-motion-studio' ),
			'split-chars'       => __( 'Letters appear one by one. Best on a few short words.', 'bricks-motion-studio' ),
			'typewriter'        => __( 'Letters appear one at a time, as if typed.', 'bricks-motion-studio' ),
			'scramble'          => __( 'Letters shuffle like a code breaker before settling into the real text.', 'bricks-motion-studio' ),
			'scroll-highlight'  => __( 'Words light up one by one as the visitor scrolls through a paragraph. Good for a statement.', 'bricks-motion-studio' ),
			'parallax'          => __( 'Moves at a different speed than the page, for a feeling of depth. Great on background images.', 'bricks-motion-studio' ),
			'parallax-x'        => __( 'Drifts sideways as the page scrolls.', 'bricks-motion-studio' ),
			'scroll-fade'       => __( 'Fades in gradually as it scrolls up the screen.', 'bricks-motion-studio' ),
			'scroll-scale'      => __( 'Grows gradually as it scrolls up the screen.', 'bricks-motion-studio' ),
			'scroll-rotate'     => __( 'Turns slowly as the page scrolls. For decorative shapes.', 'bricks-motion-studio' ),
			'scroll-expand'     => __( 'Opens up from a smaller window to full size as it scrolls. Made for big images and videos.', 'bricks-motion-studio' ),
			'horizontal-scroll' => __( 'Scrolling down moves a row of cards sideways while the section stays in place. Put it on the section that holds the row.', 'bricks-motion-studio' ),
			'pin'               => __( 'Stays in place on screen for a while as the page scrolls past it.', 'bricks-motion-studio' ),
			'float'             => __( 'Gently bobs up and down, forever.', 'bricks-motion-studio' ),
			'pulse'             => __( 'Softly grows and shrinks, like breathing. Draws the eye to a button.', 'bricks-motion-studio' ),
			'sway'              => __( 'Rocks gently from side to side.', 'bricks-motion-studio' ),
			'spin'              => __( 'Turns round and round. For loaders and decorative shapes.', 'bricks-motion-studio' ),
			'marquee'           => __( 'An endless strip sliding sideways: logos, words, images. Pauses when hovered.', 'bricks-motion-studio' ),
			'counter'           => __( 'Numbers count up from zero to their value, e.g. 1,250 clients.', 'bricks-motion-studio' ),
			'draw-svg'          => __( 'A line drawing (an SVG icon or illustration with outlines) draws itself.', 'bricks-motion-studio' ),
		);
	}

	/** Terms used across Motion Studio, in plain words (Guide). */
	private static function glossary() {
		return array(
			__( 'Animation (preset)', 'bricks-motion-studio' ) => __( 'A ready-made movement, such as Fade up. You pick it, Motion Studio does the rest.', 'bricks-motion-studio' ),
			__( 'Auto and Custom', 'bricks-motion-studio' ) => __( 'Auto: the element follows the site-wide rules (Auto-animate). Custom: it has its own animation, set in the builder.', 'bricks-motion-studio' ),
			__( 'Recipe', 'bricks-motion-studio' )         => __( 'One choice on a section that animates everything inside it in a good order.', 'bricks-motion-studio' ),
			__( 'Engine', 'bricks-motion-studio' )         => __( 'The code that plays the animation. Built-in is the fastest and needs no download; GSAP, Anime.js and Motion are optional extras some animations need (Libraries).', 'bricks-motion-studio' ),
			__( 'Duration and delay', 'bricks-motion-studio' ) => __( 'How long the animation takes, and how long it waits before it starts, in seconds.', 'bricks-motion-studio' ),
			__( 'Stagger', 'bricks-motion-studio' )        => __( 'The small pause between items that animate one after another (cards, words). Stagger order chooses who goes first.', 'bricks-motion-studio' ),
			__( 'Easing', 'bricks-motion-studio' )         => __( 'How the movement speeds up and slows down. Smooth is a good default.', 'bricks-motion-studio' ),
			__( 'Start line', 'bricks-motion-studio' )     => __( 'How far up the screen an element must come before it animates.', 'bricks-motion-studio' ),
			__( 'Animation level', 'bricks-motion-studio' ) => __( 'Basic, Moderate or Advanced: how much movement the automatic animations use, site-wide or per page.', 'bricks-motion-studio' ),
			__( 'Timeline (keyframes)', 'bricks-motion-studio' ) => __( 'For a movement of your own: say where an element is at the start, middle and end (for example while scrolling), and Motion Studio moves it in between.', 'bricks-motion-studio' ),
			__( 'Reduced motion', 'bricks-motion-studio' ) => __( 'A setting on visitors\' devices asking for less movement. Motion Studio respects it (Accessibility).', 'bricks-motion-studio' ),
		);
	}

	/**
	 * A short note when an animation only works with an optional library (Guide).
	 *
	 * @param string $slug Preset slug.
	 * @param array  $p    Preset.
	 * @return string '' when the built-in engine plays it.
	 */
	private static function needs_library( $slug, array $p ) {
		if ( ! empty( $p['core'] ) || ! empty( $p['draw'] ) || Presets::native_ok( $slug ) ) {
			return ''; // the plugin plays it itself (line drawings draw without a library too)
		}
		$engines = Presets::engines_for( $slug );
		if ( 'scroll' === ( $p['group'] ?? '' ) && array( 'gsap' ) !== array_values( $engines ) && Settings::get( 'perf.native_scroll' ) ) {
			return __( 'Chrome, Edge and Safari 26 play it themselves; other browsers use one of the optional libraries.', 'bricks-motion-studio' );
		}
		if ( array( 'gsap' ) === array_values( $engines ) ) {
			return Settings::library_enabled( 'gsap' ) ? __( 'Uses the GSAP library (on).', 'bricks-motion-studio' ) : __( 'Needs the GSAP library: turn it on in Libraries.', 'bricks-motion-studio' );
		}
		return __( 'Uses one of the optional libraries (GSAP, Anime.js or Motion).', 'bricks-motion-studio' );
	}

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

	/**
	 * Panel heading: icon tile, title and intro.
	 *
	 * @param string $id    Panel id.
	 * @param string $title Title.
	 * @param string $intro Intro text.
	 * @param string $icon  Icon key.
	 */
	private function panel_head( $id, $title, $intro, $icon ) {
		?>
		<header class="bme-panel__head">
			<span class="bme-panel__icon" aria-hidden="true"><?php echo self::icon( $icon ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
			<div>
				<h2 id="bme-h-<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $title ); ?></h2>
				<p><?php echo esc_html( $intro ); ?></p>
			</div>
		</header>
		<?php
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
			<input type="checkbox" role="switch" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="1" <?php checked( ! empty( Settings::get( $path ) ) ); ?>>
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
					<input type="number" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( (string) Settings::get( $path ) ); ?>" min="<?php echo esc_attr( (string) $min ); ?>" max="<?php echo esc_attr( (string) $max ); ?>" step="<?php echo esc_attr( (string) $step ); ?>">
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
				<select class="bme-select" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>">
					<?php foreach ( $options as $value => $text ) : ?>
						<option value="<?php echo esc_attr( (string) $value ); ?>" <?php selected( $current, (string) $value ); ?>><?php echo esc_html( $text ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
		</div>
		<?php
	}

	private function text_row( $path, $label, $placeholder = '', $help = '', $max = 60 ) {
		$id = $this->id( $path );
		?>
		<div class="bme-row">
			<div class="bme-row__text">
				<label class="bme-row__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<?php if ( $help ) : ?><p class="bme-row__help"><?php echo esc_html( $help ); ?></p><?php endif; ?>
			</div>
			<div class="bme-row__control">
				<input type="text" class="bme-text" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( (string) Settings::get( $path ) ); ?>" placeholder="<?php echo esc_attr( $placeholder ); ?>" maxlength="<?php echo esc_attr( (string) $max ); ?>">
			</div>
		</div>
		<?php
	}

	/** A colour: hex text field (empty = automatic) with the browser's colour picker beside it. */
	private function color_row( $path, $label, $help = '' ) {
		$id    = $this->id( $path );
		$value = (string) Settings::get( $path );
		?>
		<div class="bme-row">
			<div class="bme-row__text">
				<label class="bme-row__label" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<?php if ( $help ) : ?><p class="bme-row__help"><?php echo esc_html( $help ); ?></p><?php endif; ?>
			</div>
			<div class="bme-row__control bme-color" data-bme-color>
				<input type="color" value="<?php echo esc_attr( '' !== $value ? $value : '#111111' ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: setting name */ __( '%s: pick a colour', 'bricks-motion-studio' ), $label ) ); ?>" tabindex="-1">
				<input type="text" class="bme-text bme-mono" id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( $value ); ?>" placeholder="<?php esc_attr_e( 'Automatic', 'bricks-motion-studio' ); ?>" maxlength="7" spellcheck="false" pattern="#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?">
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
					<input type="radio" name="<?php echo esc_attr( $this->name( $path ) ); ?>" value="<?php echo esc_attr( (string) $value ); ?>" <?php checked( $current, (string) $value ); ?>>
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
	private function preset_optgroups( $selected, $builtin_only = false ) {
		// A rule whose preset isn't available right now keeps it (saving must not swap it silently).
		if ( '' !== $selected && ! Presets::exists( $selected ) ) {
			/* translators: %s: preset slug. */
			printf( '<option value="%1$s" selected>%2$s</option>', esc_attr( $selected ), esc_html( sprintf( __( '%s (unavailable)', 'bricks-motion-studio' ), $selected ) ) );
		}
		$groups = Presets::group_labels();
		foreach ( $groups as $group => $group_label ) {
			echo '<optgroup label="' . esc_attr( $group_label ) . '">';
			foreach ( ( $builtin_only ? Presets::builtin() : Presets::all() ) as $slug => $p ) {
				if ( ( $p['group'] ?? '' ) !== $group ) {
					continue;
				}
				printf( '<option value="%1$s" %2$s>%3$s</option>', esc_attr( $slug ), selected( $selected, $slug, false ), esc_html( $p['label'] ) );
			}
			echo '</optgroup>';
		}
	}

	/**
	 * One "My presets" row.
	 *
	 * @param string $index Row index ('__INDEX__' in the template).
	 * @param array  $row   Saved preset.
	 */
	private function my_preset_row( $index, array $row ) {
		$base  = BME_OPTION . '[custom_presets][' . $index . ']';
		$eases = array( '' => __( 'As the preset', 'bricks-motion-studio' ) ) + Settings::eases();
		$num   = function ( $key, $label, $max, $step, $unit ) use ( $base, $row ) {
			printf(
				'<label class="bme-mine__num"><span>%1$s</span><input type="number" class="bme-text" name="%2$s" value="%3$s" min="0" max="%4$s" step="%5$s" placeholder="%6$s" inputmode="decimal"><em>%7$s</em></label>',
				esc_html( $label ),
				esc_attr( $base . '[' . $key . ']' ),
				esc_attr( isset( $row[ $key ] ) ? (string) $row[ $key ] : '' ),
				esc_attr( (string) $max ),
				esc_attr( (string) $step ),
				esc_attr__( 'auto', 'bricks-motion-studio' ),
				esc_html( $unit )
			);
		};
		?>
		<div class="bme-mine" data-bme-mine>
			<input type="hidden" name="<?php echo esc_attr( $base . '[slug]' ); ?>" value="<?php echo esc_attr( (string) ( $row['slug'] ?? '__SLUG__' ) ); ?>">
			<div class="bme-mine__top">
				<label class="bme-mine__field">
					<span class="bme-cap bme-cap--on"><?php esc_html_e( 'Preset name', 'bricks-motion-studio' ); ?></span>
					<input type="text" class="bme-text" name="<?php echo esc_attr( $base . '[label]' ); ?>" value="<?php echo esc_attr( (string) ( $row['label'] ?? '' ) ); ?>" placeholder="<?php esc_attr_e( 'e.g. Brand fade', 'bricks-motion-studio' ); ?>" maxlength="60">
				</label>
				<label class="bme-mine__field">
					<span class="bme-cap bme-cap--on"><?php esc_html_e( 'Based on', 'bricks-motion-studio' ); ?></span>
					<select class="bme-select" name="<?php echo esc_attr( $base . '[base]' ); ?>" data-bme-mine-base>
						<?php $this->preset_optgroups( (string) ( $row['base'] ?? 'fade-up' ), true ); ?>
					</select>
				</label>
				<button type="button" class="bme-icon-btn" data-bme-preview-mine aria-label="<?php esc_attr_e( 'Preview this preset', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Preview', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				<button type="button" class="bme-icon-btn bme-icon-btn--danger" data-bme-remove-mine aria-label="<?php esc_attr_e( 'Remove preset', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Remove', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'trash' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
			</div>
			<div class="bme-mine__nums">
				<?php
				$num( 'duration', __( 'Duration', 'bricks-motion-studio' ), 10, 0.05, 's' );
				$num( 'delay', __( 'Delay', 'bricks-motion-studio' ), 10, 0.05, 's' );
				$num( 'distance', __( 'Distance', 'bricks-motion-studio' ), 400, 1, 'px' );
				$num( 'stagger', __( 'Stagger', 'bricks-motion-studio' ), 2, 0.01, 's' );
				?>
				<label class="bme-mine__num bme-mine__ease"><span><?php esc_html_e( 'Easing', 'bricks-motion-studio' ); ?></span>
					<select class="bme-select" name="<?php echo esc_attr( $base . '[ease]' ); ?>">
						<?php foreach ( $eases as $value => $label ) : ?>
							<option value="<?php echo esc_attr( $value ); ?>" <?php selected( (string) ( $row['ease'] ?? '' ), $value ); ?>><?php echo esc_html( $label ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
			</div>
			<?php
			$from   = isset( $row['from'] ) && is_array( $row['from'] ) ? $row['from'] : array();
			$fields = array(
				'opacity' => array( __( 'Opacity', 'bricks-motion-studio' ), 0.05, '' ),
				'x'       => array( __( 'Move X', 'bricks-motion-studio' ), 1, 'px' ),
				'y'       => array( __( 'Move Y', 'bricks-motion-studio' ), 1, 'px' ),
				'scale'   => array( __( 'Scale', 'bricks-motion-studio' ), 0.01, '×' ),
				'rotate'  => array( __( 'Rotate', 'bricks-motion-studio' ), 1, '°' ),
				'blur'    => array( __( 'Blur', 'bricks-motion-studio' ), 0.5, 'px' ),
			);
			?>
			<details class="bme-mine__motion" data-bme-mine-motion <?php echo $from ? 'open' : ''; ?>>
				<summary>
					<?php echo self::icon( 'wand' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					<span><?php esc_html_e( 'Shape the motion', 'bricks-motion-studio' ); ?></span>
					<span class="bme-mine__motion-count" data-bme-mine-motion-count></span>
				</summary>
				<div class="bme-mine__builder">
					<div class="bme-mine__from">
						<p class="bme-mine__hint"><?php esc_html_e( 'Where the element starts before it animates into place. Empty fields keep the base preset\'s value, shown in grey.', 'bricks-motion-studio' ); ?></p>
						<div class="bme-mine__from-grid">
							<?php foreach ( $fields as $key => $f ) : ?>
								<?php $range = Settings::MOTION_RANGES[ $key ]; ?>
								<label class="bme-mine__num">
									<span><?php echo esc_html( $f[0] ); ?></span>
									<input type="number" class="bme-text" name="<?php echo esc_attr( $base . '[from][' . $key . ']' ); ?>" value="<?php echo esc_attr( isset( $from[ $key ] ) ? (string) $from[ $key ] : '' ); ?>" min="<?php echo esc_attr( (string) $range[0] ); ?>" max="<?php echo esc_attr( (string) $range[1] ); ?>" step="<?php echo esc_attr( (string) $f[1] ); ?>" inputmode="decimal" data-bme-from="<?php echo esc_attr( $key ); ?>">
									<em><?php echo esc_html( $f[2] ); ?></em>
								</label>
							<?php endforeach; ?>
						</div>
						<button type="button" class="bme-btn bme-btn--sm" data-bme-mine-reset-motion><?php esc_html_e( 'Clear motion changes', 'bricks-motion-studio' ); ?></button>
					</div>
					<div class="bme-mine__stage" data-bme-mine-stage>
						<span class="bme-mine__card" aria-hidden="true"><i></i><i></i><i></i></span>
						<span class="bme-mine__text" aria-hidden="true" hidden></span>
						<button type="button" class="bme-icon-btn bme-mine__replay" data-bme-mine-replay aria-label="<?php esc_attr_e( 'Play again', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Play again', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
					</div>
				</div>
				<p class="bme-mine__nomotion" data-bme-mine-nomotion hidden><?php esc_html_e( 'This base preset moves with scrolling or loops: its motion can\'t be shaped here. Pick an entrance preset (fade, zoom, slide, blur, text) to shape it.', 'bricks-motion-studio' ); ?></p>
			</details>
		</div>
		<?php
	}

	/**
	 * Rule "Where" choices: page kinds and single posts of each public post type.
	 *
	 * @return array<string,string>
	 */
	private static function where_choices() {
		static $choices = null;
		if ( null === $choices ) {
			$choices = array(
				'front'    => __( 'Front page', 'bricks-motion-studio' ),
				'blog'     => __( 'Blog (posts page)', 'bricks-motion-studio' ),
				'singular' => __( 'Any single post or page', 'bricks-motion-studio' ),
			);
			foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $type ) {
				if ( 'attachment' === $type->name || 'bricks_template' === $type->name ) {
					continue;
				}
				/* translators: %s: post type name, e.g. "Posts" */
				$choices[ 'pt:' . $type->name ] = sprintf( __( 'Single: %s', 'bricks-motion-studio' ), $type->labels->name );
			}
			$choices['archive'] = __( 'Archives (categories, tags, authors…)', 'bricks-motion-studio' );
			$choices['search']  = __( 'Search results', 'bricks-motion-studio' );
			$choices['404']     = __( '404 page', 'bricks-motion-studio' );
		}
		return $choices;
	}

	/**
	 * Rule "Screens" choices (keys of Settings::SCREENS).
	 *
	 * @return array<string,string>
	 */
	private static function screen_choices() {
		return array(
			''        => __( 'All screen sizes', 'bricks-motion-studio' ),
			'desktop' => __( 'Desktop only (992px+)', 'bricks-motion-studio' ),
			'large'   => __( 'Tablet and up (768px+)', 'bricks-motion-studio' ),
			'small'   => __( 'Phone and tablet (under 992px)', 'bricks-motion-studio' ),
			'phone'   => __( 'Phone only (under 768px)', 'bricks-motion-studio' ),
		);
	}

	private function rule_row( $index, array $rule ) {
		$base    = BME_OPTION . '[auto][rules][' . $index . ']';
		$where   = (string) ( $rule['where'] ?? '' );
		$screens = (string) ( $rule['screens'] ?? '' );
		$where_c = self::where_choices();
		// A condition for a post type that no longer exists keeps its value (and says so).
		$where_b = 0 === strpos( $where, 'not:' ) ? substr( $where, 4 ) : $where;
		if ( '' !== $where_b && ! isset( $where_c[ $where_b ] ) ) {
			/* translators: %s: stored condition, e.g. pt:product */
			$where_c[ $where_b ] = sprintf( __( '%s (not available)', 'bricks-motion-studio' ), $where_b );
		}
		$has_cond = '' !== $where || '' !== $screens;
		$engines  = array(
			''       => __( 'Site default', 'bricks-motion-studio' ),
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
				<span class="bme-rule__name" data-bme-target-name aria-hidden="true"></span>
			</span>
			<span role="cell">
				<span class="bme-cap" aria-hidden="true"><?php esc_html_e( 'Preset', 'bricks-motion-studio' ); ?></span>
				<select class="bme-select" name="<?php echo esc_attr( $base . '[preset]' ); ?>" aria-label="<?php esc_attr_e( 'Preset', 'bricks-motion-studio' ); ?>" data-bme-preset>
					<?php $this->preset_optgroups( (string) ( $rule['preset'] ?? '' ) ); ?>
				</select>
			</span>
			<?php
			$scope = (string) ( $rule['scope'] ?? 'self' );
			$mode  = in_array( $scope, array( '', 'self', 'children' ), true ) ? ( 'children' === $scope ? 'children' : 'self' ) : 'inside';
			?>
			<span role="cell" class="bme-rule__scope">
				<span class="bme-cap" aria-hidden="true"><?php esc_html_e( 'Animate', 'bricks-motion-studio' ); ?></span>
				<select class="bme-select" data-bme-scope-mode aria-label="<?php esc_attr_e( 'What to animate', 'bricks-motion-studio' ); ?>">
					<option value="self" <?php selected( $mode, 'self' ); ?>><?php esc_html_e( 'The element', 'bricks-motion-studio' ); ?></option>
					<option value="children" <?php selected( $mode, 'children' ); ?>><?php esc_html_e( 'Each child, in turn', 'bricks-motion-studio' ); ?></option>
					<option value="inside" <?php selected( $mode, 'inside' ); ?>><?php esc_html_e( 'Elements inside', 'bricks-motion-studio' ); ?></option>
				</select>
				<input type="text" class="bme-text bme-mono" name="<?php echo esc_attr( $base . '[scope]' ); ?>" value="<?php echo esc_attr( 'inside' === $mode ? $scope : ( 'children' === $mode ? 'children' : 'self' ) ); ?>" placeholder=".card" aria-label="<?php esc_attr_e( 'Which elements inside: their class, e.g. .card', 'bricks-motion-studio' ); ?>" spellcheck="false" <?php echo 'inside' === $mode ? '' : 'hidden'; ?>>
			</span>
			<span role="cell">
				<span class="bme-cap" aria-hidden="true"><?php esc_html_e( 'Engine', 'bricks-motion-studio' ); ?></span>
				<select class="bme-select" name="<?php echo esc_attr( $base . '[engine]' ); ?>" aria-label="<?php esc_attr_e( 'Engine', 'bricks-motion-studio' ); ?>" data-bme-engine-select>
					<?php foreach ( $engines as $value => $label ) : ?>
						<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $rule['engine'] ?? '', $value ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</span>
			<span class="bme-rule__actions" role="cell">
				<button type="button" class="bme-icon-btn bme-rule__cond-btn<?php echo $has_cond ? ' has-cond' : ''; ?>" data-bme-rule-cond aria-expanded="<?php echo $has_cond ? 'true' : 'false'; ?>" aria-label="<?php esc_attr_e( 'Conditions', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Where and on which screens', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'filter' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				<button type="button" class="bme-icon-btn" data-bme-preview-rule aria-label="<?php esc_attr_e( 'Preview this preset', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Preview', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				<button type="button" class="bme-icon-btn bme-icon-btn--danger" data-bme-remove-rule aria-label="<?php esc_attr_e( 'Remove rule', 'bricks-motion-studio' ); ?>" title="<?php esc_attr_e( 'Remove', 'bricks-motion-studio' ); ?>"><?php echo self::icon( 'trash' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
			</span>
			<span class="bme-rule__when" role="cell" data-bme-rule-when <?php echo $has_cond ? '' : 'hidden'; ?>>
				<label class="bme-rule__cond">
					<span class="bme-rule__cond-label"><?php esc_html_e( 'Where', 'bricks-motion-studio' ); ?></span>
					<select class="bme-select" name="<?php echo esc_attr( $base . '[where]' ); ?>" data-bme-rule-where>
						<option value="" <?php selected( $where, '' ); ?>><?php esc_html_e( 'Everywhere', 'bricks-motion-studio' ); ?></option>
						<optgroup label="<?php esc_attr_e( 'Only on', 'bricks-motion-studio' ); ?>">
							<?php foreach ( $where_c as $value => $label ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $where, $value ); ?>><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</optgroup>
						<optgroup label="<?php esc_attr_e( 'Everywhere except', 'bricks-motion-studio' ); ?>">
							<?php foreach ( $where_c as $value => $label ) : ?>
								<?php /* translators: %s: page kind, e.g. "Front page" */ ?>
								<option value="<?php echo esc_attr( 'not:' . $value ); ?>" <?php selected( $where, 'not:' . $value ); ?>><?php echo esc_html( sprintf( __( 'Not: %s', 'bricks-motion-studio' ), $label ) ); ?></option>
							<?php endforeach; ?>
						</optgroup>
					</select>
				</label>
				<label class="bme-rule__cond">
					<span class="bme-rule__cond-label"><?php esc_html_e( 'Screens', 'bricks-motion-studio' ); ?></span>
					<select class="bme-select" name="<?php echo esc_attr( $base . '[screens]' ); ?>" data-bme-rule-screens>
						<?php foreach ( self::screen_choices() as $value => $label ) : ?>
							<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $screens, $value ); ?>><?php echo esc_html( $label ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
				<span class="bme-rule__cond-note"><?php esc_html_e( 'Elsewhere the next matching rule applies. On other screens the element shows as designed.', 'bricks-motion-studio' ); ?></span>
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
			'note'   => __( 'Every Bricks element has the Motion Studio settings in the builder.', 'bricks-motion-studio' ),
		);

		// PHP drops form fields past max_input_vars: a long rule list could be cut off on save.
		$max_vars = (int) ini_get( 'max_input_vars' );
		$needed   = 80 + 10 * count( (array) Settings::get( 'auto.rules', array() ) ) + 14 * count( (array) Settings::get( 'custom_presets', array() ) );
		if ( $max_vars > 0 ) {
			$checks[] = array(
				'label'  => __( 'Form size limit', 'bricks-motion-studio' ),
				/* translators: 1: fields the settings form sends, 2: PHP max_input_vars */
				'value'  => sprintf( __( '%1$d of %2$d fields', 'bricks-motion-studio' ), $needed, $max_vars ),
				'status' => $needed < $max_vars * 0.8 ? 'ok' : ( $needed < $max_vars ? 'warn' : 'fail' ),
				'note'   => __( 'Your server limits how many settings one save can hold (PHP max_input_vars). Each rule uses 10 and each of My presets 14; before adding many more, ask your host to raise the limit.', 'bricks-motion-studio' ),
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
			'note'   => $missing ? implode( ', ', $missing ) : __( 'The libraries come with the plugin in a fixed version, so an outside update can never change your site by surprise.', 'bricks-motion-studio' ),
		);

		$checks[] = array(
			'label'  => __( 'Script loading', 'bricks-motion-studio' ),
			'value'  => version_compare( $wp_version, '6.3', '>=' ) ? __( 'Deferred', 'bricks-motion-studio' ) : __( 'Footer', 'bricks-motion-studio' ),
			'status' => 'ok',
			'note'   => __( 'Animation files load at the end of the page without slowing it down, and only on pages that use them.', 'bricks-motion-studio' ),
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

		$s      = Settings::all();
		$meta   = Libraries::meta();
		$eases  = Settings::eases();
		$checks = self::system_checks();
		$issues = count(
			array_filter(
				$checks,
				static function ( $c ) {
					return 'ok' !== $c['status'];
				}
			)
		);
		// Navigation, in groups: group label => panel id => [ label, icon ].
		$nav     = array(
			''                                        => array(
				'overview' => array( __( 'Overview', 'bricks-motion-studio' ), 'overview' ),
			),
			__( 'Set up', 'bricks-motion-studio' )    => array(
				'libraries' => array( __( 'Libraries', 'bricks-motion-studio' ), 'libraries' ),
				'auto'      => array( __( 'Auto-animate', 'bricks-motion-studio' ), 'auto' ),
				'features'  => array( __( 'Features', 'bricks-motion-studio' ), 'stack' ),
			),
			__( 'Fine-tune', 'bricks-motion-studio' ) => array(
				'defaults' => array( __( 'Timing & feel', 'bricks-motion-studio' ), 'defaults' ),
				'scroll3d' => array( __( 'Scroll & 3D', 'bricks-motion-studio' ), 'scroll3d' ),
				'effects'  => array( __( 'Effects', 'bricks-motion-studio' ), 'sparkles' ),
				'a11y'     => array( __( 'Accessibility', 'bricks-motion-studio' ), 'a11y' ),
			),
			__( 'Resources', 'bricks-motion-studio' ) => array(
				'usage'  => array( __( 'Usage', 'bricks-motion-studio' ), 'chart' ),
				'system' => array( __( 'System', 'bricks-motion-studio' ), 'tools' ),
				'help'   => array( __( 'Guide', 'bricks-motion-studio' ), 'help' ),
			),
		);
		$passed  = count( $checks ) - $issues;
		$status  = self::status_labels();
		$builtin = count( Presets::builtin() );
		$engines = array(
			'gsap'   => 'GSAP',
			'anime'  => 'Anime.js',
			'motion' => 'Motion',
		);
		$rules   = array_values( (array) $s['auto']['rules'] );

		// A damaged status value shows as Live, the value it acts as.
		$s['status'] = Settings::status();
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
					<span class="bme-pill" data-bme-status-pill data-status="<?php echo esc_attr( (string) $s['status'] ); ?>"><i aria-hidden="true"></i><span><?php echo esc_html( $status[ $s['status'] ][0] ?? '' ); ?></span></span>
					<p class="bme-bar__summary" data-bme-summary></p>
					<div class="bme-bar__actions">
						<button type="button" class="bme-btn bme-btn--search" data-bme-palette aria-haspopup="dialog" aria-keyshortcuts="/">
							<?php echo self::icon( 'search' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
							<span><?php esc_html_e( 'Search', 'bricks-motion-studio' ); ?></span>
							<kbd class="bme-kbd" aria-hidden="true">/</kbd>
						</button>
						<span class="bme-bar__state" data-bme-state role="status"><?php esc_html_e( 'All changes saved', 'bricks-motion-studio' ); ?></span>
						<button type="submit" form="bme-form" class="bme-btn bme-btn--primary" data-bme-save>
							<?php esc_html_e( 'Save', 'bricks-motion-studio' ); ?>
							<kbd class="bme-kbd" aria-hidden="true" data-bme-kbd><?php echo esc_html_x( 'Ctrl S', 'keyboard shortcut', 'bricks-motion-studio' ); ?></kbd>
						</button>
					</div>
				</header>

				<div class="bme-shell">
					<nav class="bme-nav" aria-label="<?php esc_attr_e( 'Motion Studio settings', 'bricks-motion-studio' ); ?>">
						<?php foreach ( $nav as $group => $items ) : ?>
							<?php if ( '' !== $group ) : ?>
								<span class="bme-nav__group" aria-hidden="true"><?php echo esc_html( $group ); ?></span>
							<?php endif; ?>
							<?php foreach ( $items as $id => $panel ) : ?>
								<a class="bme-nav__item" href="#<?php echo esc_attr( $id ); ?>" data-bme-nav="<?php echo esc_attr( $id ); ?>">
									<?php echo self::icon( $panel[1] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
									<span><?php echo esc_html( $panel[0] ); ?></span>
									<?php if ( 'system' === $id && $issues ) : ?>
										<span class="bme-nav__badge"><span aria-hidden="true"><?php echo esc_html( (string) $issues ); ?></span><span class="screen-reader-text">
											<?php
											/* translators: %d: number of system checks that need attention */
											echo esc_html( sprintf( _n( '%d issue', '%d issues', (int) $issues, 'bricks-motion-studio' ), (int) $issues ) );
											?>
										</span></span>
									<?php endif; ?>
								</a>
							<?php endforeach; ?>
						<?php endforeach; ?>
						<a class="bme-nav__site" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">
							<?php echo self::icon( 'eye' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
							<span><?php esc_html_e( 'View site', 'bricks-motion-studio' ); ?><span class="screen-reader-text"> <?php esc_html_e( '(opens in a new tab)', 'bricks-motion-studio' ); ?></span></span>
						</a>
					</nav>

					<main class="bme-main">
						<form id="bme-form" method="post" action="options.php" novalidate>
							<?php settings_fields( self::GROUP ); ?>

							<!-- Overview -->
							<section class="bme-panel bme-panel--overview" id="bme-panel-overview" data-bme-panel="overview" aria-labelledby="bme-h-overview">
								<div class="bme-hero">
									<div class="bme-hero__text">
										<span class="bme-eyebrow"><?php esc_html_e( 'Overview', 'bricks-motion-studio' ); ?></span>
										<h2 id="bme-h-overview"><?php esc_html_e( 'Motion for every Bricks element', 'bricks-motion-studio' ); ?></h2>
										<p><?php esc_html_e( 'Animate the whole site in one go with Auto-animate, then fine-tune any element in Bricks under Motion Studio. The Guide explains everything in plain words.', 'bricks-motion-studio' ); ?></p>
										<div class="bme-hero__actions">
											<a class="bme-btn bme-btn--light" href="#auto" data-bme-go="auto"><?php echo self::icon( 'auto' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Auto-animate rules', 'bricks-motion-studio' ); ?></a>
											<a class="bme-btn bme-btn--glass" href="#help" data-bme-go="help"><?php esc_html_e( 'Open the Guide', 'bricks-motion-studio' ); ?><?php echo self::icon( 'arrow' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></a>
										</div>
									</div>
									<div class="bme-hero__art" aria-hidden="true">
										<span class="bme-hero__card"><i></i><i></i><i></i></span>
										<span class="bme-hero__card"><i></i><i></i><i></i></span>
										<span class="bme-hero__card"><i></i><i></i><i></i></span>
									</div>
								</div>

								<div class="bme-stats">
									<a class="bme-stat" href="#libraries" data-bme-go="libraries">
										<span class="bme-stat__icon" aria-hidden="true"><?php echo self::icon( 'libraries' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
										<span class="bme-stat__label"><?php esc_html_e( 'Libraries on', 'bricks-motion-studio' ); ?></span>
										<strong class="bme-stat__value" data-bme-stat="libs">0</strong>
										<span class="bme-stat__note" data-bme-stat-note="libs"></span>
									</a>
									<a class="bme-stat" href="#auto" data-bme-go="auto">
										<span class="bme-stat__icon" aria-hidden="true"><?php echo self::icon( 'auto' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
										<span class="bme-stat__label"><?php esc_html_e( 'Active rules', 'bricks-motion-studio' ); ?></span>
										<strong class="bme-stat__value" data-bme-stat="rules">0</strong>
										<span class="bme-stat__note" data-bme-stat-note="rules"></span>
									</a>
									<a class="bme-stat" href="#help" data-bme-go="help">
										<span class="bme-stat__icon" aria-hidden="true"><?php echo self::icon( 'sparkles' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
										<span class="bme-stat__label"><?php esc_html_e( 'Presets', 'bricks-motion-studio' ); ?></span>
										<strong class="bme-stat__value" data-bme-stat="presets" data-builtin="<?php echo esc_attr( (string) $builtin ); ?>"><?php echo esc_html( (string) $builtin ); ?></strong>
										<span class="bme-stat__note" data-bme-stat-note="presets"></span>
									</a>
									<a class="bme-stat" href="#system" data-bme-go="system">
										<span class="bme-stat__icon" aria-hidden="true"><?php echo self::icon( 'shield' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
										<span class="bme-stat__label"><?php esc_html_e( 'System checks', 'bricks-motion-studio' ); ?></span>
										<strong class="bme-stat__value"><?php echo esc_html( $passed . '/' . count( $checks ) ); ?></strong>
										<span class="bme-stat__note <?php echo $issues ? 'is-warn' : 'is-ok'; ?>"><?php echo $issues ? esc_html( sprintf( /* translators: %d: number of checks */ _n( '%d needs attention', '%d need attention', (int) $issues, 'bricks-motion-studio' ), (int) $issues ) ) : esc_html__( 'All passed', 'bricks-motion-studio' ); ?></span>
									</a>
								</div>

								<div class="bme-overview">
									<div class="bme-card">
										<h3 class="bme-card__title"><?php echo self::icon( 'gauge' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Site status', 'bricks-motion-studio' ); ?></h3>
										<fieldset class="bme-status">
											<legend class="screen-reader-text"><?php esc_html_e( 'Who sees animations', 'bricks-motion-studio' ); ?></legend>
											<?php foreach ( $status as $value => $text ) : ?>
												<label class="bme-status__opt" data-status="<?php echo esc_attr( $value ); ?>">
													<input type="radio" name="<?php echo esc_attr( $this->name( 'status' ) ); ?>" value="<?php echo esc_attr( $value ); ?>" <?php checked( $s['status'], $value ); ?>>
													<span class="bme-status__dot" aria-hidden="true"></span>
													<span class="bme-status__text"><strong><?php echo esc_html( $text[0] ); ?></strong><span><?php echo esc_html( $text[1] ); ?></span></span>
												</label>
											<?php endforeach; ?>
										</fieldset>
										<div class="bme-card__field">
											<label class="bme-row__label" for="bme-perf-off_paths"><?php esc_html_e( 'Turn off on these pages', 'bricks-motion-studio' ); ?></label>
											<p class="bme-row__help" id="bme-off-paths-help"><?php esc_html_e( 'One page address per line, the part after your domain, e.g. /checkout/. End with * for a whole section, e.g. /shop/*. These pages get no animations and no Motion Studio files at all.', 'bricks-motion-studio' ); ?></p>
											<textarea id="bme-perf-off_paths" class="bme-textarea bme-mono" name="<?php echo esc_attr( $this->name( 'perf.off_paths' ) ); ?>" rows="3" spellcheck="false" aria-describedby="bme-off-paths-help" placeholder="/checkout/&#10;/my-account/*"><?php echo esc_textarea( (string) $s['perf']['off_paths'] ); ?></textarea>
										</div>
										<div class="bme-card__switch">
											<?php $this->switch_row( 'admin_bar', __( 'Motion Studio in the admin bar', 'bricks-motion-studio' ), __( 'On the frontend: the page\'s status, a link to view it without animations, and these settings.', 'bricks-motion-studio' ) ); ?>
										</div>
									</div>

									<div class="bme-card">
										<h3 class="bme-card__title"><?php echo self::icon( 'bolt' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Quick start', 'bricks-motion-studio' ); ?></h3>
										<ol class="bme-guide-steps">
											<li data-bme-step="libs">
												<span class="bme-steps__num" aria-hidden="true"></span>
												<span class="bme-steps__text"><strong><?php esc_html_e( 'Choose your libraries', 'bricks-motion-studio' ); ?></strong><?php esc_html_e( 'GSAP can play every animation. Anime.js and Motion are optional alternatives.', 'bricks-motion-studio' ); ?></span>
												<a href="#libraries" data-bme-go="libraries" class="bme-steps__go"><?php esc_html_e( 'Libraries', 'bricks-motion-studio' ); ?></a>
											</li>
											<li data-bme-step="auto">
												<span class="bme-steps__num" aria-hidden="true"></span>
												<span class="bme-steps__text"><strong><?php esc_html_e( 'Let rules do the work', 'bricks-motion-studio' ); ?></strong><?php esc_html_e( 'Headings, images and text animate across the site, with no clicks per element.', 'bricks-motion-studio' ); ?></span>
												<a href="#auto" data-bme-go="auto" class="bme-steps__go"><?php esc_html_e( 'Rules', 'bricks-motion-studio' ); ?></a>
											</li>
											<li>
												<span class="bme-steps__num" aria-hidden="true"></span>
												<span class="bme-steps__text"><strong><?php esc_html_e( 'Fine-tune in Bricks', 'bricks-motion-studio' ); ?></strong><?php esc_html_e( 'In Bricks, select any element and open Motion Studio (Content tab): animations, scroll effects, hover effects and 3D.', 'bricks-motion-studio' ); ?></span>
											</li>
											<li>
												<span class="bme-steps__num" aria-hidden="true"></span>
												<span class="bme-steps__text"><strong><?php esc_html_e( 'Set the feel', 'bricks-motion-studio' ); ?></strong><?php esc_html_e( 'How fast and how far things move across the whole site, with a live preview.', 'bricks-motion-studio' ); ?></span>
												<a href="#defaults" data-bme-go="defaults" class="bme-steps__go"><?php esc_html_e( 'Timing', 'bricks-motion-studio' ); ?></a>
											</li>
										</ol>
									</div>
								</div>
							</section>

							<!-- Libraries -->
							<section class="bme-panel" id="bme-panel-libraries" data-bme-panel="libraries" aria-labelledby="bme-h-libraries" hidden>
								<?php $this->panel_head( 'libraries', __( 'Libraries', 'bricks-motion-studio' ), __( 'Libraries are optional add-ons that play some animations (the Guide says which). Turn on any of them: each page only downloads the ones it actually uses.', 'bricks-motion-studio' ), 'libraries' ); ?>

								<ul class="bme-libs">
									<?php foreach ( $meta as $lib => $info ) : ?>
										<li class="bme-lib" data-bme-lib="<?php echo esc_attr( $lib ); ?>">
											<div class="bme-lib__head">
												<span class="bme-lib__logo bme-lib__logo--<?php echo esc_attr( $lib ); ?>" aria-hidden="true"><?php echo esc_html( self::LIB_MONOGRAMS[ $lib ] ?? strtoupper( substr( $lib, 0, 1 ) ) ); ?></span>
												<p class="bme-lib__title">
													<label for="<?php echo esc_attr( $this->id( 'libraries.' . $lib ) ); ?>"><?php echo esc_html( $info['label'] ); ?></label>
													<span class="bme-lib__sub">
														<span class="bme-mono bme-lib__ver"><?php echo esc_html( Libraries::VERSIONS[ $lib ] ); ?></span>
														<span class="bme-lib__badge" data-bme-default-badge hidden><?php esc_html_e( 'Default engine', 'bricks-motion-studio' ); ?></span>
													</span>
												</p>
												<?php $this->switch_input( 'libraries.' . $lib, $info['label'] ); ?>
											</div>
											<p class="bme-lib__role"><?php echo esc_html( $info['role'] ); ?></p>
											<?php if ( 'gsap' === $lib ) : ?>
												<p class="bme-note"><?php echo self::icon( 'info' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span><?php esc_html_e( 'Free for your own and client sites, including commercial work. It is not GPL, and selling or publicly distributing a plugin that bundles it needs written consent from GSAP.', 'bricks-motion-studio' ); ?></span></p>
											<?php endif; ?>
											<p class="bme-lib__meta">
												<span><?php echo esc_html( $info['size'] ); ?></span>
												<a href="<?php echo esc_url( $info['url'] ); ?>" target="_blank" rel="noopener noreferrer"><?php echo 'gsap' === $lib ? esc_html__( 'GSAP Standard License', 'bricks-motion-studio' ) : esc_html( $info['license'] ); ?></a>
											</p>
										</li>
									<?php endforeach; ?>
								</ul>

								<div class="bme-group">
									<?php $this->switch_row( 'perf.native', __( 'Lightweight engine for simple effects', 'bricks-motion-studio' ), __( 'Most animations (things appearing, word-by-word text, loops) play with the browser\'s own animation tools: nothing extra to download, and smoother scrolling. The libraries still play what needs them (scroll effects, pinning, line drawings, scramble text, text line by line) and wherever you picked a library yourself. Recommended.', 'bricks-motion-studio' ) ); ?>
								</div>

								<div class="bme-group">
									<div class="bme-row bme-row--stack">
										<div class="bme-row__text">
											<span class="bme-row__label"><?php esc_html_e( 'Default engine', 'bricks-motion-studio' ); ?></span>
											<p class="bme-row__help"><?php esc_html_e( 'The library used when an animation needs one and you haven\'t picked one yourself. If it can\'t play an animation, another library you turned on takes over.', 'bricks-motion-studio' ); ?></p>
										</div>
										<?php $this->segmented( 'default_engine', $engines, __( 'Default engine', 'bricks-motion-studio' ), 'bme-seg--engines' ); ?>
									</div>
									<div class="bme-row bme-row--stack">
										<div class="bme-row__text">
											<span class="bme-row__label"><?php esc_html_e( 'Load libraries from', 'bricks-motion-studio' ); ?></span>
											<p class="bme-row__help"><?php esc_html_e( 'This site (recommended): the files come with the plugin, load from your own site and never change. jsDelivr: the files load from an outside server, which then sees your visitors\' IP addresses; they are checked so they can\'t be tampered with.', 'bricks-motion-studio' ); ?></p>
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
								<?php $this->panel_head( 'auto', __( 'Auto-animate', 'bricks-motion-studio' ), __( 'Rules give each kind of element an animation across the whole site, e.g. every heading: Words fade up. What you set on an element in the builder always wins.', 'bricks-motion-studio' ), 'auto' ); ?>

								<div class="bme-group">
									<?php $this->switch_row( 'auto.enabled', __( 'Animate elements automatically', 'bricks-motion-studio' ), __( 'A rule can target a kind of element (Heading) or a class you gave elements in Bricks (e.g. card); class rules come first. To leave one element out, set its Animation to Disabled in the builder.', 'bricks-motion-studio' ) ); ?>
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
									<p class="bme-choices__note"><?php esc_html_e( 'Changes how much the rules for kinds of elements move. Rules for classes keep exactly what you chose, and elements set to Custom keep their own animation. A page (Bricks page settings) or a single element can pick its own level.', 'bricks-motion-studio' ); ?></p>
								</fieldset>

								<?php // Marks the rule list as submitted, so removing every rule really clears it. ?>
								<input type="hidden" name="<?php echo esc_attr( BME_OPTION . '[auto][rules]' ); ?>" value="">
								<div class="bme-rules__tools">
									<h3 class="bme-subhead" id="bme-h-rules"><?php esc_html_e( 'Rules', 'bricks-motion-studio' ); ?></h3>
									<span class="bme-rules__count" data-bme-rule-count aria-live="polite"></span>
									<label class="bme-search">
										<span class="screen-reader-text"><?php esc_html_e( 'Filter rules', 'bricks-motion-studio' ); ?></span>
										<?php echo self::icon( 'search' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
										<input type="search" class="bme-text" data-bme-rule-filter placeholder="<?php esc_attr_e( 'Filter rules', 'bricks-motion-studio' ); ?>" autocomplete="off">
									</label>
								</div>
								<p class="bme-row__help bme-rules__order"><?php esc_html_e( 'Which wins: what you set on the element in the builder, then rules for classes, then rules for kinds of elements, then the * rule (any other content).', 'bricks-motion-studio' ); ?></p>
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
										<span role="columnheader" class="screen-reader-text"><?php esc_html_e( 'Conditions', 'bricks-motion-studio' ); ?></span>
									</div>
									</div>
									<div id="bme-rules-body" role="rowgroup">
										<?php
										foreach ( $rules as $i => $rule ) {
											if ( is_array( $rule ) ) { // a corrupted row must not take the whole screen down
												$this->rule_row( $i, $rule );
											}
										}
										?>
									</div>
									</div>
									<p class="bme-empty" data-bme-empty <?php echo $rules ? 'hidden' : ''; ?>><?php esc_html_e( 'No rules yet. Add one to animate a kind of element (or a class) everywhere.', 'bricks-motion-studio' ); ?></p>
									<p class="bme-empty" data-bme-filter-empty hidden><?php esc_html_e( 'No rules match the filter.', 'bricks-motion-studio' ); ?></p>
									<div class="bme-rules__foot">
										<button type="button" class="bme-btn" data-bme-add-rule><?php echo self::icon( 'plus' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Add rule', 'bricks-motion-studio' ); ?></button>
										<span class="bme-rules__hint"><?php esc_html_e( 'Animate: the element itself, its children one after another, or only some elements inside it (by their class).', 'bricks-motion-studio' ); ?></span>
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

								<h3 class="bme-subhead"><?php esc_html_e( 'Exclusions', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'The automatic rules leave these alone. Elements you set to Custom in the builder still animate.', 'bricks-motion-studio' ); ?></p>
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
											<p class="bme-row__help"><?php esc_html_e( 'Classes or IDs as written in Bricks, separated by commas (e.g. .no-motion, #pricing). Sliders, off-canvas panels and menus are already left alone.', 'bricks-motion-studio' ); ?></p>
										</div>
										<textarea id="bme-auto-exclude" class="bme-textarea bme-mono" name="<?php echo esc_attr( $this->name( 'auto.exclude' ) ); ?>" rows="3" spellcheck="false"><?php echo esc_textarea( (string) $s['auto']['exclude'] ); ?></textarea>
									</div>
								</div>
							</section>

							<!-- Timing & feel -->
							<section class="bme-panel" id="bme-panel-defaults" data-bme-panel="defaults" aria-labelledby="bme-h-defaults" hidden>
								<?php $this->panel_head( 'defaults', __( 'Timing & feel', 'bricks-motion-studio' ), __( 'Defaults for the whole site; a single animation or element can have its own. Changes play in the preview as you type.', 'bricks-motion-studio' ), 'defaults' ); ?>

								<div class="bme-split">
									<div>
										<div class="bme-group">
											<?php
											$this->number_row( 'defaults.pace', __( 'Animation speed', 'bricks-motion-studio' ), 0.25, 4, 0.05, 'x', __( 'Makes every animation faster or slower across the site: 2 is twice as fast, 0.5 half speed. Scroll effects still follow the scrollbar.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.duration', __( 'Duration', 'bricks-motion-studio' ), 0, 10, 0.05, 's' );
											$this->number_row( 'defaults.delay', __( 'Delay', 'bricks-motion-studio' ), 0, 10, 0.05, 's' );
											$this->select_row( 'defaults.ease', __( 'Easing', 'bricks-motion-studio' ), $eases );
											$this->number_row( 'defaults.distance', __( 'Travel distance', 'bricks-motion-studio' ), 0, 400, 1, 'px' );
											?>
										</div>
										<div class="bme-group">
											<?php
											$this->number_row( 'defaults.stagger', __( 'Stagger', 'bricks-motion-studio' ), 0, 2, 0.01, 's', __( 'Between children and between words or letters.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.batch', __( 'Cascade', 'bricks-motion-studio' ), 0, 1, 0.01, 's', __( 'The pause between separate elements that come into view together, like cards in a grid.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.offset', __( 'Start line', 'bricks-motion-studio' ), 0, 50, 1, '%', __( 'How far up the screen an element must come before it animates.', 'bricks-motion-studio' ) );
											$this->number_row( 'defaults.speed', __( 'Parallax strength', 'bricks-motion-studio' ), -2, 2, 0.05, '', __( 'How far parallax elements drift while scrolling. Negative values drift the other way.', 'bricks-motion-studio' ) );
											$this->switch_row( 'defaults.replay', __( 'Replay when scrolled back into view', 'bricks-motion-studio' ) );
											?>
										</div>

										<h3 class="bme-subhead" id="bme-h-mine"><?php esc_html_e( 'My presets', 'bricks-motion-studio' ); ?></h3>
										<p class="bme-row__help"><?php esc_html_e( 'An animation with your own timing, saved under your name. It appears in every animation list (rules here and Motion Studio in Bricks). Empty fields keep the original animation\'s values and the defaults above.', 'bricks-motion-studio' ); ?></p>
										<?php // Marks the list as submitted, so removing every preset really clears it. ?>
										<input type="hidden" name="<?php echo esc_attr( BME_OPTION . '[custom_presets]' ); ?>" value="">
										<div id="bme-mine-body" aria-labelledby="bme-h-mine">
											<?php
											foreach ( array_values( (array) $s['custom_presets'] ) as $i => $row ) {
												$this->my_preset_row( (string) $i, (array) $row );
											}
											?>
										</div>
										<p class="bme-empty" data-bme-mine-empty <?php echo $s['custom_presets'] ? 'hidden' : ''; ?>><?php esc_html_e( 'No presets of your own yet.', 'bricks-motion-studio' ); ?></p>
										<button type="button" class="bme-btn" data-bme-add-mine><?php echo self::icon( 'plus' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Add preset', 'bricks-motion-studio' ); ?></button>
										<template id="bme-mine-template"><?php $this->my_preset_row( '__INDEX__', array() ); ?></template>
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
								<?php $this->panel_head( 'scroll3d', __( 'Scroll & 3D', 'bricks-motion-studio' ), __( 'Scroll effects, smooth scrolling and the quality of 3D backgrounds.', 'bricks-motion-studio' ), 'scroll3d' ); ?>

								<h3 class="bme-subhead"><?php esc_html_e( 'Scroll effects', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php $this->switch_row( 'perf.native_scroll', __( 'Run on the browser\'s scroll timeline', 'bricks-motion-studio' ), __( 'Parallax and the other scroll effects use the browser\'s built-in scroll tools where it has them (Chrome, Edge, Safari 26): smoother, especially on busy pages. Other browsers use your animation library as before. Needs Lightweight engine for simple effects (Libraries). Recommended.', 'bricks-motion-studio' ) ); ?>
								</div>

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
									$this->number_row( 'three.dpr', __( '3D sharpness limit', 'bricks-motion-studio' ), 0.5, 3, 0.25, 'x', __( 'How sharp 3D is drawn on very sharp screens. 1.5 balances quality and battery life.', 'bricks-motion-studio' ) );
									$this->switch_row( 'three.mobile', __( 'Render on phones', 'bricks-motion-studio' ), __( 'When off, phones show the poster image or section background.', 'bricks-motion-studio' ) );
									?>
								</div>
							</section>

							<!-- Effects -->
							<section class="bme-panel" id="bme-panel-effects" data-bme-panel="effects" aria-labelledby="bme-h-effects" hidden>
								<?php $this->panel_head( 'effects', __( 'Effects', 'bricks-motion-studio' ), __( 'Site-wide touches: page transitions, an intro, a custom cursor and scroll progress. Visitors who prefer reduced motion get none of the movement.', 'bricks-motion-studio' ), 'sparkles' ); ?>

								<h3 class="bme-subhead"><?php esc_html_e( 'Page transitions', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'Animated navigation between pages of this site, by the browser itself (Chrome, Edge and Safari 18.2 and newer; other browsers simply open the page). In the builder, give an element and an element on another page the same Page transition name (Motion Studio → Extras) and it morphs between them.', 'bricks-motion-studio' ); ?></p>
								<div class="bme-group">
									<?php
									$this->select_row(
										'effects.transition',
										__( 'Transition', 'bricks-motion-studio' ),
										array(
											'off'   => __( 'Off', 'bricks-motion-studio' ),
											'fade'  => __( 'Cross-fade', 'bricks-motion-studio' ),
											'slide' => __( 'Slide', 'bricks-motion-studio' ),
											'zoom'  => __( 'Zoom', 'bricks-motion-studio' ),
										)
									);
									$this->number_row( 'effects.transition_duration', __( 'Duration', 'bricks-motion-studio' ), 0.1, 1.5, 0.05, 's' );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Page intro', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'A short full-screen intro that clears itself after about a second, even if something blocks the page\'s scripts. It never makes visitors wait.', 'bricks-motion-studio' ); ?></p>
								<div class="bme-group">
									<?php
									$this->select_row(
										'effects.intro',
										__( 'Intro', 'bricks-motion-studio' ),
										array(
											'off'     => __( 'Off', 'bricks-motion-studio' ),
											'fade'    => __( 'Fade out', 'bricks-motion-studio' ),
											'curtain' => __( 'Curtain up', 'bricks-motion-studio' ),
										)
									);
									$this->text_row( 'effects.intro_text', __( 'Text', 'bricks-motion-studio' ), get_bloginfo( 'name' ), __( 'Shown in the middle, e.g. your name. Empty: just the colour.', 'bricks-motion-studio' ), 40 );
									$this->color_row( 'effects.intro_color', __( 'Background', 'bricks-motion-studio' ), __( 'The text picks black or white to suit it.', 'bricks-motion-studio' ) );
									$this->switch_row( 'effects.intro_every', __( 'On every page', 'bricks-motion-studio' ), __( 'Off: only the first page of a visit.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Custom cursor', 'bricks-motion-studio' ); ?></h3>
								<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'On computers with a mouse only. It grows over links and buttons, and shows the Cursor label set on an element in the builder (Motion Studio → Extras), e.g. View on a card.', 'bricks-motion-studio' ); ?></p>
								<div class="bme-group">
									<?php
									$this->select_row(
										'effects.cursor',
										__( 'Cursor', 'bricks-motion-studio' ),
										array(
											'off'  => __( 'Off', 'bricks-motion-studio' ),
											'dot'  => __( 'Dot', 'bricks-motion-studio' ),
											'ring' => __( 'Ring (trails the pointer)', 'bricks-motion-studio' ),
											'both' => __( 'Dot and ring', 'bricks-motion-studio' ),
										)
									);
									$this->color_row( 'effects.cursor_color', __( 'Colour', 'bricks-motion-studio' ), __( 'Automatic: inverts what is underneath, so it shows on light and dark.', 'bricks-motion-studio' ) );
									$this->switch_row( 'effects.cursor_hide', __( 'Hide the system cursor', 'bricks-motion-studio' ), __( 'Text fields keep their text cursor.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Scroll progress', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php $this->switch_row( 'effects.page_progress', __( 'Page progress variable', 'bricks-motion-studio' ), __( 'For designers who write their own CSS: a number that goes from 0 at the top of the page to 1 at the bottom while scrolling (--bme-page-progress), e.g. for a reading progress bar: transform: scaleX(var(--bme-page-progress)). For single elements: Scroll progress variable in the builder (Motion Studio, Extras).', 'bricks-motion-studio' ) ); ?>
								</div>
							</section>

							<!-- Features -->
							<section class="bme-panel" id="bme-panel-features" data-bme-panel="features" aria-labelledby="bme-h-features" hidden>
								<?php $this->panel_head( 'features', __( 'Features', 'bricks-motion-studio' ), __( 'Switch any feature off for the whole site. Elements that use it then show as designed; their builder settings are kept, so switching it back on restores them. Libraries, auto-animate and the Effects each have their own switch in their panels.', 'bricks-motion-studio' ), 'stack' ); ?>

								<h3 class="bme-subhead"><?php esc_html_e( 'Animations', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'features.timeline', __( 'Timeline (keyframes)', 'bricks-motion-studio' ), __( 'Your own movements set on elements in the builder (Timeline): while scrolling, when in view, on hover, on click or looping.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.recipes', __( 'Animation recipes', 'bricks-motion-studio' ), __( 'Hero intro, card grid, gallery and the other recipes on sections. Off: the elements inside follow the auto-animate rules again.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.click', __( 'Start when clicked', 'bricks-motion-studio' ), __( 'Off: animations set to start when clicked play when scrolled into view instead (nothing waits hidden).', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.stagger_order', __( 'Stagger order', 'bricks-motion-studio' ), __( 'From the last, center, edges, random. Off: every cascade runs first to last.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.boost', __( 'Marquee: speed up with scrolling', 'bricks-motion-studio' ), __( 'Off: marquees keep their own speed.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Hover and pointer', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'features.hover', __( 'Hover effects', 'bricks-motion-studio' ), __( 'Lift, grow, magnetic and 3D tilt.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.roll', __( 'Text roll', 'bricks-motion-studio' ), __( 'Letters that roll up on hover.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.mouse', __( 'Move with the pointer', 'bricks-motion-studio' ), __( 'Layers that shift as the pointer moves.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.follow', __( 'Image that follows the pointer', 'bricks-motion-studio' ), __( 'Hover previews next to the pointer.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Scroll', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'features.skew', __( 'Skew with scroll speed', 'bricks-motion-studio' ), __( 'Elements that lean while the page scrolls fast.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.inview', __( 'Class when in view', 'bricks-motion-studio' ), __( 'A class added to elements when they scroll into view, for designers who style it with their own CSS.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.progress', __( 'Element scroll progress variable', 'bricks-motion-studio' ), __( 'A scroll value (0 to 1) on single elements, for your own CSS. The page-wide one is in Effects.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Elements', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'features.lottie', __( 'Lottie animation element', 'bricks-motion-studio' ), __( 'Off: each Lottie element shows its still frame.', 'bricks-motion-studio' ) );
									$this->switch_row( 'features.sequence', __( 'Image sequence element', 'bricks-motion-studio' ), __( 'Off: each sequence shows its still frame.', 'bricks-motion-studio' ) );
									?>
								</div>
								<p class="bme-row__help"><?php esc_html_e( 'One element only: set its Animation to Disabled, or use Turn off on for some screen sizes (Motion Studio group in the builder).', 'bricks-motion-studio' ); ?></p>
							</section>

							<!-- Accessibility & performance -->
							<section class="bme-panel" id="bme-panel-a11y" data-bme-panel="a11y" aria-labelledby="bme-h-a11y" hidden>
								<?php $this->panel_head( 'a11y', __( 'Accessibility', 'bricks-motion-studio' ), __( 'Visitors who prefer less motion, screen sizes, and keeping content visible when something goes wrong.', 'bricks-motion-studio' ), 'a11y' ); ?>

								<fieldset class="bme-choices">
									<legend class="bme-row__label bme-legend"><?php esc_html_e( 'Visitors who prefer reduced motion', 'bricks-motion-studio' ); ?></legend>
									<?php
									$reduced = array(
										'respect' => array( __( 'No animation', 'bricks-motion-studio' ), __( 'Content appears straight away, without movement; effects tied to the scrollbar still follow it. Recommended.', 'bricks-motion-studio' ) ),
										'fade'    => array( __( 'Gentle fades', 'bricks-motion-studio' ), __( 'Content softly fades in instead of moving; effects tied to the scrollbar still follow it.', 'bricks-motion-studio' ) ),
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

								<h3 class="bme-subhead"><?php esc_html_e( 'Screen sizes', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->number_row( 'a11y.min_width', __( 'Turn animations off below', 'bricks-motion-studio' ), 0, 4000, 1, 'px', __( '0 keeps animations on every screen size. Single elements can also be turned off for phone, tablet or desktop in the builder.', 'bricks-motion-studio' ) );
									$this->switch_row( 'perf.clip_x', __( 'No sideways scrolling', 'bricks-motion-studio' ), __( 'Elements sliding, zooming or rotating in near the edge of the screen can make the page wider than the window for a moment, so it wobbles sideways on phones. This clips the page at the window edge on pages with animations (sticky and pinned sections keep working). Turn off only if your page is meant to scroll sideways.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Loading and safety', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php
									$this->switch_row( 'perf.fouc', __( 'Hide elements until they animate', 'bricks-motion-studio' ), __( 'Keeps elements hidden for a split second until their animation starts, so they don\'t flash into view first. Screen readers and search engines still read everything.', 'bricks-motion-studio' ) );
									$this->number_row( 'perf.failsafe', __( 'Show everything after', 'bricks-motion-studio' ), 500, 15000, 100, 'ms', __( 'If a speed or caching plugin blocks or delays the animation files, content appears anyway after this time.', 'bricks-motion-studio' ) );
									$this->switch_row( 'perf.always', __( 'Load engines on every page', 'bricks-motion-studio' ), __( 'Only needed when other plugins or custom code add content to the page after it has loaded. Usually best off.', 'bricks-motion-studio' ) );
									?>
								</div>

								<h3 class="bme-subhead"><?php esc_html_e( 'Developer', 'bricks-motion-studio' ); ?></h3>
								<div class="bme-group">
									<?php $this->switch_row( 'debug', __( 'Debug mode', 'bricks-motion-studio' ), __( 'For troubleshooting: writes what Motion Studio does to the browser\'s developer console and shows the scroll start lines. Turn off on live sites. To see every animation on a page with a label, use Inspect animations in the Motion menu of the admin bar.', 'bricks-motion-studio' ) ); ?>
								</div>
							</section>
						</form>

						<!-- System (separate forms: import / reset) -->
						<section class="bme-panel" id="bme-panel-system" data-bme-panel="system" aria-labelledby="bme-h-system" hidden>
							<?php $this->panel_head( 'system', __( 'System', 'bricks-motion-studio' ), __( 'Compatibility checks, backup and restore.', 'bricks-motion-studio' ), 'tools' ); ?>

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

							<h3 class="bme-subhead" id="bme-h-history"><?php esc_html_e( 'Recent changes', 'bricks-motion-studio' ); ?></h3>
							<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'The settings as they were before each of the last saves, imports and resets. Restore one to undo a change; restoring can be undone the same way.', 'bricks-motion-studio' ); ?></p>
							<?php $this->history_list( $s ); ?>

							<h3 class="bme-subhead"><?php esc_html_e( 'Back up your settings', 'bricks-motion-studio' ); ?></h3>
							<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'Download a file with all Motion Studio settings, to keep as a backup or to set up another site the same way. Animation settings saved on elements in Bricks are part of your pages, not of this file.', 'bricks-motion-studio' ); ?></p>
							<div class="bme-actions-row">
								<button type="button" class="bme-btn bme-btn--primary" data-bme-download="<?php echo esc_attr( 'motion-studio-settings-' . sanitize_title( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) . '.json' ); ?>"><?php echo self::icon( 'download' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Download backup', 'bricks-motion-studio' ); ?></button>
								<button type="button" class="bme-btn" data-bme-copy><?php esc_html_e( 'Copy as text', 'bricks-motion-studio' ); ?></button>
							</div>
							<details class="bme-dev bme-dev--inline">
								<summary><?php esc_html_e( 'Show the settings as text', 'bricks-motion-studio' ); ?></summary>
								<textarea class="bme-textarea bme-mono" rows="6" readonly data-bme-export aria-label="<?php esc_attr_e( 'All settings as text', 'bricks-motion-studio' ); ?>"><?php echo esc_textarea( (string) Plugin::json( $s, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) ); ?></textarea>
							</details>

							<h3 class="bme-subhead"><?php esc_html_e( 'Restore from a backup', 'bricks-motion-studio' ); ?></h3>
							<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'Choose a backup file you downloaded, or paste its text, then click Restore. Only the settings in the backup change; you can undo it in Recent changes.', 'bricks-motion-studio' ); ?></p>
							<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="bme-restore">
								<input type="hidden" name="action" value="bme_import">
								<?php wp_nonce_field( 'bme_import' ); ?>
								<label class="bme-btn bme-file">
									<?php echo self::icon( 'upload' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Choose backup file', 'bricks-motion-studio' ); ?>
									<input type="file" accept=".json,application/json" data-bme-import-file>
								</label>
								<label class="bme-field-label" for="bme-import-text"><?php esc_html_e( 'Or paste the backup text', 'bricks-motion-studio' ); ?></label>
								<textarea id="bme-import-text" class="bme-textarea bme-mono" name="bme_import" rows="3" aria-describedby="bme-import-msg" spellcheck="false" data-bme-import></textarea>
								<p class="bme-field-msg" id="bme-import-msg" data-bme-import-msg role="status"></p>
								<div class="bme-actions-row">
									<button class="bme-btn bme-btn--primary" data-bme-import-submit><?php esc_html_e( 'Restore', 'bricks-motion-studio' ); ?></button>
								</div>
							</form>

							<h3 class="bme-subhead"><?php esc_html_e( 'Copy your animations to another site', 'bricks-motion-studio' ); ?></h3>
							<p class="bme-row__help bme-subhead__help"><?php esc_html_e( 'Your own presets (My presets) and the auto-animate rules as one code. Copy it here and paste it on the other site, in the same place. Other settings there stay as they are.', 'bricks-motion-studio' ); ?></p>
							<div class="bme-share">
								<div class="bme-share__block">
									<label class="bme-field-label" for="bme-share-out"><?php esc_html_e( 'Your code', 'bricks-motion-studio' ); ?></label>
									<div class="bme-code">
										<textarea id="bme-share-out" class="bme-textarea bme-mono bme-textarea--code" rows="2" readonly data-bme-share-code><?php echo esc_textarea( Share::code() ); ?></textarea>
										<span class="bme-code__actions">
											<button type="button" class="bme-btn" data-bme-share-copy><?php esc_html_e( 'Copy code', 'bricks-motion-studio' ); ?></button>
										</span>
									</div>
								</div>
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="bme-share__block bme-share-in">
									<input type="hidden" name="action" value="bme_share_import">
									<?php wp_nonce_field( 'bme_share_import' ); ?>
									<label class="bme-field-label" for="bme-share-in"><?php esc_html_e( 'Paste a code from another site', 'bricks-motion-studio' ); ?></label>
									<textarea id="bme-share-in" class="bme-textarea bme-mono bme-textarea--code" name="bme_share_code" rows="2" placeholder="BMS1.…" spellcheck="false" required></textarea>
									<fieldset class="bme-share__mode">
										<legend class="screen-reader-text"><?php esc_html_e( 'How to apply it', 'bricks-motion-studio' ); ?></legend>
										<label><input type="radio" name="bme_share_mode" value="add" checked> <?php esc_html_e( 'Add to mine (keep my presets and rules)', 'bricks-motion-studio' ); ?></label>
										<label><input type="radio" name="bme_share_mode" value="replace"> <?php esc_html_e( 'Replace my presets and rules with these', 'bricks-motion-studio' ); ?></label>
									</fieldset>
									<div class="bme-actions-row">
										<button class="bme-btn bme-btn--primary"><?php esc_html_e( 'Apply code', 'bricks-motion-studio' ); ?></button>
									</div>
								</form>
							</div>

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

						<!-- Usage -->
						<section class="bme-panel" id="bme-panel-usage" data-bme-panel="usage" aria-labelledby="bme-h-usage" hidden>
							<?php $this->panel_head( 'usage', __( 'Usage & weight', 'bricks-motion-studio' ), __( 'Which pages use which animations and libraries, and how much Motion Studio has to download on each.', 'bricks-motion-studio' ), 'chart' ); ?>

							<p class="bme-row__help bme-usage__intro"><?php esc_html_e( 'Pages are recorded as they are viewed. Scan site opens your published pages, recent posts and an archive once, so the report covers the whole site. Sizes are the download sizes before your server compresses them.', 'bricks-motion-studio' ); ?></p>
							<div class="bme-usage__bar">
								<button type="button" class="bme-btn bme-btn--primary" data-bme-usage-scan><?php echo self::icon( 'search' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Scan site', 'bricks-motion-studio' ); ?></button>
								<button type="button" class="bme-btn" data-bme-usage-clear><?php esc_html_e( 'Clear report', 'bricks-motion-studio' ); ?></button>
								<span class="bme-usage__progress" data-bme-usage-progress role="status" aria-live="polite"></span>
							</div>
							<div class="bme-usage" data-bme-usage aria-live="polite"></div>
						</section>

						<!-- Reference -->
						<section class="bme-panel" id="bme-panel-help" data-bme-panel="help" aria-labelledby="bme-h-help" hidden>
							<?php $this->panel_head( 'help', __( 'Guide', 'bricks-motion-studio' ), __( 'What Motion Studio can do and where to set it, in plain words. Hover (or tap) an animation card to watch it.', 'bricks-motion-studio' ), 'help' ); ?>

							<h3 class="bme-subhead"><?php esc_html_e( 'Getting started', 'bricks-motion-studio' ); ?></h3>
							<ol class="bme-guide-steps">
								<li class="bme-guide-step">
									<strong><?php esc_html_e( 'Animate the whole site at once', 'bricks-motion-studio' ); ?></strong>
									<span><?php esc_html_e( 'Auto-animate is on from the start: headings, text, images and buttons appear smoothly as visitors scroll to them. You choose what each kind of element does in Auto-animate, and how lively it all feels with the animation level.', 'bricks-motion-studio' ); ?></span>
								</li>
								<li class="bme-guide-step">
									<strong><?php esc_html_e( 'Animate one section', 'bricks-motion-studio' ); ?></strong>
									<span><?php esc_html_e( 'In Bricks, select a section (or the block holding your cards), open the Content tab, then Motion Studio, and pick an Animation recipe: hero intro, card grid, gallery, pricing cards and more. Everything inside follows in order.', 'bricks-motion-studio' ); ?></span>
								</li>
								<li class="bme-guide-step">
									<strong><?php esc_html_e( 'Animate one element your way', 'bricks-motion-studio' ); ?></strong>
									<span><?php esc_html_e( 'Select the element, open Content, then Motion Studio, set Animation to Custom and pick one of the animations below. Change when it starts (scrolling, page load, a click), how long it takes and more. It plays on the canvas as you change it.', 'bricks-motion-studio' ); ?></span>
								</li>
								<li class="bme-guide-step">
									<strong><?php esc_html_e( 'Turn things off', 'bricks-motion-studio' ); ?></strong>
									<span><?php esc_html_e( 'One element: Animation, Disabled (or Turn off on for phones, tablets or desktops). One page: Bricks page settings, Motion Studio. One feature for the whole site: Features. Everything: Overview, Site status.', 'bricks-motion-studio' ); ?></span>
								</li>
							</ol>

							<h3 class="bme-subhead"><?php esc_html_e( 'Animations you can pick', 'bricks-motion-studio' ); ?></h3>
								<label class="bme-search bme-search--wide">
									<span class="screen-reader-text"><?php esc_html_e( 'Search animations', 'bricks-motion-studio' ); ?></span>
									<?php echo self::icon( 'search' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
									<input type="search" class="bme-text" data-bme-preset-filter placeholder="<?php esc_attr_e( 'Search: fade, words, scroll, count, image…', 'bricks-motion-studio' ); ?>" autocomplete="off">
								</label>
								<p class="bme-empty" data-bme-preset-empty hidden><?php esc_html_e( 'No animations match.', 'bricks-motion-studio' ); ?></p>

							<?php
							$group_help = self::group_help();
							$desc       = self::preset_help();
							foreach ( Presets::group_labels() as $group => $group_label ) :
								?>
								<h3 class="bme-subhead" data-bme-preset-group="<?php echo esc_attr( $group ); ?>"><?php echo esc_html( $group_label ); ?></h3>
								<?php if ( isset( $group_help[ $group ] ) ) : ?>
									<p class="bme-row__help bme-subhead__help" data-bme-preset-group="<?php echo esc_attr( $group ); ?>"><?php echo esc_html( $group_help[ $group ] ); ?></p>
								<?php endif; ?>
								<div class="bme-presets" data-bme-preset-grid="<?php echo esc_attr( $group ); ?>">
									<?php
									foreach ( Presets::all() as $slug => $p ) :
										if ( ( $p['group'] ?? '' ) !== $group ) {
											continue;
										}
										$text = $desc[ $slug ] ?? ( ! empty( $p['custom'] ) ? __( 'One of your own presets (Timing & feel, My presets).', 'bricks-motion-studio' ) : '' );
										$need = self::needs_library( $slug, $p );
										?>
										<button type="button" class="bme-preset" data-bme-demo="<?php echo esc_attr( $slug ); ?>" data-bme-search="<?php echo esc_attr( strtolower( $slug . ' ' . $p['label'] . ' ' . $group_label . ' ' . $text . ' ' . self::engine_list( $slug, $p ) ) ); ?>">
											<span class="bme-preset__stage" aria-hidden="true"><span class="bme-preset__shape">Aa</span></span>
											<span class="bme-preset__name"><?php echo esc_html( $p['label'] ); ?></span>
											<?php if ( '' !== $text ) : ?>
												<span class="bme-preset__desc"><?php echo esc_html( $text ); ?></span>
											<?php endif; ?>
											<?php if ( '' !== $need ) : ?>
												<span class="bme-preset__need"><?php echo esc_html( $need ); ?></span>
											<?php endif; ?>
											<span class="bme-preset__slug"><?php esc_html_e( 'Code name:', 'bricks-motion-studio' ); ?> <code><?php echo esc_html( $slug ); ?></code></span>
										</button>
									<?php endforeach; ?>
								</div>
							<?php endforeach; ?>

							<h3 class="bme-subhead"><?php esc_html_e( 'Words you will see', 'bricks-motion-studio' ); ?></h3>
							<dl class="bme-glossary">
								<?php foreach ( self::glossary() as $term => $meaning ) : ?>
									<div><dt><?php echo esc_html( $term ); ?></dt><dd><?php echo esc_html( $meaning ); ?></dd></div>
								<?php endforeach; ?>
							</dl>

							<details class="bme-dev">
								<summary><?php esc_html_e( 'For developers: attributes and JavaScript', 'bricks-motion-studio' ); ?></summary>
								<p class="bme-panel__text"><?php esc_html_e( 'Not needed for anything in the builder. To animate without the Motion Studio controls, add these under Style, Attributes on any element (the code name of an animation is on its card):', 'bricks-motion-studio' ); ?></p>
<pre class="bme-pre"><code>data-bme         fade-up
data-bme-engine  motion
data-bme-opts    {"duration":1.2,"delay":0.2,"scope":"children","stagger":0.1,"from":"center"}
data-bme-hover   magnetic        (lift, grow, magnetic, tilt, roll)
data-bme-inview  {"c":"is-inview","r":1}
data-bme-mouse   {"s":24,"a":"section"}
data-bme-skip    (no value, opts the element out)</code></pre>
<pre class="bme-pre"><code>BricksMotion.refresh();        // re-scan after custom AJAX
BricksMotion.play( el );       // replay an element (also from Interactions → JavaScript (Function), %brx%)
BricksMotion.reset( el );      // back to the start state
BricksMotion.destroy( el );    // stop and restore
BricksMotion.pauseAll();       // pause everything that keeps moving (resumeAll() to resume)
BricksMotion.lenis;            // Lenis instance, when enabled
document.addEventListener( 'bme:ready', ( e ) =&gt; console.log( e.detail ) );</code></pre>
							</details>
						</section>
					</main>
				</div>
			</div>
		</div>
		<?php
	}
}
