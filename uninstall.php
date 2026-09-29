<?php
/**
 * Uninstall: remove the plugin's single option (per site on multisite).
 * Element settings saved inside Bricks page data (bme* keys) are left untouched so that
 * reinstalling restores them; Bricks ignores unknown setting keys.
 *
 * @package BricksMotionStudio
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $bme_site_id ) {
		switch_to_blog( $bme_site_id );
		delete_option( 'bme_settings' );
		delete_option( 'bme_schema' );
		restore_current_blog();
	}
} else {
	delete_option( 'bme_settings' );
	delete_option( 'bme_schema' );
}
