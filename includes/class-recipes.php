<?php
/**
 * Animation recipes: one choice on a section (Motion Studio → Animation recipe) animates the
 * elements inside it, in order, with no settings on each one.
 *
 * Two kinds:
 * - roles: every element inside gets an animation by what it is (heading, text, button, media),
 *   each role starting a little after the one before (hero intro, cascade).
 * - items: the element's direct children are the items (cards in a grid, two columns); what is
 *   inside an item travels with it and gets no animation of its own.
 *
 * Applied at render time (Bricks_Integration keeps a stack of the open recipe sections), so the
 * anti-flash, engine loading, levels and the inspector work as for any other animation.
 *
 * @package BricksMotionStudio
 */

namespace BricksMotionStudio;

defined( 'ABSPATH' ) || exit;

class Recipes {

	/** Element names by role (roles recipes). */
	const ROLES = array(
		'heading' => array( 'heading', 'post-title' ),
		'text'    => array( 'text-basic', 'text', 'post-excerpt', 'text-link', 'list', 'icon-box' ),
		'button'  => array( 'button' ),
		'media'   => array( 'image', 'video', 'icon', 'svg', 'image-gallery' ),
	);

	/**
	 * The recipes.
	 *
	 * @return array<string,array>
	 */
	public static function all() {
		return array(
			'hero'    => array(
				'label' => __( 'Hero intro: heading, text, buttons, image in turn', 'bricks-motion-studio' ),
				'kind'  => 'roles',
				'roles' => array(
					'heading' => array( 'split-words', 0 ),
					'text'    => array( 'fade-up', 0.25 ),
					'button'  => array( 'fade-up', 0.4 ),
					'media'   => array( 'zoom-out', 0.15 ),
				),
				'step'  => 0.08, // each further element of the same role starts this much later
			),
			'cards'   => array(
				'label'  => __( 'Card grid: each item rises in, one after another', 'bricks-motion-studio' ),
				'kind'   => 'items',
				'preset' => array( 'fade-up' ),
			),
			'columns' => array(
				'label'  => __( 'Two columns: first from the left, second from the right', 'bricks-motion-studio' ),
				'kind'   => 'items',
				'preset' => array( 'fade-right', 'fade-left' ), // fade-right comes in from the left
			),
			'cascade' => array(
				'label' => __( 'Cascade: everything inside fades up in order', 'bricks-motion-studio' ),
				'kind'  => 'roles',
				'roles' => array(
					'heading' => array( 'fade-up', 0 ),
					'text'    => array( 'fade-up', 0 ),
					'button'  => array( 'fade-up', 0 ),
					'media'   => array( 'fade-up', 0 ),
				),
				'step'  => 0.08, // every element: a little after the previous one
				'flow'  => true, // one sequence across roles, in page order
			),
		);
	}

	/**
	 * @param string $slug Recipe slug.
	 * @return array|null
	 */
	public static function get( $slug ) {
		$all = self::all();
		return is_string( $slug ) && isset( $all[ $slug ] ) ? $all[ $slug ] : null;
	}

	/**
	 * The role of an element in a roles recipe.
	 *
	 * @param string $name Element name.
	 * @return string '' when it has none.
	 */
	public static function role_of( $name ) {
		foreach ( self::ROLES as $role => $names ) {
			if ( in_array( $name, $names, true ) ) {
				return $role;
			}
		}
		return '';
	}

	/** Longest delay a recipe gives (later elements start together with the last one). */
	const MAX_DELAY = 1.2;

	/**
	 * What a recipe does with one element inside it.
	 *
	 * @param array  $frame Open recipe frame: slug, depth of this element below the section, counters (by reference).
	 * @param string $name  Element name.
	 * @param int    $depth 1 = a direct child of the section.
	 * @return array|false|null A rule-like array (preset, delay) to animate it; false: no animation
	 *                          of its own (it travels with its item); null: the recipe leaves it alone.
	 */
	public static function assign( array &$frame, $name, $depth ) {
		$recipe = self::get( $frame['slug'] ?? '' );
		if ( ! $recipe ) {
			return null;
		}
		if ( 'items' === $recipe['kind'] ) {
			if ( $depth > 1 ) {
				return false;
			}
			$i              = $frame['count'] ?? 0;
			$presets        = $recipe['preset'];
			$frame['count'] = $i + 1;
			return array(
				'preset' => $presets[ min( $i, count( $presets ) - 1 ) ],
				'delay'  => 0, // items entering together cascade by the site's stagger
			);
		}
		$role = self::role_of( $name );
		if ( '' === $role || ! isset( $recipe['roles'][ $role ] ) ) {
			return null;
		}
		$key                    = ! empty( $recipe['flow'] ) ? 'all' : $role;
		$n                      = $frame['roles'][ $key ] ?? 0;
		$frame['roles'][ $key ] = $n + 1;
		list( $preset, $base )  = $recipe['roles'][ $role ];
		return array(
			'preset' => $preset,
			'delay'  => round( min( self::MAX_DELAY, $base + $n * (float) $recipe['step'] ), 3 ),
		);
	}
}
