// Syntax-checks every shipped JS file and lints every PHP file (requires php in PATH).
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL( '..', import.meta.url ).pathname;
const walk = ( dir ) => readdirSync( dir ).flatMap( ( f ) => {
	const p = join( dir, f );
	if ( /node_modules|vendor|\/three$/.test( p ) ) return [];
	return statSync( p ).isDirectory() ? walk( p ) : [ p ];
} );
let failed = 0;
for ( const f of walk( root ) ) {
	try {
		if ( f.endsWith( '.js' ) && f.includes( '/assets/js/' ) ) execSync( `node --check "${ f }"` );
		if ( f.endsWith( '.php' ) ) execSync( `php -l "${ f }"`, { stdio: 'pipe' } );
	} catch ( e ) {
		failed++;
		console.error( 'FAIL', f, String( e.stderr || e.message ) );
	}
}
// Production builds must match their sources (run `npm run build:js` after editing a source).
{
	const { createHash } = await import( 'node:crypto' );
	const { readFileSync, existsSync } = await import( 'node:fs' );
	const hashOf = ( ...parts ) => createHash( 'sha1' ).update( parts.join( '\0' ) ).digest( 'hex' ).slice( 0, 10 );
	const presets = JSON.stringify( JSON.parse( readFileSync( join( root, 'includes/data/presets.json' ), 'utf8' ) ) );
	const pairs = [ 'runtime', 'adapter-gsap', 'adapter-anime', 'adapter-motion', 'smooth-scroll' ].map( ( n ) => [ `assets/js/${ n }.js`, `assets/js/${ n }.min.js`, n === 'runtime' ? presets : '' ] );
	pairs.push( [ 'assets/css/frontend.css', 'assets/css/frontend.min.css', '' ] );
	for ( const [ src, min, extra ] of pairs ) {
		const want = hashOf( readFileSync( join( root, src ), 'utf8' ), extra );
		const have = existsSync( join( root, min ) ) ? ( readFileSync( join( root, min ), 'utf8' ).match( /build ([0-9a-f]{10})/ ) || [] )[ 1 ] : null;
		if ( have !== want ) {
			failed++;
			console.error( 'STALE', min, '(run npm run build:js)' );
		}
	}
	for ( const f of [ 'assets/vendor/motion/motion.slim.min.js', 'assets/vendor/anime/anime.slim.min.js' ] ) {
		if ( ! existsSync( join( root, f ) ) ) {
			failed++;
			console.error( 'MISSING', f, '(run npm run build:js)' );
		}
	}
}
// Three.js bundle, slim vendor builds, library versions and CDN integrity hashes must all agree.
{
	const { readFileSync, existsSync } = await import( 'node:fs' );
	const { createHash } = await import( 'node:crypto' );
	if ( ! existsSync( join( root, 'node_modules' ) ) ) {
		console.log( 'note: node_modules missing, skipped build-input checks (run npm install)' );
	} else {
		const { threeInputsHash } = await import( './build-three.mjs' );
		const { SLIM, slimHash } = await import( './build-js.mjs' );
		const stampOf = ( f ) => existsSync( join( root, f ) ) ? ( readFileSync( join( root, f ), 'utf8' ).match( /build ([0-9a-f]{10})/ ) || [] )[ 1 ] : null;
		const three = readFileSync( join( root, 'assets/js/three/bme-three.js' ), 'utf8' ).match( /three build ([0-9a-f]{10})/ );
		if ( ! three || three[ 1 ] !== threeInputsHash() ) {
			failed++;
			console.error( 'STALE assets/js/three/ (run npm run build:three)' );
		}
		if ( ! existsSync( join( root, 'assets/js/three/LICENSE.txt' ) ) ) {
			failed++;
			console.error( 'MISSING assets/js/three/LICENSE.txt (run npm run build:three)' );
		}
		for ( const [ f, spec ] of Object.entries( SLIM ) ) {
			if ( stampOf( f ) !== slimHash( spec ) ) {
				failed++;
				console.error( 'STALE', f, '(run npm run build:js)' );
			}
		}
		// Libraries::VERSIONS (CDN URLs) === package.json === installed.
		const php = readFileSync( join( root, 'includes/class-libraries.php' ), 'utf8' );
		const pkg = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) );
		const map = { gsap: 'gsap', three: 'three', lenis: 'lenis', anime: 'animejs', motion: 'motion' };
		for ( const [ lib, npm ] of Object.entries( map ) ) {
			const inPhp = ( php.match( new RegExp( `'${ lib }'\\s*=>\\s*'([^']+)'` ) ) || [] )[ 1 ];
			const inPkg = String( ( pkg.devDependencies || {} )[ npm ] || '' ).replace( /^[^0-9]*/, '' );
			const installed = JSON.parse( readFileSync( join( root, 'node_modules', npm, 'package.json' ), 'utf8' ) ).version;
			if ( inPhp !== installed || ( inPkg && inPkg !== installed ) ) {
				failed++;
				console.error( `VERSION ${ lib }: Libraries::VERSIONS=${ inPhp } package.json=${ inPkg } installed=${ installed }` );
			}
		}
		// Every CDN integrity hash must match the file it covers (jsDelivr serves npm files as-is).
		const sri = JSON.parse( readFileSync( join( root, 'includes/data/sri.json' ), 'utf8' ) );
		const npmPath = { gsap: 'gsap/dist/', lenis: 'lenis/dist/', anime: 'animejs/dist/bundles/', motion: 'motion/dist/' };
		for ( const [ key, hash ] of Object.entries( sri ) ) {
			const [ lib, file ] = key.split( '/' );
			const p = join( root, 'node_modules', npmPath[ lib ] || '', file );
			const got = existsSync( p ) ? 'sha384-' + createHash( 'sha384' ).update( readFileSync( p ) ).digest( 'base64' ) : null;
			if ( got !== hash ) {
				failed++;
				console.error( 'SRI mismatch', key, '(run npm run vendor)' );
			}
		}
	}
}
console.log( failed ? `${ failed } file(s) failed` : 'All files OK' );
process.exit( failed ? 1 : 0 );
