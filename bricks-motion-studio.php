<?php
/**
 * Plugin Name:       Bricks Motion Studio
 * Description:       Multi-library animation engine for Bricks Builder. Pick GSAP, Anime.js, Motion, Three.js and/or Lenis — one or all — and animations are applied automatically to Bricks elements, with per-element controls in the builder.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            JoelCreatives
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       bricks-motion-studio
 * Update URI:        https://github.com/joelcreatives-cmd/Bricks-Motion-Studio
 * Domain Path:       /languages
 *
 * @package BricksMotionStudio
 */

defined( 'ABSPATH' ) || exit;

define( 'BME_VERSION', '1.0.0' );
define( 'BME_FILE', __FILE__ );
define( 'BME_PATH', plugin_dir_path( __FILE__ ) );
define( 'BME_URL', plugin_dir_url( __FILE__ ) );
define( 'BME_OPTION', 'bme_settings' );

require_once BME_PATH . 'includes/class-settings.php';
require_once BME_PATH . 'includes/class-presets.php';
require_once BME_PATH . 'includes/class-levels.php';
require_once BME_PATH . 'includes/class-libraries.php';
require_once BME_PATH . 'includes/class-usage.php';
require_once BME_PATH . 'includes/class-bricks-integration.php';
require_once BME_PATH . 'includes/class-assets.php';
require_once BME_PATH . 'includes/class-admin.php';
require_once BME_PATH . 'includes/class-updater.php';
require_once BME_PATH . 'includes/class-plugin.php';

register_activation_hook( __FILE__, array( 'BricksMotionStudio\\Plugin', 'activate' ) );

add_action( 'plugins_loaded', array( 'BricksMotionStudio\\Plugin', 'instance' ) );
