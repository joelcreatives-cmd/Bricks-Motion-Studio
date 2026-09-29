// Production build of the frontend assets.
//
// - Minifies the plugin's own scripts and stylesheet (*.min.js / *.min.css next to the sources).
// - Bakes the preset catalog into runtime.min.js, so it is cached with the script instead of
//   being printed inline on every page.
// - Builds slim local copies of Motion and Anime.js that contain only the functions the adapters
//   call (CDN mode keeps the full, integrity-checked npm builds).
// - Stamps every output with a hash of its inputs; bin/check.mjs fails if a build is stale.
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL( '..', import.meta.url ).pathname;
const read = ( p ) => readFileSync( join( root, p ), 'utf8' );
export const hashOf = ( ...parts ) => createHash( 'sha1' ).update( parts.join( '\0' ) ).digest( 'hex' ).slice( 0, 10 );
const stamp = ( hash ) => `/*! Bricks Motion Studio build ${ hash } */\n`;

// Slim vendor bundles: only what the adapters use. Stamped with the library version + exports.
export const SLIM = {
	'assets/vendor/motion/motion.slim.min.js': { pkg: 'motion', contents: "import { animate, scroll, stagger } from 'motion'; window.Motion = { animate, scroll, stagger };" },
	'assets/vendor/anime/anime.slim.min.js': { pkg: 'animejs', contents: "import { animate, stagger, onScroll, engine } from 'animejs'; window.anime = { animate, stagger, onScroll, engine };" },
};
export const slimHash = ( spec ) => hashOf( JSON.parse( read( `node_modules/${ spec.pkg }/package.json` ) ).version, spec.contents );

if ( process.argv[ 1 ] && process.argv[ 1 ].endsWith( 'build-js.mjs' ) ) {
	const target = [ 'es2017' ];

	// 1. Own scripts.
	const OWN = [ 'runtime', 'adapter-gsap', 'adapter-anime', 'adapter-motion', 'smooth-scroll' ];
	const presets = JSON.stringify( JSON.parse( read( 'includes/data/presets.json' ) ) );

	for ( const name of OWN ) {
		const src = read( `assets/js/${ name }.js` );
		const extra = name === 'runtime' ? presets : '';
		const out = await transform( src, { minify: true, target, legalComments: 'none' } );
		const prefix = name === 'runtime' ? `window.BME_PRESETS=${ presets };` : '';
		writeFileSync( join( root, `assets/js/${ name }.min.js` ), stamp( hashOf( src, extra ) ) + prefix + out.code );
		console.log( `built assets/js/${ name }.min.js` );
	}

	// 2. Stylesheet.
	{
		const src = read( 'assets/css/frontend.css' );
		const out = await transform( src, { loader: 'css', minify: true, target: [ 'chrome90', 'safari14', 'firefox90' ] } );
		writeFileSync( join( root, 'assets/css/frontend.min.css' ), stamp( hashOf( src, '' ) ) + out.code );
		console.log( 'built assets/css/frontend.min.css' );
	}

	// 3. Slim vendor bundles.
	for ( const [ outfile, spec ] of Object.entries( SLIM ) ) {
		await build( {
			stdin: { contents: spec.contents, resolveDir: root, loader: 'js' },
			banner: { js: stamp( slimHash( spec ) ).trim() },
			bundle: true,
			minify: true,
			format: 'iife',
			target: [ 'es2018' ],
			legalComments: 'eof',
			outfile: join( root, outfile ),
			logLevel: 'error',
		} );
		console.log( `built ${ outfile }` );
	}
}
