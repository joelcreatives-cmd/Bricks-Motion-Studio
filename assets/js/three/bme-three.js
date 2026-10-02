/*! Bricks Motion Studio three build b8cdd42be8 */
import{Aa as J,Ba as Q,Ca as Z,E as F,F as B,G as C,I as A,K as k,R as I,aa as G,ba as X,ca as O,da as Y,e as $,ea as N,fa as z,ha as q,qa as R,ta as K,u as j}from"./chunk-SIRRERVH.js";var oe=["#5b3fc4","#c8497a","#2d9cdb"],g=null;function ie(e){if(!g){let r=document.createElement("canvas");r.width=r.height=1,g=r.getContext("2d",{willReadFrequently:!0})}if(!g||!e||(g.fillStyle="#010203",g.fillStyle=e,String(g.fillStyle)==="#010203"&&!/^#010203$/i.test(e)))return"";g.clearRect(0,0,1,1),g.fillRect(0,0,1,1);let i=g.getImageData(0,0,1,1).data;return"rgb("+i[0]+","+i[1]+","+i[2]+")"}function ne(e,i,r){let o=(i||"").trim(),l=o.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);l&&(o=getComputedStyle(e).getPropertyValue(l[1]).trim()||(l[2]||"").trim()),/^currentcolor$/i.test(o)&&(o=getComputedStyle(e).color);let s=new B;return s.setStyle(ie(o)||r),s}function E(e,i){let r=Array.isArray(i.colors)?i.colors:[];return oe.map((o,l)=>ne(e,r[l]||r[l%Math.max(1,r.length)]||"",o))}function T(e){e.traverse(i=>{i.geometry&&i.geometry.dispose(),i.material&&(Array.isArray(i.material)?i.material:[i.material]).forEach(r=>{Object.keys(r).forEach(o=>{r[o]&&r[o].isTexture&&r[o].dispose()}),r.dispose()})})}var re=`
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
}`;function ae(e,i){let[r,o,l]=E(e,i),s=new C,d=new K(-1,1,1,-1,0,1),n={uTime:{value:0},uColorA:{value:r},uColorB:{value:o},uColorC:{value:l},uPointer:{value:[.5,.5]},uAspect:{value:1}},f=new z({uniforms:n,depthWrite:!1,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:`
			precision highp float;
			varying vec2 vUv;
			uniform float uTime; uniform float uAspect;
			uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
			uniform vec2 uPointer;
			${re}
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
			}`}),v=new I(new O(2,2),f);return s.add(v),{scene:s,camera:d,update(h,t,c){n.uTime.value=h,n.uPointer.value=[.5+c.x*.5,.5-c.y*.5]},resize(h,t){n.uAspect.value=h/Math.max(1,t)},dispose(){T(s)}}}function ee(e,i){let[r,o]=E(e,i),l=Math.round(1600*(i.density||1)),s=new C,d=new R(60,1,.1,100);d.position.z=6;let n=new Float32Array(l*3),f=new Float32Array(l*3),v=new Float32Array(l),h=new B;for(let a=0;a<l;a++){let y=2+Math.random()*6,w=Math.random()*Math.PI*2,M=Math.acos(2*Math.random()-1);n[a*3]=y*Math.sin(M)*Math.cos(w),n[a*3+1]=y*Math.sin(M)*Math.sin(w)*.6,n[a*3+2]=y*Math.cos(M)-2,h.copy(r).lerp(o,Math.random()),f.set([h.r,h.g,h.b],a*3),v[a]=.4+Math.random()}let t=new k;t.setAttribute("position",new A(n,3)),t.setAttribute("color",new A(f,3)),t.setAttribute("aScale",new A(v,1));let c=new z({transparent:!0,depthWrite:!1,blending:$,vertexColors:!0,uniforms:{uSize:{value:26},uPixelRatio:{value:1}},vertexShader:`
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
			}`}),p=new G(t,c),u=new F;return u.add(p),s.add(u),{scene:s,camera:d,setPixelRatio(a){c.uniforms.uPixelRatio.value=a},update(a,y,w){p.rotation.y=a*.03,p.rotation.x=Math.sin(a*.02)*.2,u.rotation.y+=(w.x*.25-u.rotation.y)*.04,u.rotation.x+=(w.y*.15-u.rotation.x)*.04},resize(a,y){d.aspect=a/Math.max(1,y),d.updateProjectionMatrix()},dispose(){T(s)}}}function se(e,i){let[r,o]=E(e,i),l=Math.round(90*Math.min(2,i.density||1)),s=new C,d=new R(50,1,.1,100);d.position.set(0,2.2,5.5),d.lookAt(0,0,0);let n=new O(14,9,l,Math.round(l*.6));n.rotateX(-Math.PI/2);let f={uTime:{value:0},uColorA:{value:r},uColorB:{value:o},uPointer:{value:[0,0]},uPixelRatio:{value:1}},v=new z({uniforms:f,transparent:!0,depthWrite:!1,vertexShader:`
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
			}`}),h=new G(n,v);return s.add(h),{scene:s,camera:d,setPixelRatio(t){f.uPixelRatio.value=t},update(t,c,p){f.uTime.value=t;let u=f.uPointer.value;u[0]+=(p.x-u[0])*.05,u[1]+=(-p.y-u[1])*.05},resize(t,c){d.aspect=t/Math.max(1,c),d.updateProjectionMatrix()},dispose(){T(s)}}}function ce(e,i,r){let o=E(e,i),l=new C,s=new J(r),d=s.fromScene(new Z,.04).texture;l.environment=d,s.dispose();let n=new R(40,1,.1,100);n.position.z=9;let f=[new X(1,1),new N(.7,.26,160,24),new Y(.8,.3,32,96)],v=new F,h=Math.max(3,Math.round(6*(i.density||1))),t=[];for(let c=0;c<h;c++){let p=new q({color:o[c%o.length],roughness:.25,metalness:.1,clearcoat:1,clearcoatRoughness:.2}),u=new I(f[c%f.length],p),a=c/h*Math.PI*2;u.position.set(Math.cos(a)*3.6,Math.sin(a)*1.9,-Math.random()*2);let y=.5+Math.random()*.6;u.scale.setScalar(y),t.push({mesh:u,base:u.position.clone(),speed:.4+Math.random()*.6,phase:Math.random()*Math.PI*2}),v.add(u)}return l.add(v),{scene:l,camera:n,update(c,p,u){t.forEach(a=>{a.mesh.position.y=a.base.y+Math.sin(c*a.speed+a.phase)*.35,a.mesh.rotation.x=c*.3*a.speed,a.mesh.rotation.y=c*.2*a.speed}),v.rotation.y+=(u.x*.3-v.rotation.y)*.04,v.rotation.x+=(u.y*.2-v.rotation.x)*.04},resize(c,p){n.aspect=c/Math.max(1,p),n.position.z=n.aspect<1?13:9,n.updateProjectionMatrix()},dispose(){T(l),d.dispose()}}}var le={gradient:ae,particles:ee,waves:se,orbs:ce},te=8,b=0,L=(e,i,r,o)=>typeof e=="number"&&isFinite(e)?Math.min(r,Math.max(i,e)):o;function me(){return b>=te}function pe(e,i={},r={}){let o=Object.assign({},i,{density:L(i.density,.1,3,1),speed:L(i.speed,0,5,1),opacity:L(i.opacity,0,1,void 0),exposure:L(i.exposure,.1,4,1),colors:Array.isArray(i.colors)?i.colors.slice(0,3).map(String):[]});if(b>=te)return null;let l=o.mode==="element",s=document.createElement("canvas");s.className="bme-3d-canvas",s.setAttribute("aria-hidden","true"),s.style.cssText="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;display:block;pointer-events:none;";let d={position:e.style.position,isolation:e.style.isolation};getComputedStyle(e).position==="static"&&(e.style.position="relative"),l||(s.style.zIndex="-1",e.style.isolation="isolate"),l?(e.appendChild(s),(o.interactive||o.orbit)&&(e.classList.add("bme-3d-interactive"),s.style.pointerEvents="auto"),o.orbit&&e.classList.add("bme-3d-orbit")):e.appendChild(s),typeof o.opacity=="number"&&e.style.setProperty("--bme-3d-opacity",String(o.opacity));let n;try{n=new Q({canvas:s,alpha:!0,antialias:(window.devicePixelRatio||1)<2,powerPreference:o.scene==="model"?"high-performance":"low-power"})}catch{return s.remove(),e.style.position=d.position,e.style.isolation=d.isolation,e.classList.add("bme-3d-fallback"),null}b++,n.outputColorSpace=j,n.setClearColor(0,0);let f=Math.min(window.devicePixelRatio||1,r.dpr||1.5);n.setPixelRatio(f);let v={x:0,y:0},h=typeof o.speed=="number"?o.speed:1,t=null,c=!1,p=!1,u=0,a=0;function y(m){if(!t)return;let x=a?Math.min(.1,(m-a)/1e3):0;a=m,u+=x*h,t.update(u,x,v),t.controls&&t.controls.update(x),n.render(t.scene,t.camera)}function w(){let m=Math.min(4096,Math.max(1,e.clientWidth)),x=Math.min(4096,Math.max(1,e.clientHeight));n.setSize(m,x,!1),t&&(t.resize(m,x),c||y(performance.now()))}function M(){if(!(c||p||!t)){if(r.reduced){y(performance.now());return}c=!0,a=0,n.setAnimationLoop(y)}}function P(){c=!1,n.setAnimationLoop(null)}function U(m){let x=e.getBoundingClientRect();!x.width||!x.height||m.clientY<x.top-100||m.clientY>x.bottom+100||(v.x=Math.max(-1,Math.min(1,(m.clientX-x.left)/x.width*2-1)),v.y=Math.max(-1,Math.min(1,(m.clientY-x.top)/x.height*2-1)))}o.interactive&&!r.reduced&&window.addEventListener("pointermove",U,{passive:!0});let H=new ResizeObserver(w);H.observe(e);let S=null,V=()=>{p||(e.classList.remove("bme-3d-ready"),e.classList.add("bme-3d-fallback"),S&&S.destroy(),r.onFail&&r.onFail())};s.addEventListener("webglcontextlost",m=>{p||(m.preventDefault(),P(),setTimeout(V,0))});let _=!0;function W(){document.hidden?P():_&&M()}document.addEventListener("visibilitychange",W);let D=m=>{if(p){m.dispose();return}t=m,t.controls&&t.controls.addEventListener&&t.controls.addEventListener("change",()=>{!c&&!p&&n.render(t.scene,t.camera)}),t.setPixelRatio&&t.setPixelRatio(f),w(),M(),e.classList.add("bme-3d-ready")};return o.scene==="model"?import("./chunk-T77XJIJB.js").then(m=>m.modelScene(e,o,n,s)).then(D).catch(m=>{r.debug&&console.error("[Motion Studio] 3D model failed",m),V()}):D((le[o.scene]||ee)(e,o,n)),S={pause(){_=!1,P()},resume(){_=!0,document.hidden||M()},destroy(){p||(p=!0,P(),H.disconnect(),window.removeEventListener("pointermove",U),document.removeEventListener("visibilitychange",W),t&&(t.dispose(),t.controls&&t.controls.dispose()),n.dispose(),n.forceContextLoss(),s.remove(),e.classList.remove("bme-3d-ready"),e.style.position=d.position,e.style.isolation=d.isolation,e.classList.remove("bme-3d-interactive","bme-3d-orbit"),b=Math.max(0,b-1))}},S}export{me as busy,pe as mount};
