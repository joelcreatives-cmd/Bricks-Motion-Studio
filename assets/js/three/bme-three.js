/*! Bricks Motion Studio three build c120edb5ea */
import{Aa as J,Ba as Q,Ca as Z,E as B,F,G as C,I as A,K as X,R as G,aa as I,ba as Y,ca as O,da as $,e as k,ea as N,fa as z,ha as K,qa as R,ta as q,u as D}from"./chunk-FM4WOQ7X.js";var oe=["#5b3fc4","#c8497a","#2d9cdb"],M=null;function ne(e){if(M=M||document.createElement("canvas").getContext("2d"),!M||!e)return"";M.fillStyle="#010203",M.fillStyle=e;let o=String(M.fillStyle);return o==="#010203"&&!/^#010203$/i.test(e)?"":o}function ie(e,o,s){let n=(o||"").trim(),l=n.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);l&&(n=getComputedStyle(e).getPropertyValue(l[1]).trim()||(l[2]||"").trim());let a=new F;return a.setStyle(ne(n)||s),a}function E(e,o){let s=Array.isArray(o.colors)?o.colors:[];return oe.map((n,l)=>ie(e,s[l]||s[l%Math.max(1,s.length)]||"",n))}function T(e){e.traverse(o=>{o.geometry&&o.geometry.dispose(),o.material&&(Array.isArray(o.material)?o.material:[o.material]).forEach(s=>{Object.keys(s).forEach(n=>{s[n]&&s[n].isTexture&&s[n].dispose()}),s.dispose()})})}var re=`
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
}`;function ae(e,o){let[s,n,l]=E(e,o),a=new C,d=new q(-1,1,1,-1,0,1),i={uTime:{value:0},uColorA:{value:s},uColorB:{value:n},uColorC:{value:l},uPointer:{value:[.5,.5]},uAspect:{value:1}},f=new z({uniforms:i,depthWrite:!1,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:`
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
			}`}),v=new G(new O(2,2),f);return a.add(v),{scene:a,camera:d,update(h,t,c){i.uTime.value=h,i.uPointer.value=[.5+c.x*.5,.5-c.y*.5]},resize(h,t){i.uAspect.value=h/Math.max(1,t)},dispose(){T(a)}}}function ee(e,o){let[s,n]=E(e,o),l=Math.round(1600*(o.density||1)),a=new C,d=new R(60,1,.1,100);d.position.z=6;let i=new Float32Array(l*3),f=new Float32Array(l*3),v=new Float32Array(l),h=new F;for(let r=0;r<l;r++){let y=2+Math.random()*6,g=Math.random()*Math.PI*2,w=Math.acos(2*Math.random()-1);i[r*3]=y*Math.sin(w)*Math.cos(g),i[r*3+1]=y*Math.sin(w)*Math.sin(g)*.6,i[r*3+2]=y*Math.cos(w)-2,h.copy(s).lerp(n,Math.random()),f.set([h.r,h.g,h.b],r*3),v[r]=.4+Math.random()}let t=new X;t.setAttribute("position",new A(i,3)),t.setAttribute("color",new A(f,3)),t.setAttribute("aScale",new A(v,1));let c=new z({transparent:!0,depthWrite:!1,blending:k,vertexColors:!0,uniforms:{uSize:{value:26},uPixelRatio:{value:1}},vertexShader:`
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
			}`}),p=new I(t,c),u=new B;return u.add(p),a.add(u),{scene:a,camera:d,setPixelRatio(r){c.uniforms.uPixelRatio.value=r},update(r,y,g){p.rotation.y=r*.03,p.rotation.x=Math.sin(r*.02)*.2,u.rotation.y+=(g.x*.25-u.rotation.y)*.04,u.rotation.x+=(g.y*.15-u.rotation.x)*.04},resize(r,y){d.aspect=r/Math.max(1,y),d.updateProjectionMatrix()},dispose(){T(a)}}}function se(e,o){let[s,n]=E(e,o),l=Math.round(90*Math.min(2,o.density||1)),a=new C,d=new R(50,1,.1,100);d.position.set(0,2.2,5.5),d.lookAt(0,0,0);let i=new O(14,9,l,Math.round(l*.6));i.rotateX(-Math.PI/2);let f={uTime:{value:0},uColorA:{value:s},uColorB:{value:n},uPointer:{value:[0,0]},uPixelRatio:{value:1}},v=new z({uniforms:f,transparent:!0,depthWrite:!1,vertexShader:`
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
			}`}),h=new I(i,v);return a.add(h),{scene:a,camera:d,setPixelRatio(t){f.uPixelRatio.value=t},update(t,c,p){f.uTime.value=t;let u=f.uPointer.value;u[0]+=(p.x-u[0])*.05,u[1]+=(-p.y-u[1])*.05},resize(t,c){d.aspect=t/Math.max(1,c),d.updateProjectionMatrix()},dispose(){T(a)}}}function ce(e,o,s){let n=E(e,o),l=new C,a=new J(s),d=a.fromScene(new Z,.04).texture;l.environment=d,a.dispose();let i=new R(40,1,.1,100);i.position.z=9;let f=[new Y(1,1),new N(.7,.26,160,24),new $(.8,.3,32,96)],v=new B,h=Math.max(3,Math.round(6*(o.density||1))),t=[];for(let c=0;c<h;c++){let p=new K({color:n[c%n.length],roughness:.25,metalness:.1,clearcoat:1,clearcoatRoughness:.2}),u=new G(f[c%f.length],p),r=c/h*Math.PI*2;u.position.set(Math.cos(r)*3.6,Math.sin(r)*1.9,-Math.random()*2);let y=.5+Math.random()*.6;u.scale.setScalar(y),t.push({mesh:u,base:u.position.clone(),speed:.4+Math.random()*.6,phase:Math.random()*Math.PI*2}),v.add(u)}return l.add(v),{scene:l,camera:i,update(c,p,u){t.forEach(r=>{r.mesh.position.y=r.base.y+Math.sin(c*r.speed+r.phase)*.35,r.mesh.rotation.x=c*.3*r.speed,r.mesh.rotation.y=c*.2*r.speed}),v.rotation.y+=(u.x*.3-v.rotation.y)*.04,v.rotation.x+=(u.y*.2-v.rotation.x)*.04},resize(c,p){i.aspect=c/Math.max(1,p),i.position.z=i.aspect<1?13:9,i.updateProjectionMatrix()},dispose(){T(l),d.dispose()}}}var le={gradient:ae,particles:ee,waves:se,orbs:ce},te=8,b=0,L=(e,o,s,n)=>typeof e=="number"&&isFinite(e)?Math.min(s,Math.max(o,e)):n;function me(){return b>=te}function pe(e,o={},s={}){let n=Object.assign({},o,{density:L(o.density,.1,3,1),speed:L(o.speed,0,5,1),opacity:L(o.opacity,0,1,void 0),exposure:L(o.exposure,.1,4,1),colors:Array.isArray(o.colors)?o.colors.slice(0,3).map(String):[]});if(b>=te)return null;let l=n.mode==="element",a=document.createElement("canvas");a.className="bme-3d-canvas",a.setAttribute("aria-hidden","true"),a.style.cssText="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;display:block;pointer-events:none;";let d={position:e.style.position,isolation:e.style.isolation};getComputedStyle(e).position==="static"&&(e.style.position="relative"),l||(a.style.zIndex="-1",e.style.isolation="isolate"),l?(e.appendChild(a),(n.interactive||n.orbit)&&(e.classList.add("bme-3d-interactive"),a.style.pointerEvents="auto"),n.orbit&&e.classList.add("bme-3d-orbit")):e.appendChild(a),typeof n.opacity=="number"&&e.style.setProperty("--bme-3d-opacity",String(n.opacity));let i;try{i=new Q({canvas:a,alpha:!0,antialias:(window.devicePixelRatio||1)<2,powerPreference:n.scene==="model"?"high-performance":"low-power"})}catch{return a.remove(),e.style.position=d.position,e.style.isolation=d.isolation,e.classList.add("bme-3d-fallback"),null}b++,i.outputColorSpace=D,i.setClearColor(0,0);let f=Math.min(window.devicePixelRatio||1,s.dpr||1.5);i.setPixelRatio(f);let v={x:0,y:0},h=typeof n.speed=="number"?n.speed:1,t=null,c=!1,p=!1,u=0,r=0;function y(m){if(!t)return;let x=r?Math.min(.1,(m-r)/1e3):0;r=m,u+=x*h,t.update(u,x,v),t.controls&&t.controls.update(x),i.render(t.scene,t.camera)}function g(){let m=Math.min(4096,Math.max(1,e.clientWidth)),x=Math.min(4096,Math.max(1,e.clientHeight));i.setSize(m,x,!1),t&&(t.resize(m,x),c||y(performance.now()))}function w(){if(!(c||p||!t)){if(s.reduced){y(performance.now());return}c=!0,r=0,i.setAnimationLoop(y)}}function P(){c=!1,i.setAnimationLoop(null)}function U(m){let x=e.getBoundingClientRect();!x.width||!x.height||m.clientY<x.top-100||m.clientY>x.bottom+100||(v.x=Math.max(-1,Math.min(1,(m.clientX-x.left)/x.width*2-1)),v.y=Math.max(-1,Math.min(1,(m.clientY-x.top)/x.height*2-1)))}n.interactive&&!s.reduced&&window.addEventListener("pointermove",U,{passive:!0});let H=new ResizeObserver(g);H.observe(e);let S=null,V=()=>{p||(e.classList.remove("bme-3d-ready"),e.classList.add("bme-3d-fallback"),S&&S.destroy())};a.addEventListener("webglcontextlost",m=>{p||(m.preventDefault(),P(),setTimeout(V,0))});let _=!0;function W(){document.hidden?P():_&&w()}document.addEventListener("visibilitychange",W);let j=m=>{if(p){m.dispose();return}t=m,t.controls&&t.controls.addEventListener&&t.controls.addEventListener("change",()=>{!c&&!p&&i.render(t.scene,t.camera)}),t.setPixelRatio&&t.setPixelRatio(f),g(),w(),e.classList.add("bme-3d-ready")};return n.scene==="model"?import("./chunk-4FZFA54N.js").then(m=>m.modelScene(e,n,i,a)).then(j).catch(m=>{s.debug&&console.error("[Motion Studio] 3D model failed",m),V()}):j((le[n.scene]||ee)(e,n,i)),S={pause(){_=!1,P()},resume(){_=!0,document.hidden||w()},destroy(){p||(p=!0,P(),H.disconnect(),window.removeEventListener("pointermove",U),document.removeEventListener("visibilitychange",W),t&&(t.dispose(),t.controls&&t.controls.dispose()),i.dispose(),i.forceContextLoss(),a.remove(),e.classList.remove("bme-3d-ready"),e.style.position=d.position,e.style.isolation=d.isolation,e.classList.remove("bme-3d-interactive","bme-3d-orbit"),b=Math.max(0,b-1))}},S}export{me as busy,pe as mount};
