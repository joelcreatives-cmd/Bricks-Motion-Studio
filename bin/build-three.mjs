// Builds the Three.js scenes (tree-shaken, code-split ESM) into assets/js/three/.
// Builds into a temporary folder and swaps it in, so a failed build never leaves a half-empty
// folder; ships the Three.js MIT license; stamps the entry file with a hash of its inputs so
// bin/check.mjs can detect a stale bundle.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL( '..', import.meta.url ).pathname;
const src = join( root, 'src/three' );
const out = join( root, 'assets/js/three' );
const tmp = join( root, 'assets/js/three.tmp' );

export function threeInputsHash() {
	const files = readdirSync( src ).filter( ( f ) => f.endsWith( '.js' ) ).sort();
	const version = JSON.parse( readFileSync( join( root, 'node_modules/three/package.json' ), 'utf8' ) ).version;
	return createHash( 'sha1' ).update( [ version, ...files.map( ( f ) => f + '\0' + readFileSync( join( src, f ), 'utf8' ) ) ].join( '\0' ) ).digest( 'hex' ).slice( 0, 10 );
}

if ( process.argv[ 1 ] && process.argv[ 1 ].endsWith( 'build-three.mjs' ) ) {
	rmSync( tmp, { recursive: true, force: true } );
	await build( {
		entryPoints: { 'bme-three': join( src, 'scenes.js' ) },
		bundle: true,
		format: 'esm',
		splitting: true,
		minify: true,
		target: [ 'es2020' ],
		legalComments: 'eof',
		outdir: tmp,
		chunkNames: 'chunk-[hash]',
		banner: { js: `/*! Bricks Motion Studio three build ${ threeInputsHash() } */` },
		logLevel: 'error',
	} );
	copyFileSync( join( root, 'node_modules/three/LICENSE' ), join( tmp, 'LICENSE.txt' ) );
	writeFileSync( join( tmp, 'index.php' ), '<?php\n// Silence is golden.\n' );
	rmSync( out, { recursive: true, force: true } );
	renameSync( tmp, out );
	if ( ! existsSync( join( out, 'bme-three.js' ) ) ) {
		throw new Error( 'three build missing bme-three.js' );
	}
	console.log( 'built assets/js/three/' );
}
