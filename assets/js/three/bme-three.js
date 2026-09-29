/*! Bricks Motion Studio three build 040598c948 */
import{Aa as q,Ba as J,Ca as Q,E as _,F as B,G as M,I as P,K as D,R as F,aa as G,ba as X,ca as I,da as Y,e as j,ea as N,fa as S,ha as $,qa as A,ta as K,u as k}from"./chunk-JFANPNLM.js";var ee=["#5b3fc4","#c8497a","#2d9cdb"];function te(e,i,s){let o=(i||"").trim(),l=o.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);l&&(o=getComputedStyle(e).getPropertyValue(l[1]).trim()||(l[2]||"").trim());let a=new B;try{a.setStyle(o||s)}catch{a.setStyle(s)}return a}function E(e,i){let s=Array.isArray(i.colors)?i.colors:[];return ee.map((o,l)=>te(e,s[l]||s[l%Math.max(1,s.length)]||"",o))}function L(e){e.traverse(i=>{i.geometry&&i.geometry.dispose(),i.material&&(Array.isArray(i.material)?i.material:[i.material]).forEach(s=>{Object.keys(s).forEach(o=>{s[o]&&s[o].isTexture&&s[o].dispose()}),s.dispose()})})}var oe=`
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
}`;function ne(e,i){let[s,o,l]=E(e,i),a=new M,u=new K(-1,1,1,-1,0,1),n={uTime:{value:0},uColorA:{value:s},uColorB:{value:o},uColorC:{value:l},uPointer:{value:[.5,.5]},uAspect:{value:1}},f=new S({uniforms:n,depthWrite:!1,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:`
			precision highp float;
			varying vec2 vUv;
			uniform float uTime; uniform float uAspect;
			uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
			uniform vec2 uPointer;
			${oe}
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
			}`}),v=new F(new I(2,2),f);return a.add(v),{scene:a,camera:u,update(h,t,c){n.uTime.value=h,n.uPointer.value=[.5+c.x*.5,.5-c.y*.5]},resize(h,t){n.uAspect.value=h/Math.max(1,t)},dispose(){L(a)}}}function Z(e,i){let[s,o]=E(e,i),l=Math.round(1600*(i.density||1)),a=new M,u=new A(60,1,.1,100);u.position.z=6;let n=new Float32Array(l*3),f=new Float32Array(l*3),v=new Float32Array(l),h=new B;for(let r=0;r<l;r++){let y=2+Math.random()*6,g=Math.random()*Math.PI*2,w=Math.acos(2*Math.random()-1);n[r*3]=y*Math.sin(w)*Math.cos(g),n[r*3+1]=y*Math.sin(w)*Math.sin(g)*.6,n[r*3+2]=y*Math.cos(w)-2,h.copy(s).lerp(o,Math.random()),f.set([h.r,h.g,h.b],r*3),v[r]=.4+Math.random()}let t=new D;t.setAttribute("position",new P(n,3)),t.setAttribute("color",new P(f,3)),t.setAttribute("aScale",new P(v,1));let c=new S({transparent:!0,depthWrite:!1,blending:j,vertexColors:!0,uniforms:{uSize:{value:26},uPixelRatio:{value:1}},vertexShader:`
			attribute float aScale; varying vec3 vColor; uniform float uSize; uniform float uPixelRatio;
			void main(){
				vColor = color;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = uSize * aScale * uPixelRatio / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,fragmentShader:`
			varying vec3 vColor;
			void main(){
				float d = length(gl_PointCoord - 0.5);
				float a = smoothstep(0.5, 0.0, d);
				gl_FragColor = vec4(vColor, a * 0.9);
				#include <colorspace_fragment>
			}`}),p=new G(t,c),d=new _;return d.add(p),a.add(d),{scene:a,camera:u,setPixelRatio(r){c.uniforms.uPixelRatio.value=r},update(r,y,g){p.rotation.y=r*.03,p.rotation.x=Math.sin(r*.02)*.2,d.rotation.y+=(g.x*.25-d.rotation.y)*.04,d.rotation.x+=(g.y*.15-d.rotation.x)*.04},resize(r,y){u.aspect=r/Math.max(1,y),u.updateProjectionMatrix()},dispose(){L(a)}}}function ie(e,i){let[s,o]=E(e,i),l=Math.round(90*Math.min(2,i.density||1)),a=new M,u=new A(50,1,.1,100);u.position.set(0,2.2,5.5),u.lookAt(0,0,0);let n=new I(14,9,l,Math.round(l*.6));n.rotateX(-Math.PI/2);let f={uTime:{value:0},uColorA:{value:s},uColorB:{value:o},uPointer:{value:[0,0]},uPixelRatio:{value:1}},v=new S({uniforms:f,transparent:!0,depthWrite:!1,vertexShader:`
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
			}`,fragmentShader:`
			uniform vec3 uColorA; uniform vec3 uColorB; varying float vH;
			void main(){
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				vec3 col = mix(uColorA, uColorB, smoothstep(-0.5, 0.7, vH));
				gl_FragColor = vec4(col, 0.85);
				#include <colorspace_fragment>
			}`}),h=new G(n,v);return a.add(h),{scene:a,camera:u,setPixelRatio(t){f.uPixelRatio.value=t},update(t,c,p){f.uTime.value=t;let d=f.uPointer.value;d[0]+=(p.x-d[0])*.05,d[1]+=(-p.y-d[1])*.05},resize(t,c){u.aspect=t/Math.max(1,c),u.updateProjectionMatrix()},dispose(){L(a)}}}function ae(e,i,s){let o=E(e,i),l=new M,a=new q(s),u=a.fromScene(new Q,.04).texture;l.environment=u,a.dispose();let n=new A(40,1,.1,100);n.position.z=9;let f=[new X(1,1),new N(.7,.26,160,24),new Y(.8,.3,32,96)],v=new _,h=Math.max(3,Math.round(6*(i.density||1))),t=[];for(let c=0;c<h;c++){let p=new $({color:o[c%o.length],roughness:.25,metalness:.1,clearcoat:1,clearcoatRoughness:.2}),d=new F(f[c%f.length],p),r=c/h*Math.PI*2;d.position.set(Math.cos(r)*3.6,Math.sin(r)*1.9,-Math.random()*2);let y=.5+Math.random()*.6;d.scale.setScalar(y),t.push({mesh:d,base:d.position.clone(),speed:.4+Math.random()*.6,phase:Math.random()*Math.PI*2}),v.add(d)}return l.add(v),{scene:l,camera:n,update(c,p,d){t.forEach(r=>{r.mesh.position.y=r.base.y+Math.sin(c*r.speed+r.phase)*.35,r.mesh.rotation.x=c*.3*r.speed,r.mesh.rotation.y=c*.2*r.speed}),v.rotation.y+=(d.x*.3-v.rotation.y)*.04,v.rotation.x+=(d.y*.2-v.rotation.x)*.04},resize(c,p){n.aspect=c/Math.max(1,p),n.position.z=n.aspect<1?13:9,n.updateProjectionMatrix()},dispose(){L(l),u.dispose()}}}var re={gradient:ne,particles:Z,waves:ie,orbs:ae},se=8,z=0,R=(e,i,s,o)=>typeof e=="number"&&isFinite(e)?Math.min(s,Math.max(i,e)):o;function de(e,i={},s={}){let o=Object.assign({},i,{density:R(i.density,.1,3,1),speed:R(i.speed,0,5,1),opacity:R(i.opacity,0,1,void 0),exposure:R(i.exposure,.1,4,1),colors:Array.isArray(i.colors)?i.colors.slice(0,3).map(String):[]});if(z>=se)return e.classList.add("bme-3d-fallback"),null;let l=o.mode==="element",a=document.createElement("canvas");a.className="bme-3d-canvas",a.setAttribute("aria-hidden","true"),a.style.cssText="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;display:block;pointer-events:none;";let u={position:e.style.position,isolation:e.style.isolation};getComputedStyle(e).position==="static"&&(e.style.position="relative"),l||(a.style.zIndex="-1",e.style.isolation="isolate"),l?(e.appendChild(a),(o.interactive||o.orbit)&&(e.classList.add("bme-3d-interactive"),a.style.pointerEvents="auto"),o.orbit&&e.classList.add("bme-3d-orbit")):e.appendChild(a),typeof o.opacity=="number"&&e.style.setProperty("--bme-3d-opacity",String(o.opacity));let n;try{n=new J({canvas:a,alpha:!0,antialias:(window.devicePixelRatio||1)<2,powerPreference:o.scene==="model"?"high-performance":"low-power"})}catch{return a.remove(),e.style.position=u.position,e.style.isolation=u.isolation,e.classList.add("bme-3d-fallback"),null}z++,n.outputColorSpace=k,n.setClearColor(0,0);let f=Math.min(window.devicePixelRatio||1,s.dpr||1.5);n.setPixelRatio(f);let v={x:0,y:0},h=typeof o.speed=="number"?o.speed:1,t=null,c=!1,p=!1,d=0,r=0;function y(m){if(!t)return;let x=r?Math.min(.1,(m-r)/1e3):0;r=m,d+=x*h,t.update(d,x,v),t.controls&&t.controls.update(x),n.render(t.scene,t.camera)}function g(){let m=Math.min(4096,Math.max(1,e.clientWidth)),x=Math.min(4096,Math.max(1,e.clientHeight));n.setSize(m,x,!1),t&&(t.resize(m,x),c||y(performance.now()))}function w(){if(!(c||p||!t)){if(s.reduced){y(performance.now());return}c=!0,r=0,n.setAnimationLoop(y)}}function C(){c=!1,n.setAnimationLoop(null)}function O(m){let x=e.getBoundingClientRect();!x.width||!x.height||m.clientY<x.top-100||m.clientY>x.bottom+100||(v.x=Math.max(-1,Math.min(1,(m.clientX-x.left)/x.width*2-1)),v.y=Math.max(-1,Math.min(1,(m.clientY-x.top)/x.height*2-1)))}o.interactive&&!s.reduced&&window.addEventListener("pointermove",O,{passive:!0});let U=new ResizeObserver(g);U.observe(e);let b=null,H=()=>{e.classList.add("bme-3d-fallback"),b&&!p&&b.destroy()};a.addEventListener("webglcontextlost",m=>{m.preventDefault(),C(),setTimeout(H,0)});let T=!0;function V(){document.hidden?C():T&&w()}document.addEventListener("visibilitychange",V);let W=m=>{if(p){m.dispose();return}t=m,t.controls&&t.controls.addEventListener&&t.controls.addEventListener("change",()=>{!c&&!p&&n.render(t.scene,t.camera)}),t.setPixelRatio&&t.setPixelRatio(f),g(),w()};return o.scene==="model"?import("./chunk-2XHEBP3S.js").then(m=>m.modelScene(e,o,n,a)).then(W).catch(m=>{s.debug&&console.error("[Motion Studio] 3D model failed",m),H()}):W((re[o.scene]||Z)(e,o,n)),b={pause(){T=!1,C()},resume(){T=!0,document.hidden||w()},destroy(){p||(p=!0,C(),U.disconnect(),window.removeEventListener("pointermove",O),document.removeEventListener("visibilitychange",V),t&&(t.dispose(),t.controls&&t.controls.dispose()),n.dispose(),n.forceContextLoss(),a.remove(),e.style.position=u.position,e.style.isolation=u.isolation,e.classList.remove("bme-3d-interactive","bme-3d-orbit"),z=Math.max(0,z-1))}},b}export{de as mount};
