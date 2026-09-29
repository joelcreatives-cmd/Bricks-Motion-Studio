/**
 * GLB/GLTF model viewer scene (lazy chunk).
 */
import { Box3, PerspectiveCamera, PMREMGenerator, Scene, Sphere, Vector3, ACESFilmicToneMapping } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function modelScene( el, opts, renderer, canvas ) {
	return new Promise( ( resolve, reject ) => {
		let url;
		try {
			url = new URL( String( opts.model || '' ), window.location.href );
		} catch ( e ) {
			url = null;
		}
		if ( ! url || ! /^https?:$/.test( url.protocol ) ) {
			reject( new Error( 'Model URL must be http(s)' ) );
			return;
		}

		renderer.toneMapping = ACESFilmicToneMapping;
		renderer.toneMappingExposure = typeof opts.exposure === 'number' ? opts.exposure : 1;

		const scene = new Scene();
		const pmrem = new PMREMGenerator( renderer );
		const env = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
		scene.environment = env;
		pmrem.dispose();

		const camera = new PerspectiveCamera( 35, 1, 0.01, 1000 );
		let controls = null;
		const autoRotate = opts.autoRotate !== 0;

		if ( opts.orbit ) {
			controls = new OrbitControls( camera, canvas );
			controls.enableDamping = true;
			controls.enablePan = false;
			controls.enableZoom = false;
			controls.autoRotate = autoRotate;
			controls.autoRotateSpeed = 1.2;
			// OrbitControls sets touch-action:none, which would trap page scrolling on phones.
			canvas.style.touchAction = 'pan-y';
		}

		new GLTFLoader().load(
			url.href,
			( gltf ) => {
				const model = gltf.scene;
				const box = new Box3().setFromObject( model, true );
				const center = box.getCenter( new Vector3() );
				model.position.sub( center );
				scene.add( model );

				const radius = box.getBoundingSphere( new Sphere() ).radius || 1;
				const fit = ( aspect ) => {
					const fov = ( camera.fov * Math.PI ) / 180;
					const distH = radius / Math.sin( fov / 2 );
					const distW = distH / Math.min( 1, aspect );
					camera.position.set( 0, radius * 0.2, Math.max( distH, distW ) * 1.1 );
					camera.near = radius / 100;
					camera.far = radius * 100;
					camera.lookAt( 0, 0, 0 );
					camera.updateProjectionMatrix();
					if ( controls ) {
						controls.target.set( 0, 0, 0 );
						controls.update();
					}
				};

				resolve( {
					scene,
					camera,
					controls,
					update( t, dt, pointer ) {
						if ( ! controls ) {
							if ( autoRotate ) {
								model.rotation.y += dt * 0.35;
							}
							model.rotation.x += ( pointer.y * 0.15 - model.rotation.x ) * 0.05;
						}
					},
					resize( w, h ) {
						camera.aspect = w / Math.max( 1, h );
						fit( camera.aspect );
					},
					dispose() {
						scene.traverse( ( obj ) => {
							if ( obj.geometry ) {
								obj.geometry.dispose();
							}
							if ( obj.material ) {
								( Array.isArray( obj.material ) ? obj.material : [ obj.material ] ).forEach( ( m ) => {
									Object.keys( m ).forEach( ( k ) => {
										if ( m[ k ] && m[ k ].isTexture ) {
											m[ k ].dispose();
										}
									} );
									m.dispose();
								} );
							}
						} );
						env.dispose();
					},
				} );
			},
			undefined,
			reject
		);
	} );
}
