import * as THREE from './vendor/three.module.js';
import { WEAPONS } from './weapons.js';
import { NOSTALGOS12 as colors, WEAPON_COLORS } from './palette.js';

// Canonical view-space guns face -Z. The same models are scaled / rotated for
// remote players; grip anchors keep the existing two-bone arm IK attached.
let shared;
function resources() {
  if (shared) { shared.users++; return shared; }
  const geometry = new Map(), materials = new Map();
  const bands = new THREE.DataTexture(new Uint8Array([104,104,104,255,191,191,191,255,255,255,255,255]),3,1,THREE.RGBAFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter; bands.needsUpdate = true;
  const ink = new THREE.LineBasicMaterial({color:colors.ink});
  shared = { users:1, geometry, materials, bands, ink,
    geo(key,build) { if(!geometry.has(key))geometry.set(key,build());return geometry.get(key); },
    mat(color) { if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color,gradientMap:bands,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));return materials.get(color); },
  };return shared;
}
export function createWeaponModel(type, { arms = false, detail = true } = {}) {
  const config = WEAPONS.find(w=>w.type===type);if(!config)throw new Error(`Unknown weapon: ${type}`);
  const cache=resources(),group=new THREE.Group();group.name=type;group.userData.weapon=type;
  const dark=colors.ink, paint=WEAPON_COLORS[type], light=colors.paper;
  group.userData.primaryColor=paint;
  let magazine,magazineGripOffset,slide,pump,bolt,drum,cartridge,shotAge=100,drumAngle=0,disposed=false;
  const trigger=new THREE.Vector3(0,-.17,.18),support=new THREE.Vector3(0,-.136,-.50);
  function mesh(parent,geo,color,pos=[0,0,0],rot=[0,0,0]) {
    const m=new THREE.Mesh(geo,cache.mat(color));m.position.set(...pos);m.rotation.set(...rot);parent.add(m);
    if(detail){const key=`edge:${geo.uuid}`;m.add(new THREE.LineSegments(cache.geo(key,()=>new THREE.EdgesGeometry(geo,25)),cache.ink));}return m;
  }
  function box(size,color,pos,rot,parent=group){return mesh(parent,cache.geo(`box:${size}`,()=>new THREE.BoxGeometry(...size)),color,pos,rot);}
  function cyl(radius,length,color,pos,rot=[Math.PI/2,0,0],parent=group,segments=10){return mesh(parent,cache.geo(`cyl:${radius}:${length}:${segments}`,()=>new THREE.CylinderGeometry(radius,radius,length,segments)),color,pos,rot);}
  function moving(name){const g=new THREE.Group();g.name=name;group.add(g);return g;}
  function ironSight(z=.05,y=.25){
    box([.12,.025,.11],light,[0,y-.07,z]);
    for(const side of [-1,1])box([.022,.13,.022],dark,[side*.054,y,z]);
    box([.13,.022,.022],dark,[0,y+.065,z]);box([.009,.015,.01],colors.paper,[0,y-.015,z-.01]);
  }
  function longGrip(stockColor=dark){box([.09,.22,.11],dark,[0,-.17,.18],[-.29,0,0]);box([.12,.12,.3],stockColor,[0,-.005,.34]);box([.145,.24,.065],dark,[0,-.035,.49]);}
  function mag(size,pos,pitch=0){
    magazine=moving('Magazine');magazine.position.set(...pos);magazine.rotation.x=pitch;
    magazineGripOffset=new THREE.Vector3(-size[0]/2-.025,-size[1]*.28,0);
    box(size,paint,[0,0,0],undefined,magazine);return magazine;
  }
  if(type==='rifle'){
    box([.16,.20,.48],paint,[0,0,0]);box([.14,.14,.48],paint,[0,.015,-.38]);box([.11,.115,.28],dark,[0,.015,-.67]);
    cyl(.035,.33,dark,[0,.025,-.94]);cyl(.048,.10,paint,[0,.025,-1.115]);longGrip(paint);mag([.10,.26,.13],[0,-.185,-.06]);ironSight(.055,.27);
    box([.12,.025,.62],dark,[0,.124,-.16]);if(detail)for(let i=0;i<7;i++)box([.145,.016,.02],light,[0,.145,-.45+i*.066]);
    box([.075,.06,.075],paint,[0,.162,.055]);
    box([.018,.04,.13],colors.butter,[-.081,.027,-.25]);
  }else if(type==='shotgun'){
    box([.18,.19,.42],paint,[0,-.01,0]);cyl(.052,.95,dark,[0,.045,-.59]);cyl(.043,.68,paint,[0,-.055,-.47]);longGrip(paint);
    pump=moving('Pump');pump.position.set(0,-.07,-.53);box([.17,.13,.29],paint,[0,0,0],undefined,pump);
    if(detail)for(let i=0;i<5;i++)box([.175,.14,.012],dark,[0,0,-.12+i*.054],undefined,pump);
    box([.025,.07,.04],colors.paper,[0,.105,-1.02]);support.set(0,-.15,-.53);cartridge=cyl(.026,.11,colors.coral,[.11,-.20,-.05]);cartridge.name='Cartridge';cartridge.visible=false;
  }else if(type==='smg'){
    // Compact tube receiver and an open stock give the SMG its own silhouette.
    cyl(.095,.42,paint,[0,.035,-.06]);
    box([.145,.09,.30],dark,[0,-.055,-.02]);
    cyl(.082,.28,dark,[0,.025,-.37]);
    cyl(.030,.14,paint,[0,.025,-.58]);cyl(.043,.04,dark,[0,.025,-.65]);
    for(const side of [-1,1]){
      box([.024,.024,.30],paint,[side*.07,.005,.27]);
      box([.022,.16,.025],dark,[side*.07,-.055,.42]);
    }
    box([.16,.022,.025],dark,[0,-.125,.42]);
    cyl(.042,.035,light,[.09,.005,.135],[0,0,Math.PI/2]);
    box([.09,.22,.12],dark,[0,-.16,.09],[-.24,0,0]);
    box([.105,.075,.135],paint,[0,-.10,-.12]);
    const stickMag=mag([.065,.37,.10],[0,-.255,-.12]);
    box([.085,.025,.12],dark,[0,-.19,0],undefined,stickMag);
    // Low ring sight is seated on the receiver; the front post shares its eye line.
    box([.115,.035,.075],paint,[0,.1125,.035]);
    mesh(group,cache.geo('smg:ring-sight',()=>new THREE.TorusGeometry(.052,.009,6,16)),dark,[0,.185,.035]);
    box([.07,.075,.04],paint,[0,.0925,-.49]);
    box([.018,.055,.02],dark,[0,.1575,-.49]);box([.012,.014,.014],colors.butter,[0,.178,-.49]);
    if(detail){
      for(const side of [-1,1])for(let i=0;i<3;i++)box([.008,.026,.035],paint,[side*.081,.03,-.29-i*.07]);
      box([.014,.035,.09],colors.gold,[-.096,.04,-.08]);
      box([.045,.024,.06],paint,[-.11,.075,-.18]);
    }
    trigger.set(0,-.16,.09);support.set(0,-.115,-.36);
  }else if(type==='sniper'){
    box([.19,.15,.80],paint,[0,-.025,-.12]);box([.15,.16,.38],paint,[0,.05,.08]);
    box([.15,.20,.39],paint,[0,-.06,.48]);box([.18,.26,.075],dark,[0,-.06,.70]);box([.10,.23,.12],dark,[0,-.19,.19],[-.3,0,0]);
    cyl(.038,.95,dark,[0,.045,-1.02]);cyl(.055,.12,paint,[0,.045,-1.44]);mag([.11,.16,.18],[0,-.16,-.04]);
    // Scope tube, objective bell, ocular lens, mounting rings and adjustment knobs.
    cyl(.075,.48,dark,[0,.27,-.17]);cyl(.115,.17,paint,[0,.27,-.45]);cyl(.10,.15,paint,[0,.27,.12]);
    cyl(.079,.012,colors.sky,[0,.27,.202]);cyl(.092,.012,colors.sky,[0,.27,-.54]);
    for(const z of [-.31,.025]){box([.09,.12,.07],paint,[0,.17,z]);cyl(.085,.055,paint,[0,.27,z]);}
    cyl(.045,.08,paint,[0,.36,-.16],[0,0,0]);cyl(.04,.08,paint,[.10,.27,-.16],[0,0,Math.PI/2]);
    bolt=moving('Bolt');bolt.position.set(.12,.08,.12);box([.16,.035,.035],paint,[.07,0,0],undefined,bolt);cyl(.043,.055,dark,[.16,0,0],[0,0,Math.PI/2],bolt);
    support.set(0,-.115,-.49);trigger.set(0,-.19,.19);
  }else if(type==='handcannon'){
    box([.16,.105,.59],dark,[0,-.055,-.16]);slide=moving('Slide');box([.18,.14,.68],paint,[0,.05,-.23],undefined,slide);
    box([.13,.025,.50],paint,[0,.135,-.23],undefined,slide);cyl(.038,.10,dark,[0,.065,-.55]);
    const grip=box([.13,.28,.16],dark,[0,-.22,.12],[-.25,0,0]);
    // Seat the magazine on the grip's axis, with only its base below the grip.
    mag([.11,.25,.12],grip.position.toArray(),grip.rotation.x).translateY(-.035);
    for(const side of [-1,1])box([.025,.055,.04],dark,[side*.065,.14,.07],undefined,slide);box([.02,.04,.025],dark,[0,.14,-.50],undefined,slide);
    if(detail)for(let i=0;i<5;i++)box([.009,.08,.014],paint,[.095,.045,.025-i*.027],undefined,slide);
    box([.11,.035,.15],paint,[0,-.17,-.03]);trigger.set(0,-.22,.12);support.set(-.07,-.23,.09);
  }else if(type==='revolver'){
    box([.14,.13,.38],paint,[0,.045,-.12]);box([.13,.28,.16],dark,[0,-.20,.15],[-.32,0,0]);
    box([.12,.14,.12],paint,[0,-.025,.10]);box([.055,.07,.08],dark,[0,.06,.11]);
    cyl(.045,.49,paint,[0,.07,-.51]);box([.105,.055,.5],paint,[0,.025,-.50]);box([.025,.055,.04],dark,[0,.14,-.68]);
    drum=moving('Cylinder');drum.position.set(0,.045,-.08);cyl(.12,.23,paint,[0,0,0],undefined,drum,12);
    for(let i=0;i<6;i++){const angle=i*Math.PI/3;cyl(.027,.012,dark,[Math.cos(angle)*.075,Math.sin(angle)*.075,-.12],undefined,drum,8);}
    box([.035,.09,.05],dark,[0,.12,.15],[-.3,0,0]);box([.10,.025,.15],paint,[0,-.15,-.02]);
    trigger.set(0,-.20,.15);support.set(-.07,-.22,.12);
  }
  const muzzle=new THREE.Object3D();muzzle.position.fromArray(config.muzzle);muzzle.name='Muzzle';group.add(muzzle);
  const triggerGrip=new THREE.Object3D(),supportGrip=new THREE.Object3D();triggerGrip.position.copy(trigger);supportGrip.position.copy(support);group.add(triggerGrip,supportGrip);
  let leftHand;const viewArms=[],armDirection=new THREE.Vector3(),wristPosition=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const pistol=type==='handcannon'||type==='revolver';
  if(arms){
    // Black, rounded hands and tapered forearms read as the stickman's body,
    // distinct from the flat, outlined paint of the gun and its magazine.
    const bodyColor=colors.ink,armsGroup=moving('View arms');
    const roundGeometry=cache.geo('view-hand:round',()=>new THREE.SphereGeometry(1,12,8));
    const armGeometry=cache.geo('view-arm:taper',()=>new THREE.CylinderGeometry(.044,.068,1,12));
    function rounded(parent,size,pos){
      const m=new THREE.Mesh(roundGeometry,cache.mat(bodyColor));m.scale.set(...size);m.position.set(...pos);parent.add(m);return m;
    }
    function hand(side,position,start){
      const h=new THREE.Group();h.name=`View ${side} hand`;h.position.copy(position);armsGroup.add(h);
      const gripping=side==='right'||pistol;
      rounded(h,gripping?[.061,.075,.065]:[.070,.043,.085],[0,0,0]);
      if(gripping){
        rounded(h,[.026,.053,.032],[-.043,.037,-.025]).rotation.z=-.35;
        for(let i=0;i<3;i++)rounded(h,[.046,.020,.026],[-.015,.035-i*.035,-.047]);
      }else{
        rounded(h,[.026,.050,.040],[-.060,.030,0]).rotation.z=-.25;
        for(let i=0;i<3;i++)rounded(h,[.025,.055,.023],[.055,.040,-.05+i*.05]).rotation.z=.2;
      }
      const wrist=rounded(armsGroup,[.045,.055,.045],[0,0,0]);wrist.name=`View ${side} wrist`;
      const forearm=new THREE.Mesh(armGeometry,cache.mat(bodyColor));forearm.name=`View ${side} forearm`;armsGroup.add(forearm);
      viewArms.push({hand:h,wrist,forearm,start:new THREE.Vector3(...start),offset:new THREE.Vector3(0,gripping?-.068:-.05,.035)});
      return h;
    }
    const rightHand=hand('right',trigger.clone().add(new THREE.Vector3(.035,0,.015)),[.34,-.95,.55]);rightHand.rotation.x=-.25;
    leftHand=hand('left',support,[-.40,-.95,.30]);
  }
  const magazineBase=magazine?.position.clone(),pumpBase=pump?.position.clone(),boltBase=bolt?.position.clone();
  const magazineRotation=magazine?.quaternion.clone();
  const magazineAxis=magazine?new THREE.Vector3(0,-1,0).applyQuaternion(magazineRotation):null;
  const magazineGrip=new THREE.Vector3(),handRotation=new THREE.Quaternion();
  const magazineHandRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  function fire(){shotAge=0;if(drum)drumAngle+=Math.PI/3;}
  function update(dt,{reload=0}={}){
    shotAge+=dt;const phase=reload>0&&reload<1?Math.sin(Math.PI*reload):0;
    if(magazine){
      // Follow the well's axis; tilt only after clearing it, and realign before insertion.
      magazine.position.copy(magazineBase).addScaledVector(magazineAxis,phase*.36);
      magazine.quaternion.copy(magazineRotation);magazine.rotateZ(THREE.MathUtils.smoothstep(phase,.75,1)*.12);
    }
    if(slide)slide.position.z=shotAge<.16?Math.sin(shotAge/.16*Math.PI)*.10:0;
    if(pump){pump.position.copy(pumpBase);if(shotAge>.10&&shotAge<.5)pump.position.z+=Math.sin((shotAge-.10)/.4*Math.PI)*.15;}
    if(bolt){bolt.position.copy(boltBase);if(shotAge>.16&&shotAge<.87){const t=(shotAge-.16)/.71;bolt.position.z+=Math.sin(t*Math.PI)*.14;bolt.rotation.z=-Math.sin(t*Math.PI)*.7;}else bolt.rotation.z=0;}
    if(drum){drum.position.x=-phase*.20;drum.rotation.z=THREE.MathUtils.lerp(drum.rotation.z,drumAngle,Math.min(1,dt*22));}
    supportGrip.position.copy(support);if(pump)supportGrip.position.z+=pump.position.z-pumpBase.z;
    const magazineHold=magazine?THREE.MathUtils.smoothstep(phase,0,.45):0;
    if(magazineHold>0){
      magazineGrip.copy(magazineGripOffset).applyQuaternion(magazine.quaternion).add(magazine.position);
      supportGrip.position.lerp(magazineGrip,magazineHold);
    }
    if(drum)supportGrip.position.x-=phase*.22;
    if(cartridge){cartridge.visible=phase>.15;cartridge.position.y=-.20-Math.abs(Math.sin(reload*Math.PI*4))*.12;supportGrip.position.lerp(cartridge.position,phase);}
    if(arms){
      leftHand.position.copy(supportGrip.position);
      leftHand.quaternion.identity();
      if(magazineHold>0)leftHand.quaternion.slerp(handRotation.copy(magazine.quaternion).multiply(magazineHandRotation),magazineHold);
      for(const arm of viewArms){
        wristPosition.copy(arm.offset).applyQuaternion(arm.hand.quaternion).add(arm.hand.position);arm.wrist.position.copy(wristPosition);
        armDirection.subVectors(wristPosition,arm.start);arm.forearm.position.copy(arm.start).add(wristPosition).multiplyScalar(.5);
        arm.forearm.scale.y=armDirection.length();arm.forearm.quaternion.setFromUnitVectors(up,armDirection.normalize());
      }
    }
  }
  function dispose(){if(disposed)return;disposed=true;group.removeFromParent();if(--cache.users===0){for(const g of cache.geometry.values())g.dispose();for(const m of cache.materials.values())m.dispose();cache.ink.dispose();cache.bands.dispose();if(shared===cache)shared=null;}}
  update(0);
  return {group,muzzle,triggerGrip,supportGrip,fire,update,dispose};
}
