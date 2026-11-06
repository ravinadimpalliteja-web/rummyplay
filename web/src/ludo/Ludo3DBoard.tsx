import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LudoPlayer } from "./ludoTypes";

type Props = { players: LudoPlayer[] | null; turn: number; die: number | null; onMove: (id: number) => void };

const colors = ["red", "green", "yellow", "blue"] as const;
type Color = typeof colors[number];
const starts = [0, 13, 26, 39];
const path: [number, number][] = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const homes: Record<Color, [number,number][]> = { red:[[1,1],[1,4],[4,1],[4,4]], green:[[1,10],[1,13],[4,10],[4,13]], yellow:[[10,10],[10,13],[13,10],[13,13]], blue:[[10,1],[10,4],[13,1],[13,4]] };
const lanes: Record<Color, [number,number][]> = { red:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], green:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]], yellow:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], blue:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]] };
const palette: Record<Color, number> = { red:0xd93443, green:0x16a36a, yellow:0xf0bd35, blue:0x267be0 };
const pos = (c: Color, s: number) => s < 51 ? (starts[colors.indexOf(c)] + s) % 52 : -1;

function roundedMaterial(color: number, roughness = .32, metalness = .12) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function makePawn(color: number) {
  const group = new THREE.Group();
  const gold = roundedMaterial(0xd9b96f, .22, .78);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness:.2, metalness:.32, clearcoat:1, clearcoatRoughness:.12 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.34,.38,.14,40), gold);
  base.position.y=.13; base.castShadow=true; base.receiveShadow=true; group.add(base);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.24,.3,.12,40), bodyMat);
  foot.position.y=.24; foot.castShadow=true; group.add(foot);
  const profile = [new THREE.Vector2(.20,0),new THREE.Vector2(.25,.08),new THREE.Vector2(.22,.16),new THREE.Vector2(.15,.34),new THREE.Vector2(.12,.48),new THREE.Vector2(.18,.62),new THREE.Vector2(.25,.72),new THREE.Vector2(.24,.78)];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile,40), bodyMat);
  body.position.y=.28; body.castShadow=true; body.receiveShadow=true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.23,32,24), bodyMat);
  head.position.y=1.08; head.castShadow=true; head.receiveShadow=true; group.add(head);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(.045,12,10), new THREE.MeshBasicMaterial({color:0xffffff}));
  glint.position.set(-.075,1.17,.17); group.add(glint);
  return group;
}
function tileColor(r:number,c:number) {
  if(r<6&&c<6)return 0x9e2635;
  if(r<6&&c>8)return 0x126b49;
  if(r>8&&c>8)return 0xb27c16;
  if(r>8&&c<6)return 0x205aab;
  const lane = colors.find(k=>lanes[k].some(([y,x])=>y===r&&x===c));
  if(lane)return palette[lane];
  if(path.some(([y,x])=>y===r&&x===c))return 0xf1ead7;
  return 0x153e30;
}
export default function Ludo3DBoard({players,turn,die,onMove}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const moveRef=useRef(onMove); moveRef.current=onMove;
  const stateRef=useRef({players,turn,die}); stateRef.current={players,turn,die};
  useEffect(()=>{
    const root=host.current; if(!root)return;
    const scene=new THREE.Scene(); scene.background=new THREE.Color(0x071b16);
    const camera=new THREE.PerspectiveCamera(34,1,.1,100); camera.position.set(17,23,25); camera.lookAt(0,0,0);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.18;
    renderer.domElement.className="ludo-3d-canvas"; root.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xdfffee,0x12251d,2.0));
    const key=new THREE.DirectionalLight(0xffe4a6,3.4); key.position.set(-9,18,12); key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-13;key.shadow.camera.right=13;key.shadow.camera.top=13;key.shadow.camera.bottom=-13;scene.add(key);
    const fill=new THREE.PointLight(0x21d99a,35,28);fill.position.set(8,9,-8);scene.add(fill);
    const goldLight=new THREE.PointLight(0xe8b957,28,24);goldLight.position.set(-9,6,7);scene.add(goldLight);
    const gold=roundedMaterial(0xd8b568,.22,.82), emerald=roundedMaterial(0x0b3c2c,.28,.48);
    const slab=new THREE.Mesh(new THREE.BoxGeometry(16.2,.72,16.2),emerald);slab.position.y=-.43;slab.castShadow=true;slab.receiveShadow=true;scene.add(slab);
    const bevel=new THREE.Mesh(new THREE.BoxGeometry(16.38,.18,16.38),gold);bevel.position.y=-.82;bevel.castShadow=true;scene.add(bevel);
    const under=new THREE.Mesh(new THREE.BoxGeometry(16.05,.2,16.05),roundedMaterial(0x061a13,.3,.35));under.position.y=-.98;under.castShadow=true;scene.add(under);
    const tileGeo=new THREE.BoxGeometry(.94,.2,.94);
    const tileMeshes:THREE.Mesh[]=[];
    for(let r=0;r<15;r++)for(let c=0;c<15;c++){
      const m=new THREE.Mesh(tileGeo,roundedMaterial(tileColor(r,c),.36,.08));
      m.position.set(c-7,.08,r-7);m.castShadow=true;m.receiveShadow=true;scene.add(m);tileMeshes.push(m);
      if(path.some(([y,x])=>y===r&&x===c)&&[0,8,13,21,26,34,39,47].includes(path.findIndex(([y,x])=>y===r&&x===c))){
        const star=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.035,5),gold);star.rotation.y=Math.PI/5;star.position.set(c-7,.205,r-7);scene.add(star);
      }
    }
    const homePads:[number,number,Color][]=[[3,3,"red"],[11,3,"green"],[11,11,"yellow"],[3,11,"blue"]];
    homePads.forEach(([x,z,col])=>{
      const pad=new THREE.Mesh(new THREE.BoxGeometry(5.55,.22,5.55),new THREE.MeshPhysicalMaterial({color:palette[col],roughness:.3,metalness:.28,clearcoat:.7}));
      pad.position.set(x-7,.2,z-7);pad.castShadow=true;pad.receiveShadow=true;scene.add(pad);
      const rim=new THREE.Mesh(new THREE.BoxGeometry(5.72,.12,5.72),gold);rim.position.set(x-7,.12,z-7);rim.castShadow=true;scene.add(rim);
    });
    const centerGroup=new THREE.Group();centerGroup.position.set(0,.22,0);scene.add(centerGroup);
    const wedges=[{c:0xd93443,rot:0},{c:0xf0bd35,rot:Math.PI/2},{c:0x267be0,rot:Math.PI},{c:0x16a36a,rot:Math.PI*1.5}];
    wedges.forEach(w=>{const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(0,1.12);shape.lineTo(1.12,0);shape.closePath();const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035}),new THREE.MeshPhysicalMaterial({color:w.c,roughness:.2,metalness:.25,clearcoat:1}));mesh.rotation.x=-Math.PI/2;mesh.rotation.z=w.rot;mesh.position.y=.02;mesh.castShadow=true;centerGroup.add(mesh);});
    const pawns: {mesh:THREE.Group;color:Color;id:number}[]=[];
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),clickTargets:THREE.Object3D[]=[];
    const handleClick=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(clickTargets,true);if(!hits.length)return;let obj:THREE.Object3D|null=hits[0].object;while(obj&&!obj.userData.token)obj=obj.parent;const token=obj?.userData.token as {color:Color;id:number}|undefined;const s=stateRef.current;if(token&&s.players&&s.players[s.turn]?.color===token.color&&s.die!==null)moveRef.current(token.id);};
    renderer.domElement.addEventListener("pointerdown",handleClick);
    const renderPawns=()=>{
      pawns.forEach(p=>scene.remove(p.mesh));pawns.length=0;clickTargets.length=0;
      stateRef.current.players?.forEach(p=>p.tokens.forEach(t=>{
        let xy:[number,number];if(t.step===-1)xy=homes[p.color][t.id];else if(t.step>=51)xy=lanes[p.color][t.step-51];else xy=path[pos(p.color,t.step)];
        const same=stateRef.current.players!.flatMap(q=>q.tokens.filter(v=>{if(v.step<0||v.step>=56)return false;let qxy:[number,number];if(v.step>=51)qxy=lanes[q.color][v.step-51];else qxy=path[pos(q.color,v.step)];return qxy[0]===xy[0]&&qxy[1]===xy[1]}));
        const offset=same.length>1?(t.id%2===0?-.13:.13):0;
        const mesh=makePawn(palette[p.color]);mesh.position.set(xy[1]-7+offset,.24,xy[0]-7+offset);mesh.userData.token={color:p.color,id:t.id};mesh.traverse(o=>{if((o as THREE.Mesh).isMesh){o.userData.token=mesh.userData.token;clickTargets.push(o)}});scene.add(mesh);pawns.push({mesh,color:p.color,id:t.id});
      }));
    };
    renderPawns();
    const resize=()=>{const w=root.clientWidth,h=Math.max(300,root.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(root);resize();
    let frame=0;const animate=()=>{frame=requestAnimationFrame(animate);pawns.forEach(p=>{const active=stateRef.current.players?.[stateRef.current.turn]?.color===p.color&&stateRef.current.die!==null;p.mesh.position.y=.24+(active?.035*Math.sin(performance.now()*.006):0)});renderer.render(scene,camera)};animate();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener("pointerdown",handleClick);pawns.forEach(p=>scene.remove(p.mesh));scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(Array.isArray(m.material))m.material.forEach(v=>v.dispose());else if(m.material)m.material.dispose()});renderer.dispose();renderer.domElement.remove();};
  },[]);
  useEffect(()=>{const root=host.current;if(!root)return;const canvas=root.querySelector("canvas");if(!canvas)return;const event=new Event("ludo-state-change");canvas.dispatchEvent(event);},[players,turn,die]);
  return <div className="ludo-3d-stage" ref={host} aria-label="Interactive three-dimensional Ludo board"><div className="ludo-3d-hint">3D BOARD · DRAG TO INSPECT</div></div>;
}
