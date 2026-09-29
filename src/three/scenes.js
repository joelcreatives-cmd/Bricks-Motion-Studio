/**
 * Bricks Motion Studio — Three.js scenes (bundled to assets/js/three/bme-three.js).
 *
 * mount( el, opts, env ) → { pause(), resume(), destroy() }
 *
 * Every scene renders into its own transparent canvas (absolute, behind the host's
 * content for backgrounds) and never touches the host element's transform/opacity,
 * so it coexists with any GSAP / Anime.js / Motion animation on the same element.
 */
import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	IcosahedronGeometry,
	Mesh,
	MeshPhysicalMaterial,
	OrthographicCamera,
	PerspectiveCamera,
	PlaneGeometry,
	PMREMGenerator,
	Points,
	Scene,
	ShaderMaterial,
	SRGBColorSpace,
	TorusGeometry,
	TorusKnotGeometry,
	WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEFAULT_COLORS = [ '#5b3fc4', '#c8497a', '#2d9cdb' ];

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

function resolveColor( el, value, fallback ) {
	let v = ( value || '' ).trim();
	const m = v.match( /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/ );
	if ( m ) {
		v = getComputedStyle( el ).getPropertyValue( m[ 1 ] ).trim() || ( m[ 2 ] || '' ).trim();
	}
	const c = new Color();
	try {
		c.setStyle( v || fallback );
	} catch ( e ) {
		c.setStyle( fallback );
	}
	return c;
}

function palette( el, opts ) {
	const list = Array.isArray( opts.colors ) ? opts.colors : [];
	return DEFAULT_COLORS.map( ( fallback, i ) => resolveColor( el, list[ i ] || list[ i % Math.max( 1, list.length ) ] || '', fallback ) );
}

function disposeObject( root ) {
	root.traverse( ( obj ) => {
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
}

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
	const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
	vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
	vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
	vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
	vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
	vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
	vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
	m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
	vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
	return 130.0*dot(m,g);
}`;

/* ---------------------------------------------------------------------------
 * Scenes: each returns { scene, camera, update(t, dt, pointer), resize(w, h), dispose() }
 * ------------------------------------------------------------------------ */

function gradientScene( el, opts ) {
	const [ a, b, c ] = palette( el, opts );
	const scene = new Scene();
	const camera = new OrthographicCamera( -1, 1, 1, -1, 0, 1 );
	const uniforms = {
		uTime: { value: 0 },
		uColorA: { value: a },
		uColorB: { value: b },
		uColorC: { value: c },
		uPointer: { value: [ 0.5, 0.5 ] },
		uAspect: { value: 1 },
	};
	const material = new ShaderMaterial( {
		uniforms,
		depthWrite: false,
		vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
		fragmentShader: /* glsl */ `
			precision highp float;
			varying vec2 vUv;
			uniform float uTime; uniform float uAspect;
			uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
			uniform vec2 uPointer;
			${ NOISE }
			void main(){
				vec2 p = vUv; p.x *= uAspect;
				vec2 m = uPointer; m.x *= uAspect;
				float t = uTime * 0.08;
				float n1 = snoise(p * 1.4 + vec2(t, -t * 0.7));
				float n2 = snoise(p * 2.1 - vec2(t * 0.6, t) + n1 * 0.35);
				float d = smoothstep(0.65, 0.0, distance(p, m));
				vec3 col = mix(uColorA, uColorB, smoothstep(-0.6, 0.7, n1 + d * 0.35));
				col = mix(col, uColorC, smoothstep(0.15, 0.95, n2 * 0.6 + vUv.y * 0.45));
				float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
				gl_FragColor = vec4(col, 1.0);
				#include <colorspace_fragment>
				gl_FragColor.rgb += grain;
			}`,
	} );
	const mesh = new Mesh( new PlaneGeometry( 2, 2 ), material );
	scene.add( mesh );

	return {
		scene,
		camera,
		update( t, dt, pointer ) {
			uniforms.uTime.value = t;
			uniforms.uPointer.value = [ 0.5 + pointer.x * 0.5, 0.5 - pointer.y * 0.5 ];
		},
		resize( w, h ) {
			uniforms.uAspect.value = w / Math.max( 1, h );
		},
		dispose() {
			disposeObject( scene );
		},
	};
}

function particlesScene( el, opts ) {
	const [ a, b ] = palette( el, opts );
	const count = Math.round( 1600 * ( opts.density || 1 ) );
	const scene = new Scene();
	const camera = new PerspectiveCamera( 60, 1, 0.1, 100 );
	camera.position.z = 6;

	const positions = new Float32Array( count * 3 );
	const colors = new Float32Array( count * 3 );
	const scales = new Float32Array( count );
	const tmp = new Color();
	for ( let i = 0; i < count; i++ ) {
		const r = 2 + Math.random() * 6;
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.acos( 2 * Math.random() - 1 );
		positions[ i * 3 ] = r * Math.sin( phi ) * Math.cos( theta );
		positions[ i * 3 + 1 ] = r * Math.sin( phi ) * Math.sin( theta ) * 0.6;
		positions[ i * 3 + 2 ] = r * Math.cos( phi ) - 2;
		tmp.copy( a ).lerp( b, Math.random() );
		colors.set( [ tmp.r, tmp.g, tmp.b ], i * 3 );
		scales[ i ] = 0.4 + Math.random();
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'color', new BufferAttribute( colors, 3 ) );
	geometry.setAttribute( 'aScale', new BufferAttribute( scales, 1 ) );

	const material = new ShaderMaterial( {
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		vertexColors: true,
		uniforms: { uSize: { value: 26 }, uPixelRatio: { value: 1 } },
		vertexShader: /* glsl */ `
			attribute float aScale; varying vec3 vColor; uniform float uSize; uniform float uPixelRatio;
			void main(){
				vColor = color;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = uSize * aScale * uPixelRatio / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vColor;
			void main(){
				float d = length(gl_PointCoord - 0.5);
				float a = smoothstep(0.5, 0.0, d);
				gl_FragColor = vec4(vColor, a * 0.9);
				#include <colorspace_fragment>
			}`,
	} );

	const points = new Points( geometry, material );
	const group = new Group();
	group.add( points );
	scene.add( group );

	return {
		scene,
		camera,
		setPixelRatio( pr ) {
			material.uniforms.uPixelRatio.value = pr;
		},
		update( t, dt, pointer ) {
			points.rotation.y = t * 0.03;
			points.rotation.x = Math.sin( t * 0.02 ) * 0.2;
			group.rotation.y += ( pointer.x * 0.25 - group.rotation.y ) * 0.04;
			group.rotation.x += ( pointer.y * 0.15 - group.rotation.x ) * 0.04;
		},
		resize( w, h ) {
			camera.aspect = w / Math.max( 1, h );
			camera.updateProjectionMatrix();
		},
		dispose() {
			disposeObject( scene );
		},
	};
}

function wavesScene( el, opts ) {
	const [ a, b ] = palette( el, opts );
	const seg = Math.round( 90 * Math.min( 2, opts.density || 1 ) );
	const scene = new Scene();
	const camera = new PerspectiveCamera( 50, 1, 0.1, 100 );
	camera.position.set( 0, 2.2, 5.5 );
	camera.lookAt( 0, 0, 0 );

	const geometry = new PlaneGeometry( 14, 9, seg, Math.round( seg * 0.6 ) );
	geometry.rotateX( -Math.PI / 2 );
	const uniforms = {
		uTime: { value: 0 },
		uColorA: { value: a },
		uColorB: { value: b },
		uPointer: { value: [ 0, 0 ] },
		uPixelRatio: { value: 1 },
	};
	const material = new ShaderMaterial( {
		uniforms,
		transparent: true,
		depthWrite: false,
		vertexShader: /* glsl */ `
			uniform float uTime; uniform vec2 uPointer; uniform float uPixelRatio; varying float vH;
			void main(){
				vec3 p = position;
				float w = sin(p.x * 0.9 + uTime * 0.9) * 0.35 + sin(p.z * 1.3 + uTime * 0.7) * 0.25;
				w += sin((p.x + p.z) * 0.6 + uTime * 0.5) * 0.2;
				w += exp(-distance(p.xz, uPointer * vec2(6.0, 4.0)) * 0.6) * 0.5;
				p.y += w; vH = w;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_PointSize = 2.2 * uPixelRatio * (4.0 / -mv.z);
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColorA; uniform vec3 uColorB; varying float vH;
			void main(){
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				vec3 col = mix(uColorA, uColorB, smoothstep(-0.5, 0.7, vH));
				gl_FragColor = vec4(col, 0.85);
				#include <colorspace_fragment>
			}`,
	} );
	const points = new Points( geometry, material );
	scene.add( points );

	return {
		scene,
		camera,
		setPixelRatio( pr ) {
			uniforms.uPixelRatio.value = pr;
		},
		update( t, dt, pointer ) {
			uniforms.uTime.value = t;
			const target = uniforms.uPointer.value;
			target[ 0 ] += ( pointer.x - target[ 0 ] ) * 0.05;
			target[ 1 ] += ( -pointer.y - target[ 1 ] ) * 0.05;
		},
		resize( w, h ) {
			camera.aspect = w / Math.max( 1, h );
			camera.updateProjectionMatrix();
		},
		dispose() {
			disposeObject( scene );
		},
	};
}

function orbsScene( el, opts, renderer ) {
	const colors = palette( el, opts );
	const scene = new Scene();
	const pmrem = new PMREMGenerator( renderer );
	const envTexture = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
	scene.environment = envTexture;
	pmrem.dispose();

	const camera = new PerspectiveCamera( 40, 1, 0.1, 100 );
	camera.position.z = 9;

	const geometries = [ new IcosahedronGeometry( 1, 1 ), new TorusKnotGeometry( 0.7, 0.26, 160, 24 ), new TorusGeometry( 0.8, 0.3, 32, 96 ) ];
	const group = new Group();
	const count = Math.max( 3, Math.round( 6 * ( opts.density || 1 ) ) );
	const items = [];
	for ( let i = 0; i < count; i++ ) {
		const material = new MeshPhysicalMaterial( {
			color: colors[ i % colors.length ],
			roughness: 0.25,
			metalness: 0.1,
			clearcoat: 1,
			clearcoatRoughness: 0.2,
		} );
		const mesh = new Mesh( geometries[ i % geometries.length ], material );
		const angle = ( i / count ) * Math.PI * 2;
		mesh.position.set( Math.cos( angle ) * 3.6, Math.sin( angle ) * 1.9, -Math.random() * 2 );
		const s = 0.5 + Math.random() * 0.6;
		mesh.scale.setScalar( s );
		items.push( { mesh, base: mesh.position.clone(), speed: 0.4 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2 } );
		group.add( mesh );
	}
	scene.add( group );

	return {
		scene,
		camera,
		update( t, dt, pointer ) {
			items.forEach( ( it ) => {
				it.mesh.position.y = it.base.y + Math.sin( t * it.speed + it.phase ) * 0.35;
				it.mesh.rotation.x = t * 0.3 * it.speed;
				it.mesh.rotation.y = t * 0.2 * it.speed;
			} );
			group.rotation.y += ( pointer.x * 0.3 - group.rotation.y ) * 0.04;
			group.rotation.x += ( pointer.y * 0.2 - group.rotation.x ) * 0.04;
		},
		resize( w, h ) {
			camera.aspect = w / Math.max( 1, h );
			camera.position.z = camera.aspect < 1 ? 13 : 9;
			camera.updateProjectionMatrix();
		},
		dispose() {
			disposeObject( scene );
			envTexture.dispose();
		},
	};
}

/* ---------------------------------------------------------------------------
 * Mount
 * ------------------------------------------------------------------------ */

const FACTORIES = {
	gradient: gradientScene,
	particles: particlesScene,
	waves: wavesScene,
	orbs: orbsScene,
};

/** Chromium/WebKit evict the oldest context beyond 16 (8 on Android): keep a safe budget. */
const MAX_ACTIVE = 8;
let active = 0;

const clamp = ( v, min, max, fallback ) => ( typeof v === 'number' && isFinite( v ) ? Math.min( max, Math.max( min, v ) ) : fallback );

export function mount( el, raw = {}, env = {} ) {
	// Options can come from hand-written attributes: never trust their ranges.
	const opts = Object.assign( {}, raw, {
		density: clamp( raw.density, 0.1, 3, 1 ),
		speed: clamp( raw.speed, 0, 5, 1 ),
		opacity: clamp( raw.opacity, 0, 1, undefined ),
		exposure: clamp( raw.exposure, 0.1, 4, 1 ),
		colors: Array.isArray( raw.colors ) ? raw.colors.slice( 0, 3 ).map( String ) : [],
	} );
	if ( active >= MAX_ACTIVE ) {
		el.classList.add( 'bme-3d-fallback' );
		return null;
	}
	const isElement = opts.mode === 'element';
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'bme-3d-canvas';
	canvas.setAttribute( 'aria-hidden', 'true' );
	// Critical positioning inline: the canvas must never take part in layout, even if the
	// stylesheet is missing (otherwise its pixel size would feed the ResizeObserver and grow the host).
	canvas.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;display:block;pointer-events:none;';
	const hostStyle = { position: el.style.position, isolation: el.style.isolation };
	if ( getComputedStyle( el ).position === 'static' ) {
		el.style.position = 'relative';
	}
	if ( ! isElement ) {
		// Behind the host's content, above its background.
		canvas.style.zIndex = '-1';
		el.style.isolation = 'isolate';
	}
	// Appended (not prepended) so the host's :first-child styling is unaffected.
	if ( isElement ) {
		el.appendChild( canvas );
		if ( opts.interactive || opts.orbit ) {
			el.classList.add( 'bme-3d-interactive' );
			canvas.style.pointerEvents = 'auto';
		}
		if ( opts.orbit ) {
			el.classList.add( 'bme-3d-orbit' );
		}
	} else {
		el.appendChild( canvas );
	}
	if ( typeof opts.opacity === 'number' ) {
		el.style.setProperty( '--bme-3d-opacity', String( opts.opacity ) );
	}

	let renderer;
	try {
		renderer = new WebGLRenderer( {
			canvas,
			alpha: true,
			antialias: ( window.devicePixelRatio || 1 ) < 2,
			powerPreference: opts.scene === 'model' ? 'high-performance' : 'low-power',
		} );
	} catch ( e ) {
		canvas.remove();
		el.style.position = hostStyle.position;
		el.style.isolation = hostStyle.isolation;
		el.classList.add( 'bme-3d-fallback' );
		return null;
	}
	active++;
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.setClearColor( 0x000000, 0 );
	const pixelRatio = Math.min( window.devicePixelRatio || 1, env.dpr || 1.5 );
	renderer.setPixelRatio( pixelRatio );

	const pointer = { x: 0, y: 0 };
	const speed = typeof opts.speed === 'number' ? opts.speed : 1;
	let current = null;
	let running = false;
	let destroyed = false;
	let time = 0;
	let last = 0;

	function render( now ) {
		if ( ! current ) {
			return;
		}
		const dt = last ? Math.min( 0.1, ( now - last ) / 1000 ) : 0;
		last = now;
		time += dt * speed;
		current.update( time, dt, pointer );
		if ( current.controls ) {
			current.controls.update( dt );
		}
		renderer.render( current.scene, current.camera );
	}

	function size() {
		// Clamp to sane bounds: a runaway container must never allocate a giant framebuffer.
		const w = Math.min( 4096, Math.max( 1, el.clientWidth ) );
		const h = Math.min( 4096, Math.max( 1, el.clientHeight ) );
		renderer.setSize( w, h, false );
		if ( current ) {
			current.resize( w, h );
			if ( ! running ) {
				render( performance.now() );
			}
		}
	}

	function start() {
		if ( running || destroyed || ! current ) {
			return;
		}
		if ( env.reduced ) {
			render( performance.now() );
			return;
		}
		running = true;
		last = 0;
		renderer.setAnimationLoop( render );
	}

	function stop() {
		running = false;
		renderer.setAnimationLoop( null );
	}

	function onPointer( e ) {
		const r = el.getBoundingClientRect();
		if ( ! r.width || ! r.height || e.clientY < r.top - 100 || e.clientY > r.bottom + 100 ) {
			return;
		}
		pointer.x = Math.max( -1, Math.min( 1, ( ( e.clientX - r.left ) / r.width ) * 2 - 1 ) );
		pointer.y = Math.max( -1, Math.min( 1, ( ( e.clientY - r.top ) / r.height ) * 2 - 1 ) );
	}

	if ( opts.interactive && ! env.reduced ) {
		window.addEventListener( 'pointermove', onPointer, { passive: true } );
	}

	const ro = new ResizeObserver( size );
	ro.observe( el );

	// A lost GPU context (driver reset, too many contexts) or a failed model load: show the
	// fallback (poster) and give the WebGL slot back so other scenes on the page can use it.
	let ctrl = null;
	const fail = () => {
		el.classList.add( 'bme-3d-fallback' );
		if ( ctrl && ! destroyed ) {
			ctrl.destroy();
		}
	};

	canvas.addEventListener( 'webglcontextlost', ( e ) => {
		e.preventDefault();
		stop();
		setTimeout( fail, 0 );
	} );

	let visible = true; // updated by the runtime through pause()/resume()
	function onVisibility() {
		if ( document.hidden ) {
			stop();
		} else if ( visible ) {
			start();
		}
	}
	document.addEventListener( 'visibilitychange', onVisibility );

	const ready = ( scene ) => {
		if ( destroyed ) {
			scene.dispose();
			return;
		}
		current = scene;
		// Reduced motion renders on demand only: redraw when the visitor drags the model.
		if ( current.controls && current.controls.addEventListener ) {
			current.controls.addEventListener( 'change', () => {
				if ( ! running && ! destroyed ) {
					renderer.render( current.scene, current.camera );
				}
			} );
		}
		if ( current.setPixelRatio ) {
			current.setPixelRatio( pixelRatio );
		}
		size();
		start();
	};

	if ( opts.scene === 'model' ) {
		import( './model.js' )
			.then( ( mod ) => mod.modelScene( el, opts, renderer, canvas ) )
			.then( ready )
			.catch( ( e ) => {
				if ( env.debug ) {
					console.error( '[Motion Studio] 3D model failed', e ); // eslint-disable-line no-console
				}
				fail();
			} );
	} else {
		ready( ( FACTORIES[ opts.scene ] || particlesScene )( el, opts, renderer ) );
	}

	ctrl = {
		pause() {
			visible = false;
			stop();
		},
		resume() {
			visible = true;
			if ( ! document.hidden ) {
				start();
			}
		},
		destroy() {
			if ( destroyed ) {
				return;
			}
			destroyed = true;
			stop();
			ro.disconnect();
			window.removeEventListener( 'pointermove', onPointer );
			document.removeEventListener( 'visibilitychange', onVisibility );
			if ( current ) {
				current.dispose();
				if ( current.controls ) {
					current.controls.dispose();
				}
			}
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
			el.style.position = hostStyle.position;
			el.style.isolation = hostStyle.isolation;
			el.classList.remove( 'bme-3d-interactive', 'bme-3d-orbit' );
			active = Math.max( 0, active - 1 );
		},
	};
	return ctrl;
}
