import * as THREE from 'three';
import { installDomShim } from './tools/dom-shim.mjs';
installDomShim();
const { Penguin } = await import('./src/animals/Penguin.js');
const a = new Penguin(new THREE.Scene(), {});
const sculpted = a.config.sculpt();
const prims = sculpted.surface.primitives;
// take a known vertex from built mesh
const m = a.meshes.find(x=>x.name==='Skin_skin');
const p = m.geometry.attributes.position, c = m.geometry.attributes.color;
let target=null;
for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i); if(x>0.17&&Math.abs(y-0.4)<0.02&&Math.abs(z)<0.02){target=[x,y,z,c.getX(i),c.getY(i),c.getZ(i)];break;}}
console.log('target',target);
const [tx,ty,tz]=target;
const list=prims.map((pr,i)=>{
  let d;
  if(pr.kind==='ellipsoid'){ d=Math.sqrt(((tx-pr.center.x)/pr.radius.x)**2+((ty-pr.center.y)/pr.radius.y)**2+((tz-pr.center.z)/pr.radius.z)**2); d=Math.abs(d-1)*Math.min(pr.radius.x,pr.radius.y,pr.radius.z); }
  else { d=0; }
  return {i,color:pr.color?pr.color.getHexString():null,sharp:pr.sharp,paint:pr.paint,paintOnly:pr.paintOnly,d:+d.toFixed(4),kind:pr.kind};
}).sort((a,b)=>a.d-b.d).slice(0,10);
console.log(list);
