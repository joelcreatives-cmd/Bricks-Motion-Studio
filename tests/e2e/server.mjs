// Tiny static server for the e2e harness: /plugin/* → plugin root, everything else → tests/e2e.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname( fileURLToPath( import.meta.url ) );
const root = join( here, '..', '..' );
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary' };

export function start( port = 8765 ) {
	const server = http.createServer( ( req, res ) => {
		const p = new URL( req.url, 'http://x' ).pathname;
		const file = p.startsWith( '/plugin/' ) ? join( root, p.slice( 8 ) ) : join( here, p === '/' ? 'harness.html' : p );
		if ( ! existsSync( file ) || statSync( file ).isDirectory() ) {
			res.writeHead( 404 );
			return res.end();
		}
		res.writeHead( 200, { 'content-type': types[ extname( file ) ] || 'application/octet-stream' } );
		res.end( readFileSync( file ) );
	} );
	// Port taken (another run, another tool): any free port instead. run.mjs reads the real one.
	return new Promise( ( resolve, reject ) => {
		server.once( 'error', ( e ) => {
			if ( e.code === 'EADDRINUSE' && port !== 0 ) {
				server.listen( 0, () => resolve( server ) );
			} else {
				reject( e );
			}
		} );
		server.listen( port, () => resolve( server ) );
	} );
}
