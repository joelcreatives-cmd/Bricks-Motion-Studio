// Copies the browser builds of each library from node_modules into assets/vendor/.
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const nm = join( root, 'node_modules' );

const files = {
	gsap: [ 'gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js', 'ScrambleTextPlugin.min.js', 'DrawSVGPlugin.min.js' ].map( ( f ) => [ `gsap/dist/${ f }`, f ] ),
	lenis: [ [ 'lenis/dist/lenis.min.js', 'lenis.min.js' ], [ 'lenis/dist/lenis.css', 'lenis.css' ] ],
	anime: [ [ 'animejs/dist/bundles/anime.umd.min.js', 'anime.umd.min.js' ] ],
	motion: [ [ 'motion/dist/motion.js', 'motion.js' ] ],
};
const licenses = { gsap: 'gsap/LICENSE.md', lenis: 'lenis/LICENSE', anime: 'animejs/LICENSE.md', motion: 'motion/LICENSE.md' };

const sri = {};
for ( const [ lib, list ] of Object.entries( files ) ) {
	const out = join( root, 'assets/vendor', lib );
	mkdirSync( out, { recursive: true } );
	for ( const [ src, dest ] of list ) {
		copyFileSync( join( nm, src ), join( out, dest ) );
		// jsDelivr serves npm files byte-for-byte, so the local hash is the CDN file's hash.
		sri[ `${ lib }/${ dest }` ] = 'sha384-' + createHash( 'sha384' ).update( readFileSync( join( out, dest ) ) ).digest( 'base64' );
	}
	let licensed = false;
	for ( const name of [ licenses[ lib ], licenses[ lib ].replace( /\.md$/, '' ), licenses[ lib ] + '.md' ] ) {
		const p = join( nm, name );
		if ( existsSync( p ) ) {
			copyFileSync( p, join( out, 'LICENSE.txt' ) );
			licensed = true;
			break;
		}
	}
	if ( ! licensed ) {
		// GSAP's npm package ships no license file: assets/vendor/gsap/LICENSE.txt is maintained by hand.
		if ( ! existsSync( join( out, 'LICENSE.txt' ) ) ) {
			throw new Error( `No license file for ${ lib }: add assets/vendor/${ lib }/LICENSE.txt` );
		}
		console.warn( `note: ${ lib } has no license in its npm package; kept assets/vendor/${ lib }/LICENSE.txt (check it matches ${ lib } ${ JSON.parse( readFileSync( join( nm, list[ 0 ][ 0 ].split( '/' )[ 0 ], 'package.json' ), 'utf8' ) ).version })` );
	}
	const pkg = JSON.parse( readFileSync( join( nm, list[ 0 ][ 0 ].split( '/' )[ 0 ], 'package.json' ), 'utf8' ) );
	console.log( `vendored ${ lib } ${ pkg.version }` );
}
writeFileSync( join( root, 'includes/data/sri.json' ), JSON.stringify( sri, null, 1 ) + '\n' );
console.log( 'wrote includes/data/sri.json' );
