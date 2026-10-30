import * as THREE from './vendor/three.module.js';
import { createWorld } from './world.js';
import { CombatAudio } from './audio.js';
import { createStickman, playerPoseSeed } from './enemy.js';
import { createPlayerController, PLAYER } from './physics.js';
import { enemyPositionBlocked } from './navigation.js';
import { WEAPONS as weapons, createAmmo, validWeapon, shotSpread, shotDamage } from './weapons.js';
import { createWeaponModel } from './weapon-models.js';
import { LanClient, RemotePlayers } from './multiplayer.js';
import { DeathView } from './death-view.js';
import { NOSTALGOS12 as colors, TEAM_COLORS, SOLDIER_HEADBAND_COLORS, WEAPON_COLORS, hex } from './palette.js';

const $ = id => document.getElementById(id);
const arena=$('arena'), canvas=$('game-canvas'), audio=new CombatAudio();
const INK=colors.ink, YELLOW=colors.butter;
const state={mode:'ready',health:100,kills:0,score:0,wave:1,time:180,ammo:createAmmo(),weapon:0,reload:0,reloadTotal:0,shotCooldown:0,weaponCooldowns:weapons.map(()=>0),triggerLatched:false,shooting:false,aiming:false,muted:false,waveWait:0,damage:0,hit:0,pop:0,banner:0,footstep:0,elapsed:0,combo:0,comboTime:0};
const weaponIcons=[
  'm4 20 21-2 5-6h55l4 5h29v5h22v5h-29l-3 5H80l-2 13H64l-2-13H48l-6 10H30l7-16H4Z',
  'm4 20 22-6h32v4h83v6H80v7H52l-5 13H35l7-15-38 6Z',
  'M7 16h31v4H11v13h27v4H7ZM38 17q0-7 7-7h49q8 0 8 7v5h19v6h-19v5H81v15H68V32H54l-4 12H37l5-18h-4ZM48 8a5 5 0 1 1 10 0h-3a2 2 0 1 0-4 0Z',
  'm3 22 31-5h58v5h53v5H87v6H59l-5 12H39l5-12-41 5ZM45 7h38v10H45Z',
  'M26 9h97v18H69l-8 21H36l8-21H26Zm40 20v8h15v-8Z',
  'M30 17h34V9h65v12H76v13H59l-7 15H30l8-23h-8Zm17-7h21v20H47Z',
];
const keys=new Set(), enemies=[], particles=[], tracers=[], splats=[], shells=[];
let renderer,scene,camera,gunScene,gunCamera,world,gun,gunModels=[],flash,flashLight,flashTime=0,scoped=false,gunRecoil=0,mouseDown=false,dragLook=false;
let yaw=0,pitch=-.012,bob=0,moveAmount=0,aimBlend=0,gunSwitch=0,shake=0,lastTime=0,frame=0,minimapClock=0;
let sprintBlend=0,lookSwayX=0,lookSwayY=0,controller,deathView;
let lan=null,lanActive=false,remotes=null,ownSnapshot=null,ownLife=0,scoreboardKey='';
let pointerFallback=false,guideWasPlaying=false,mobileMove={x:0,y:0},lookTouch=null;
const player=new THREE.Vector3(0,1.7,17), raycaster=new THREE.Raycaster(), dir=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);

const toonCache=new Map();
const bands=new THREE.DataTexture(new Uint8Array([104,104,104,255,191,191,191,255,255,255,255,255]),3,1,THREE.RGBAFormat);bands.needsUpdate=true;bands.minFilter=THREE.NearestFilter;bands.magFilter=THREE.NearestFilter;
function mat(color){if(!toonCache.has(color))toonCache.set(color,new THREE.MeshToonMaterial({color,gradientMap:bands}));return toonCache.get(color);}
const inkMaterial=new THREE.LineBasicMaterial({color:INK});
const hitFlashMaterial=new THREE.MeshBasicMaterial({color:colors.paper});
function mesh(parent,geo,color,pos=[0,0,0],rot=[0,0,0],outline=true){const m=new THREE.Mesh(geo,mat(color));m.position.set(...pos);m.rotation.set(...rot);parent.add(m);if(outline){const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo,25),inkMaterial);m.add(e);}return m;}
const box=(p,s,c,pos,rot)=>mesh(p,new THREE.BoxGeometry(...s),c,pos,rot);
function lightScene(target){target.add(new THREE.HemisphereLight(0xffffff,colors.paper,1.8));const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(-18,30,12);target.add(sun);return sun;}

function lanInput(){
  const active=lanActive&&state.mode==='playing'&&state.health>0&&lan?.latest?.phase!=='finished';
  return {life:ownLife,forward:active?(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-mobileMove.y:0,
    strafe:active?(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+mobileMove.x:0,yaw,pitch,
    sprint:active&&keys.has('ShiftLeft'),jump:active&&keys.has('Space'),interact:active&&keys.has('KeyE'),
    aim:active&&state.aiming,shooting:active&&state.shooting};
}
async function openLan(message=''){
  $('lan-dialog').classList.remove('hidden');$('lan-status').textContent=message||'正在查找本机服务上的房间…';
  $('lan-join').disabled=false;$('lan-addresses').replaceChildren();
  // Keep pre-rename callsigns readable for returning players.
  try{$('lan-name').value=localStorage.getItem('pop-strike-name')||localStorage.getItem('inkfall-name')||'';}catch{}
  $('lan-name').focus();
  try{
    const response=await fetch('/api/room',{signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw new Error();const room=await response.json();if(room.protocol!==2){$('lan-status').textContent='房主服务版本较旧，请停止并重新运行 bash start-lan.sh，再刷新所有玩家页面。';$('lan-join').disabled=true;return;}
    if(!message)$('lan-status').textContent=`房间已就绪 · ${room.players} / ${room.rules.maxPlayers} 人 · 2 人加入即开战`;
    for(const address of room.addresses){const link=document.createElement('a');link.href=address;link.textContent=address;$('lan-addresses').append(link);}
    if(!room.addresses.length)$('lan-addresses').textContent='让朋友打开房主电脑的局域网 IP 和端口。';
  }catch{if(!message)$('lan-status').textContent='当前是静态服务。请在项目目录运行 bash start-lan.sh，再打开终端显示的地址。';}
}
async function joinLan(event){
  event.preventDefault();if(lan)return;
  $('lan-join').disabled=true;$('lan-status').textContent='正在加入战场…';audio.unlock();
  const name=$('lan-name').value.trim()||'Pop 玩家';try{localStorage.setItem('pop-strike-name',name);}catch{}
  const client=new LanClient({input:lanInput,snapshot:receiveLanSnapshot,event:receiveLanEvent,disconnected:message=>{if(lan===client)leaveLan(message);}});lan=client;
  try{
    await client.connect(name);if(lan!==client){client.disconnect();return;}
    lanActive=true;ownLife=0;ownSnapshot=null;scoreboardKey='';startGame(true);
    $('lan-dialog').classList.add('hidden');$('lan-scoreboard').classList.remove('hidden');$('lan-scoreboard').open=false;arena.classList.add('lan-playing');
    document.querySelector('.live-label').textContent='● LAN SESSION';
  }catch(error){if(lan===client){lan=null;$('lan-status').textContent=error.message;$('lan-join').disabled=false;}}
}
function leaveLan(message=''){
  resetDeath();
  lan?.disconnect();lan=null;lanActive=false;ownSnapshot=null;ownLife=0;remotes.clear();removeEnemies();
  state.mode='ready';state.shooting=state.aiming=false;state.health=100;state.kills=state.score=0;state.time=180;state.ammo=createAmmo();state.weapon=0;state.reload=0;state.shotCooldown=0;
  keys.clear();resetStick();controller.reset();player.set(0,PLAYER.eye,17);yaw=0;pitch=-.012;moveAmount=0;
  showGun(0);resetAim();document.exitPointerLock?.();arena.classList.remove('playing','lan-playing');
  for(const id of ['pause-menu','guide','lan-center','lan-scoreboard','traversal-hint'])$(id).classList.add('hidden');
  $('menu').classList.remove('hidden');$('crosshair').classList.add('hidden');$('killfeed').replaceChildren();$('reload-bar').style.width='0';$('status-label').textContent='READY TO MAKE IT POP';
  document.querySelector('.live-label').textContent='● LOCAL SESSION';
  createEnemy(new THREE.Vector3(-4,0,-5),0,true);createEnemy(new THREE.Vector3(4.5,0,-9),1,true);updateHUD();
  if(message)openLan(message);
}
function receiveLanSnapshot(snapshot){
  if(!lanActive)return;
  const own=snapshot.players.find(p=>p.id===lan.id);if(!own)return;
  const respawned=own.life!==ownLife;
  if(respawned){resetDeath();resetAim();ownLife=own.life;player.fromArray(own.position);controller.reset();yaw=own.yaw;pitch=own.pitch;state.shooting=false;keys.clear();resetStick();if(state.mode==='dead')state.mode='playing';}
  if(ownSnapshot&&own.health<state.health){state.damage=.35;shake=.023;audio.hurt();}
  if(own.reload>0&&state.reload===0){resetAim();audio.reload(weapons[own.weapon].type,weapons[own.weapon].reload);}
  if(own.weapon!==state.weapon){gunSwitch=1;showGun(own.weapon);resetAim();}
  const previous=ownSnapshot;
  ownSnapshot=own;Object.assign(state,{health:own.health,kills:own.kills,score:own.kills,ammo:own.ammo,weapon:own.weapon,reload:own.reload,reloadTotal:weapons[own.weapon].reload,time:snapshot.remaining});
  Object.assign(controller.motion,own.motion);
  if(own.health<=0||snapshot.phase==='finished')resetAim();
  if(own.health<=0){
    if(state.mode==='playing')state.mode='dead';
    if(!deathView.active)beginDeath({position:new THREE.Vector3().fromArray(own.position),yaw:own.yaw,weapon:own.weapon,team:own.team,index:Number(own.id),poseSeed:playerPoseSeed(own.id,own.life),speed:Math.hypot(previous?.vx||0,previous?.vz||0),source:own.death?.source});
    updateDeathCard(own.death,snapshot);
  }
  remotes.receive(snapshot.players,lan.id);
  let notice='';
  if(snapshot.phase==='finished'&&own.health>0)notice=`${snapshot.winners.length>1?'红蓝双方平局':snapshot.winners[0]+'获胜'}！\n${Math.ceil(snapshot.remaining)} 秒后开始下一局`;
  else if(own.health<=0)notice='';
  else if(snapshot.phase==='waiting')notice='等待其他玩家加入\n可自由探索和练枪 · 2 人即开战';
  else if(own.protection>0)notice=`重生保护 ${Math.ceil(own.protection)} 秒 · 开火后解除`;
  $('lan-center').textContent=notice;$('lan-center').classList.toggle('hidden',!notice);
  $('crosshair').classList.toggle('hidden',own.health<=0||snapshot.phase==='finished');
  $('lan-ping').textContent=`${snapshot.players.length} / 8 人 · ${lan.ping} ms`;
  $('lan-team').textContent=`你属于${own.team==='red'?'红':'蓝'}队`;$('lan-team').className=`team-${own.team}`;
  $('red-score').textContent=snapshot.scores.red;$('blue-score').textContent=snapshot.scores.blue;
  const sorted=[...snapshot.players].sort((a,b)=>(a.team===b.team?0:a.team==='red'?-1:1)||b.kills-a.kills||a.deaths-b.deaths||Number(a.id)-Number(b.id));
  const signature=JSON.stringify(sorted.map(p=>[p.id,p.name,p.team,p.kills,p.deaths]));
  if(signature!==scoreboardKey){scoreboardKey=signature;$('lan-scores').replaceChildren();for(const p of sorted){const row=document.createElement('tr');row.className=`team-${p.team}${p.id===lan.id?' is-you':''}`;for(const text of [`${p.name}${p.id===lan.id?'（你）':''}`,p.kills,p.deaths]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}$('lan-scores').append(row);}}
  updateHUD();
}
function receiveLanEvent(message){
  if(!lanActive)return;
  if(message.type==='notice'){showBanner(message.text,2);return;}
  if(message.type==='kill'){
    addKillFeed(message);
    if(message.killer===lan.id){audio.kill();comicPop(message.headshot?'HEADSHOT!':'POP!');}return;
  }
  if(message.type!=='shot')return;
  const own=message.id===lan.id,origin=new THREE.Vector3().fromArray(message.origin);
  if(own){if(message.weapon===state.weapon)shotFeedback(weapons[message.weapon]);else audio.shoot(weapons[message.weapon].type);}
  else{remotes.shot(message.id);if(player.distanceTo(origin)<22)audio.shoot(weapons[message.weapon].type);}
  const muzzle=own?new THREE.Vector3(.26,-.20,-.9).applyQuaternion(camera.quaternion).add(camera.position):origin;
  for(const end of message.ends.slice(0,2))makeTracer(muzzle,new THREE.Vector3().fromArray(end),!own);
  for(const hit of message.hits){inkBurst(new THREE.Vector3().fromArray(hit.point),hit.headshot?YELLOW:INK,4,2);if(own){state.hit=.13;audio.hit(hit.headshot);}}
}
function addKillFeed(message){
  const row=document.createElement('div');row.className='feed-line lan-feed';
  row.classList.toggle('your-kill',message.killer===lan.id);row.classList.toggle('your-death',message.victim===lan.id);
  const names=[message.killerName,message.victimName],teams=[message.killerTeam,message.victimTeam];
  for(let i=0;i<2;i++){
    const name=document.createElement('span');name.textContent=names[i];name.title=names[i];name.className=teams[i]==='red'?'team-red':'team-blue';row.append(name);
    if(i===0){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(icon.namespaceURI,'path');icon.setAttribute('viewBox','0 0 150 50');icon.setAttribute('aria-label',weapons[message.weapon]?.label||'击倒');path.setAttribute('d',weaponIcons[message.weapon]||weaponIcons[0]);icon.append(path);row.append(icon);}
  }
  if(message.headshot){const badge=document.createElement('small');badge.textContent='爆头';row.append(badge);}
  $('killfeed').prepend(row);setTimeout(()=>row.remove(),6000);while($('killfeed').children.length>5)$('killfeed').lastElementChild.remove();
}
function beginDeath(options){
  releaseTrigger();resetAim();keys.clear();resetStick();lookTouch=null;dragLook=false;
  state.banner=state.hit=state.pop=0;moveAmount=sprintBlend=shake=0;
  deathView.begin(options,camera);arena.classList.add('is-dead');$('death-card').classList.remove('hidden');
  $('death-restart').classList.toggle('hidden',lanActive);
}
function resetDeath(){
  deathView?.reset();arena.classList.remove('is-dead');$('death-card').classList.add('hidden');
}
function updateDeathCard(info,snapshot){
  const label=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
  label('death-killer',info?.killerName?`被 ${info.killerName} 击倒`:'你被击倒了');
  label('death-weapon',info?`${weapons[info.weapon]?.label||'枪械'}${info.headshot?' · 爆头':''}`:'');
  const finished=snapshot?.phase==='finished',seconds=Math.max(0,Math.ceil(finished?snapshot.remaining:ownSnapshot?.respawn||0));
  label('death-countdown',lanActive?(finished?`本局结束 · ${seconds} 秒后下一局`:seconds>0?`${seconds} 秒后复活`:'正在复活…'):'训练结束');
  label('death-detail',lanActive?(finished?(snapshot.winners.length>1?'红蓝双方平局':snapshot.winners[0]+'获胜'):`本局 ${state.kills} 击倒 · ${ownSnapshot?.deaths||0} 阵亡`):`本局 ${state.kills} 击倒 · ${state.score} 分`);
  $('death-progress').style.width=lanActive?`${100*Math.max(0,Math.min(1,finished?snapshot.remaining/lan.rules.intermission:(ownSnapshot?.respawn||0)/lan.rules.respawn))}%`:'0';
}
function moveLanPlayer(dt){
  if(!ownSnapshot)return;
  // Authoritative movement is smoothed locally; aim remains immediate. The host
  // runs exactly the same stairs, ladders and mantle controller as solo play.
  const target=new THREE.Vector3().fromArray(ownSnapshot.position);
  player.lerp(target,1-Math.exp(-dt*35));
  const moving=state.mode==='playing'&&ownSnapshot.health>0&&ownSnapshot.motion.grounded&&Math.hypot(ownSnapshot.vx,ownSnapshot.vz)>.1;
  moveAmount=THREE.MathUtils.lerp(moveAmount,moving?1:0,Math.min(1,dt*12));
  if(moving){bob+=dt*(keys.has('ShiftLeft')?15:10);state.footstep-=dt;if(state.footstep<=0){audio.footstep();state.footstep=.36;}}
  const climbing=ownSnapshot.motion.climbing,near=controller.nearbyLadder();
  const hint=state.health<=0?'':climbing?'W / S 上下爬梯 · 空格跳离':near?'E 抓住梯子 · W / S 上下':ownSnapshot.motion.mantling?'正在攀上边沿':'';
  $('traversal-hint').textContent=hint;$('traversal-hint').classList.toggle('hidden',!hint);$('mobile-interact').classList.toggle('hidden',!climbing&&!near);
}

function buildGun(){
  gun=new THREE.Group();gunScene.add(gun);
  gunModels=weapons.map(w=>{const model=createWeaponModel(w.type,{arms:true});gun.add(model.group);return model;});
  showGun(0);
  const shape=new THREE.Shape();for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=i%2===0?.21:.075;const x=Math.cos(a)*r,y=Math.sin(a)*r;i===0?shape.moveTo(x,y):shape.lineTo(x,y);}shape.closePath();
  flash=new THREE.Group();const f=mesh(flash,new THREE.ShapeGeometry(shape),YELLOW,[0,0,0],[0,0,0],true);f.material=new THREE.MeshBasicMaterial({color:YELLOW,side:THREE.DoubleSide});
  const inner=new THREE.Mesh(new THREE.CircleGeometry(.07,8),new THREE.MeshBasicMaterial({color:colors.paper,side:THREE.DoubleSide}));inner.position.z=.004;flash.add(inner);gun.add(flash);flash.visible=false;
  flashLight=new THREE.PointLight(colors.gold,0,4);flashLight.position.set(.15,.2,-.9);gunScene.add(flashLight);
}
function createEnemy(position,index=0,preview=false){
  const maxHp=state.wave===3?102:68;
  const headbandColor=SOLDIER_HEADBAND_COLORS[Math.floor(Math.random()*SOLDIER_HEADBAND_COLORS.length)];
  const rig=createStickman({index,maxHp,headbandColor});
  const e={
    rig,group:rig.group,body:rig.body,healthBar:rig.healthBar,hp:maxHp,maxHp,
    phase:index*1.7,attack:1.8+index*.3,hit:0,flinch:0,shotKick:0,
    dead:false,disposed:false,preview,id:index,
    velocity:new THREE.Vector2(),actualVelocity:new THREE.Vector2(),
    strafeSign:index%2===0?1:-1,strafeTime:1.5+index*.31,
    avoidTime:0,avoidSign:index%2===0?1:-1,losTime:0,canSee:false,aimTime:0,
    deathTime:0,fallDirection:new THREE.Vector3(),turn:0
  };
  e.group.position.copy(position);
  e.group.rotation.y=Math.atan2(player.x-position.x,player.z-position.z);
  e.body.forEach(m=>m.userData.enemy=e);
  scene.add(e.group);enemies.push(e);return e;
}
function removeEnemies(){
  for(const e of enemies){if(!e.disposed)e.rig.dispose();e.disposed=true;}
  enemies.length=0;
}
function spawnWave(){
  const spots=world.spawnPoints.filter(p=>p.distanceTo(player)>10),upperSpots=world.upperSpawnPoints.filter(p=>p.distanceTo(player)>10);const total=[5,7,9][state.wave-1];
  for(let i=0;i<total;i++){const pool=i%3===2&&upperSpots.length?upperSpots:spots;const p=(pool[i%pool.length]||new THREE.Vector3(-10+i*3,0,-15)).clone();createEnemy(p,i);}
  state.waveWait=0;showBanner(`WAVE ${String(state.wave).padStart(2,'0')} / 来点颜色！`,2.5);audio.wave();updateHUD();
}
function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.autoClear=false;
  scene=new THREE.Scene();scene.background=new THREE.Color(colors.sky);scene.fog=new THREE.Fog(colors.paper,44,110);lightScene(scene);
  camera=new THREE.PerspectiveCamera(73,1,.07,150);camera.rotation.order='YXZ';
  world=createWorld(scene);deathView=new DeathView(scene,world);controller=createPlayerController(player,world);remotes=new RemotePlayers(scene);
  gunScene=new THREE.Scene();gunCamera=new THREE.PerspectiveCamera(62,1,.02,5);lightScene(gunScene);buildGun();
  createEnemy(new THREE.Vector3(-4,0,-5),0,true);createEnemy(new THREE.Vector3(4.5,0,-9),1,true);createEnemy(new THREE.Vector3(11,0,0),2,true);
  resize();window.addEventListener('resize',resize);new ResizeObserver(resize).observe(arena);$('loading').classList.add('hidden');requestAnimationFrame(loop);
  window.__popStrike={getState:()=>({networkMode:lanActive?'lan':'solo',id:lan?.id,phase:lan?.latest?.phase,players:lan?.latest?.players,remotePlayers:remotes.players.size,mode:state.mode,health:state.health,kills:state.kills,score:state.score,wave:state.wave,time:Math.ceil(state.time),ammo:state.ammo[state.weapon],weapon:state.weapon,weaponType:weapons[state.weapon].type,ammoAll:[...state.ammo],scope:scoped,fov:camera.fov,deathView:deathView.active,deathTime:deathView.elapsed,corpseVisible:Boolean(deathView.rig?.group.visible),camera:camera.position.toArray(),cameraRotation:camera.rotation.toArray(),visibleGuns:gunModels.filter(m=>m.group.visible).map(m=>m.group.name),remoteWeapons:[...remotes.players.values()].map(p=>p.rig.group.userData.weapon),reloading:state.reload>0,enemies:enemies.filter(e=>!e.dead).length,upperEnemies:enemies.filter(e=>!e.dead&&e.group.position.y>2.5).length,player:{x:player.x,y:player.y,z:player.z,...controller.motion},drawCalls:renderer.info.render.calls}),renderer};
}
function resize(){if(!renderer)return;const w=arena.clientWidth,h=arena.clientHeight;arena.style.setProperty('--scope-size',`${Math.min(w,h)*.82}px`);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();gunCamera.aspect=w/h;gunCamera.updateProjectionMatrix();}
function requestCapture(){
  canvas.focus({preventScroll:true});
  if(matchMedia('(pointer:coarse)').matches)return;
  if(!canvas.requestPointerLock){pointerFallback=true;showBanner('拖动鼠标转向 · 点击射击',3);return;}
  try{const promise=canvas.requestPointerLock?.();if(promise?.catch)promise.catch(()=>{pointerFallback=true;showBanner('拖动鼠标转向 · 点击射击',3);});}catch{pointerFallback=true;}
}
function startGame(multiplayer=false){
  resetDeath();
  if(!multiplayer&&lan)leaveLan();
  audio.unlock();removeEnemies();
  for(const list of [particles,tracers,shells]){for(const effect of list){disposeGroup(effect.mesh);if(list!==shells)effect.mesh.material.dispose();}list.length=0;}
  for(const splat of splats){const materials=new Set();splat.traverse(m=>{if(m.material)materials.add(m.material);});disposeGroup(splat);materials.forEach(m=>m.dispose());}splats.length=0;gunRecoil=0;shake=0;
  player.set(0,PLAYER.eye,17);controller.reset();yaw=0;pitch=-.012;aimBlend=0;sprintBlend=0;lookSwayX=0;lookSwayY=0;bob=0;moveAmount=0;lookTouch=null;resetStick();
  Object.assign(state,{mode:'playing',health:100,kills:0,score:0,wave:1,time:180,ammo:createAmmo(),weapon:0,reload:0,shotCooldown:0,weaponCooldowns:weapons.map(()=>0),triggerLatched:false,shooting:false,aiming:false,waveWait:0,elapsed:0,combo:0,comboTime:0,damage:0,hit:0,pop:0});
  showGun(0);resetAim();$('reload-bar').style.width='0';$('killfeed').replaceChildren();$('floating-scores').replaceChildren();arena.classList.add('playing');$('menu').classList.add('hidden');$('pause-menu').classList.add('hidden');$('guide').classList.add('hidden');$('crosshair').classList.remove('hidden');keys.clear();$('restart-button').textContent=multiplayer?'离开房间':'重新开始';if(!multiplayer)spawnWave();updateHUD();requestCapture();
}
function pause(){if(state.mode!=='playing'&&state.mode!=='dead')return;state.mode='paused';releaseTrigger();resetAim();keys.clear();$('pause-title').textContent='稍作喘息。';$('pause-text').textContent=lanActive?'房间内的战斗继续进行。你可以继续战斗或离开房间。':'战场还在等你。准备好继续了吗？';$('resume-button').classList.remove('hidden');$('pause-menu').classList.remove('hidden');document.exitPointerLock?.();}
function resume(){audio.unlock();state.mode=lanActive&&state.health<=0?'dead':'playing';$('pause-menu').classList.add('hidden');requestCapture();}
function finish(won=false){
  if(state.mode!=='playing')return;state.mode=won?'won':'lost';releaseTrigger();resetAim();document.exitPointerLock?.();keys.clear();
  $('pause-title').textContent=won?'漂亮，留下了印记！':state.health<=0?'火力未尽，再战一局。':'时间到，火力不停。';
  // Preserve scores saved before the Pop Strike rename.
  let best=0;try{best=Number(localStorage.getItem('pop-strike-best')||localStorage.getItem('inkfall-best')||0);if(state.score>best)localStorage.setItem('pop-strike-best',state.score);}catch{}
  $('pause-text').textContent=`本局击倒 ${state.kills} 名敌人 · 得分 ${state.score} · 最佳 ${Math.max(best,state.score)}。${won?'三波敌人全部清除！':'利用掩体、瞄准头部，下次会更好。'}`;
  $('resume-button').classList.add('hidden');$('restart-button').textContent=won?'再来一场 →':'重新出发 →';$('pause-menu').classList.toggle('hidden',deathView.active);if(won)audio.victory();
}
function showGun(index){gunModels.forEach((m,i)=>m.group.visible=i===index);flashTime=0;}
function resetAim(){state.aiming=false;aimBlend=0;scoped=false;arena.classList.remove('aiming','scoped');$('sniper-scope').classList.add('hidden');if(camera){camera.fov=73;camera.updateProjectionMatrix();}}
function aimAllowed(){return state.mode==='playing'&&state.health>0&&state.reload===0&&(!lanActive||lan?.latest?.phase!=='finished');}
function setAim(value){state.aiming=value&&aimAllowed();if(lanActive)lan.send({type:'input',...lanInput()});}
function releaseTrigger(){state.shooting=false;state.triggerLatched=false;if(lanActive)lan.send({type:'input',...lanInput()});}
function switchWeapon(n){
  if(!validWeapon(n)||state.mode!=='playing'||n===state.weapon)return;
  resetAim();
  if(lanActive){lan.action('weapon',{weapon:n});return;}
  state.weapon=n;state.reload=0;state.triggerLatched=state.shooting;$('reload-bar').style.width='0';
  state.shotCooldown=Math.max(.22,state.weaponCooldowns[n]);gunSwitch=1;showGun(n);updateHUD();
}
function reload(){
  if(state.mode!=='playing'||state.reload>0||state.ammo[state.weapon]===weapons[state.weapon].capacity)return;
  resetAim();
  if(lanActive){lan.action('reload');return;}
  state.reloadTotal=weapons[state.weapon].reload;state.reload=state.reloadTotal;audio.reload(weapons[state.weapon].type,state.reloadTotal);$('status-label').textContent='RELOADING / 正在换弹';
}
function shotFeedback(w){
  state.shotCooldown=w.interval;gunRecoil=w.recoil;shake=w.shake;pitch=Math.min(1.3,pitch+w.kick*(state.aiming?.55:1));
  flashTime=.045;flash.rotation.z=Math.random()*Math.PI;flash.scale.setScalar(w.flash);audio.shoot(w.type);gunModels[state.weapon].fire();
}
function updateHUD(){
  document.querySelector('.weapon-hud').style.setProperty('--weapon-color',hex(WEAPON_COLORS[weapons[state.weapon].type]));
  $('health-value').textContent=Math.max(0,Math.ceil(state.health));$('health-meter').style.width=`${Math.max(0,state.health)}%`;$('health-meter').style.background=state.health<30?'#dc6250':'#55927f';
  $('kill-value').textContent=String(state.kills).padStart(2,'0');$('ammo-value').textContent=String(state.ammo[state.weapon]).padStart(2,'0');$('ammo-value').style.color=state.ammo[state.weapon]<=Math.max(1,Math.floor(weapons[state.weapon].capacity*.2))?'#844790':'';
  $('weapon-name').textContent=weapons[state.weapon].name;$('fire-mode').textContent=weapons[state.weapon].mode;$('mag-capacity').textContent=weapons[state.weapon].capacity;
  document.querySelectorAll('[data-weapon]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.weapon)===state.weapon)));
  $('weapon-icon').setAttribute('d',weaponIcons[state.weapon]);$('wave-label').textContent=state.mode==='ready'?'生存挑战':`第 ${state.wave} 波 / 共 3 波`;
  const alive=enemies.filter(e=>!e.dead).length;$('wave-detail').textContent=state.mode==='ready'?'3 波敌人 · 1 个战场':`${state.score} PTS · ${alive} 个目标`;
  $('enemy-count').textContent=state.mode==='ready'?'训练场已就绪':`剩余 ${alive} 名敌人`;
  if(lanActive){$('wave-label').textContent='局域网 · 红蓝对战';$('wave-detail').textContent=`你 ${state.kills} 击倒 / ${ownSnapshot?.deaths||0} 阵亡 · 目标 ${lan.rules.killLimit}`;$('enemy-count').textContent=`${lan.ping} ms · 第 ${lan.latest?.round||1} 局`;}
}
function showBanner(text,duration=2){$('wave-banner').textContent=text;state.banner=duration;$('wave-banner').style.opacity=1;}
function comicPop(text,color='#dad4c9'){state.pop=.45;$('comic-pop').textContent=text;$('comic-pop').style.color=color;}
function scoreLabel(pos,value,headshot){const v=pos.clone().project(camera);if(Math.abs(v.x)>1||Math.abs(v.y)>1||v.z>1)return;const el=document.createElement('div');el.className='floating-score';el.textContent=`${headshot?'HEADSHOT! ':''}+${value}`;el.style.left=`${(v.x*.5+.5)*arena.clientWidth}px`;el.style.top=`${(-v.y*.5+.5)*arena.clientHeight}px`;$('floating-scores').append(el);setTimeout(()=>el.remove(),1000);}
function feed(headshot){const el=document.createElement('div');el.className='feed-line';el.innerHTML=`<span>YOU</span> ${headshot?'⌖':'╾━'} <b>STRIKER</b>`;$('killfeed').prepend(el);setTimeout(()=>el.remove(),3800);while($('killfeed').children.length>4)$('killfeed').lastElementChild.remove();}
function inkBurst(pos,color=INK,count=10,power=3){
  for(let i=0;i<count;i++){const size=.025+Math.random()*.075;const m=new THREE.Mesh(new THREE.IcosahedronGeometry(size,0),new THREE.MeshBasicMaterial({color:i%4===0?colors.butter:color}));m.position.copy(pos);scene.add(m);particles.push({mesh:m,velocity:new THREE.Vector3((Math.random()-.5)*power,Math.random()*power+.7,(Math.random()-.5)*power),life:.35+Math.random()*.4,total:.75});}
}
function makeTracer(from,to,enemy=false){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,to]),new THREE.LineBasicMaterial({color:enemy?colors.coral:colors.paper,transparent:true,opacity:enemy?.85:.8}));scene.add(line);tracers.push({mesh:line,life:enemy?.16:.055,total:enemy?.16:.055});}
function stampSplat(hit){
  const g=new THREE.Group();g.position.copy(hit.point);const n=hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld)||new THREE.Vector3(0,1,0);g.position.addScaledVector(n,.012);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);
  const material=new THREE.MeshBasicMaterial({color:INK,side:THREE.DoubleSide,transparent:true,opacity:.82,depthWrite:false});
  for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.CircleGeometry(i===0?.09:.025+Math.random()*.035,7),material);if(i)m.position.set((Math.random()-.5)*.31,(Math.random()-.5)*.31,.001*i);g.add(m);}scene.add(g);splats.push(g);if(splats.length>45){const old=splats.shift();const materials=new Set();old.traverse(m=>{if(m.material)materials.add(m.material);});disposeGroup(old);materials.forEach(m=>m.dispose());}
}
function disposeGroup(g){g.parent?.remove(g);g.traverse(m=>{if(m.geometry)m.geometry.dispose();});}
function hitEnemy(e,damage,headshot,point){
  if(e.dead)return;e.hp-=damage;e.hit=.085;e.flinch=.26;e.body.forEach(m=>{if(m.userData.hitProxy)return;m.userData.baseMaterial??=m.material;m.material=hitFlashMaterial;});e.healthBar.visible=true;e.healthBar.scale.x=Math.max(0,e.hp/e.maxHp);audio.hit(headshot);state.hit=.13;inkBurst(point,headshot?YELLOW:INK,6,2.5);
  if(e.hp<=0){e.dead=true;state.kills++;state.combo=state.comboTime>0?state.combo+1:1;state.comboTime=3;const points=(headshot?150:100)+(state.combo>1?25*(Math.min(state.combo,5)-1):0);state.score+=points;state.health=Math.min(100,state.health+7);e.healthBar.visible=false;audio.kill();feed(headshot);scoreLabel(e.group.position.clone().add(new THREE.Vector3(0,2,0)),points,headshot);comicPop(headshot?'HEADSHOT!':state.combo>1?`${state.combo}× COMBO!`:'POP!',headshot?'#dad4c9':'#dad4c9');e.deathTime=0;e.fallDirection.copy(e.group.position).sub(player).setY(0).normalize();inkBurst(e.group.position.clone().add(new THREE.Vector3(0,1,0)),INK,17,4);updateHUD();
  }
}
function fire(){
  if(lanActive){if(state.mode==='playing')lan.action('fire');return;}
  if(state.mode!=='playing'||state.reload>0||state.shotCooldown>0)return;
  const w=weapons[state.weapon];if(state.weaponCooldowns[state.weapon]>0||(!w.automatic&&state.triggerLatched))return;state.triggerLatched=true;if(state.ammo[state.weapon]<=0){reload();return;}
  // Raycasts use the current camera and enemy transforms, including input between frames.
  camera.position.copy(player);camera.position.y+=controller.motion.viewOffset;camera.rotation.set(pitch,yaw,0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  state.ammo[state.weapon]--;state.weaponCooldowns[state.weapon]=w.interval;shotFeedback(w);
  const targets=[...world.raycastMeshes,...enemies.filter(e=>!e.dead).flatMap(e=>e.body)];
  for(let i=0;i<w.pellets;i++){const spread=shotSpread(w,state.aiming);dir.set((Math.random()-.5)*spread,(Math.random()-.5)*spread,-1).normalize().applyQuaternion(camera.quaternion);raycaster.set(camera.position,dir);raycaster.far=w.range;
    const hit=raycaster.intersectObjects(targets,false)[0];const end=hit?hit.point:raycaster.ray.at(w.range,new THREE.Vector3());
    const muzzle=new THREE.Vector3(.26,-.20,-.9).applyQuaternion(camera.quaternion).add(camera.position);if(i<2)makeTracer(muzzle,end);
    if(hit){const e=hit.object.userData.enemy;if(e)hitEnemy(e,shotDamage(w,hit.distance,Boolean(hit.object.userData.headshot)),Boolean(hit.object.userData.headshot),hit.point);else{if(i<2){inkBurst(hit.point,INK,3,1.7);stampSplat(hit);}}}
  }
  const shell=box(scene,[.035,.035,.095],colors.gold,camera.position.clone().add(new THREE.Vector3(.22,-.2,-.4).applyQuaternion(camera.quaternion)).toArray());shells.push({mesh:shell,velocity:new THREE.Vector3(2+Math.random(),1.8,Math.random()).applyAxisAngle(up,yaw),life:1});
  updateHUD();
}
function hurt(amount,source){if(state.mode!=='playing')return;state.health=Math.max(0,state.health-amount);state.damage=.35;shake=.023;audio.hurt();updateHUD();if(state.health<=0){beginDeath({position:player,yaw,weapon:state.weapon,source});updateDeathCard({killerName:'突击队员',weapon:0});finish(false);}}
function enemyBlocked(x,z,y=0){return enemyPositionBlocked(world,x,z,y);}
function angleDelta(from,to){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}
function steerEnemy(e,desiredX,desiredZ,dt){
  const pos=e.group.position;
  let desiredSpeed=Math.hypot(desiredX,desiredZ);
  // Separate neighbors before choosing a lane, so running figures do not stack.
  for(const other of enemies){
    if(other===e||other.dead)continue;
    const dx=pos.x-other.group.position.x,dz=pos.z-other.group.position.z,d=Math.hypot(dx,dz);
    if(d<.9&&d>.001){const push=(.9-d)*2.7;desiredX+=dx/d*push;desiredZ+=dz/d*push;}
  }
  const length=Math.hypot(desiredX,desiredZ);
  if(length>0.01){
    const nx=desiredX/length,nz=desiredZ/length;
    const clear=(x,z)=>!enemyBlocked(pos.x+x*.4,pos.z+z*.4,pos.y)&&!enemyBlocked(pos.x+x*.85,pos.z+z*.85,pos.y);
    let bestX=0,bestZ=0;
    const offsets=[0,e.avoidSign*.6,-e.avoidSign*.6,e.avoidSign*1.15,-e.avoidSign*1.15,e.avoidSign*1.65,-e.avoidSign*1.65];
    for(const offset of offsets){
      const c=Math.cos(offset),s=Math.sin(offset),x=nx*c-nz*s,z=nx*s+nz*c;
      if(clear(x,z)){bestX=x;bestZ=z;if(offset!==0&&e.avoidTime<=0){e.avoidSign=Math.sign(offset);e.avoidTime=.8;}break;}
    }
    desiredSpeed=Math.min(length,Math.max(desiredSpeed,1.4));
    desiredX=bestX*desiredSpeed;desiredZ=bestZ*desiredSpeed;
  }
  const smooth=1-Math.exp(-dt*(desiredSpeed<.2?14:7.5));
  e.velocity.x=THREE.MathUtils.lerp(e.velocity.x,desiredX,smooth);
  e.velocity.y=THREE.MathUtils.lerp(e.velocity.y,desiredZ,smooth);
  const beforeX=pos.x,beforeZ=pos.z;
  if(!enemyBlocked(pos.x+e.velocity.x*dt,pos.z,pos.y))pos.x+=e.velocity.x*dt;else e.velocity.x*=.15;
  if(!enemyBlocked(pos.x,pos.z+e.velocity.y*dt,pos.y))pos.z+=e.velocity.y*dt;else e.velocity.y*=.15;
  e.actualVelocity.set((pos.x-beforeX)/Math.max(dt,.001),(pos.z-beforeZ)/Math.max(dt,.001));
  e.avoidTime=Math.max(0,e.avoidTime-dt);
  return e.actualVelocity.length();
}
function movePlayer(dt){
  if(lanActive){moveLanPlayer(dt);return;}
  const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-mobileMove.y,strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+mobileMove.x;
  const len=Math.hypot(forward,strafe),sprinting=keys.has('ShiftLeft')&&forward>0&&!state.aiming;
  const speed=(sprinting?7.6:4.8)*(state.aiming?.62:1),f=forward/Math.max(1,len),s=strafe/Math.max(1,len);
  const oldX=player.x,oldZ=player.z;
  const motion=controller.update(dt,{vx:(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed,vz:(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed,forward:f,jump:keys.has('Space'),interact:keys.has('KeyE')});
  const moving=Math.hypot(player.x-oldX,player.z-oldZ)>.001&&motion.grounded&&!motion.mantling;
  moveAmount=THREE.MathUtils.lerp(moveAmount,moving?Math.min(1,len):0,Math.min(1,dt*12));
  if(moving){bob+=dt*(sprinting?15:10);state.footstep-=dt;if(state.footstep<=0){audio.footstep();state.footstep=sprinting?.27:.40;}}
  const touch=matchMedia('(pointer:coarse)').matches;
  const hint=motion.climbing?(touch?'前后推摇杆上下爬梯 · 跳跃离开':'W / S 上下爬梯 · 空格跳离'):controller.nearbyLadder()?(touch?'点击爬梯 · 前后推摇杆上下':'E 抓住梯子 · W / S 上下'):motion.mantling?'正在攀上边沿':'';
  $('traversal-hint').textContent=hint;
  $('traversal-hint').classList.toggle('hidden',!hint);
  $('mobile-interact').classList.toggle('hidden',!motion.climbing&&!controller.nearbyLadder());
}
function updateEnemyDeath(e,dt){
  if(e.disposed)return;
  e.deathTime+=dt;
  e.rig.fall(dt,{direction:e.fallDirection});
  if(e.deathTime>2.25){e.rig.dispose();e.disposed=true;}
}
function enemyUpdate(dt){
  for(const e of enemies){
    if(e.disposed)continue;
    if(e.hit>0){
      e.hit-=dt;
      if(e.hit<=0)e.body.forEach(m=>{if(!m.userData.hitProxy)m.material=m.userData.baseMaterial||m.material;});
    }
    if(e.dead){updateEnemyDeath(e,dt);continue;}
    const pos=e.group.position,dx=player.x-pos.x,dz=player.z-pos.z,dist=Math.max(.01,Math.hypot(dx,dz));
    const nx=dx/dist,nz=dz/dist,playerYaw=Math.atan2(dx,dz);
    e.phase+=dt;e.attack-=dt;e.strafeTime-=dt;e.losTime-=dt;
    e.flinch=Math.max(0,e.flinch-dt);e.shotKick=Math.max(0,e.shotKick-dt);
    if(e.strafeTime<=0){e.strafeSign*=-1;e.strafeTime=1.5+Math.random()*1.4;}
    if(e.losTime<=0){
      e.losTime=.18+(e.id%3)*.025;
      const origin=pos.clone().add(new THREE.Vector3(0,1.4,0));
      dir.copy(player).sub(origin).normalize();raycaster.set(origin,dir);raycaster.far=Math.max(.01,origin.distanceTo(player)-.45);
      e.canSee=dist<30&&raycaster.intersectObjects(world.raycastMeshes,false).length===0;
    }
    // Plant the feet for a short aim/fire window; sprint and strafe between shots.
    const aiming=e.canSee&&dist<24&&e.attack<.42;
    const sprinting=dist>12&&!aiming;
    let vx=0,vz=0;
    if(aiming){e.aimTime+=dt;}
    else{
      e.aimTime=0;
      if(sprinting){const speed=3.15+state.wave*.15;vx=nx*speed;vz=nz*speed;}
      else{
        const radial=THREE.MathUtils.clamp((dist-8)*.32,-1.0,.85),side=e.strafeSign;
        vx=nx*radial+nz*side*.95;vz=nz*radial-nx*side*.95;
        const speed=dist<4?2.3:1.85,length=Math.max(.001,Math.hypot(vx,vz));vx=vx/length*speed;vz=vz/length*speed;
      }
    }
    const speed=steerEnemy(e,vx,vz,dt);
    const moveYaw=speed>.15?Math.atan2(e.actualVelocity.x,e.actualVelocity.y):playerYaw;
    const targetYaw=sprinting?moveYaw:playerYaw;
    const turn=angleDelta(e.group.rotation.y,targetYaw)*(1-Math.exp(-dt*(aiming?12:8)));
    e.group.rotation.y+=turn;e.turn=turn/Math.max(dt,.001);
    const sin=Math.sin(e.group.rotation.y),cos=Math.cos(e.group.rotation.y);
    e.rig.animate(dt,{
      speed,localForward:speed>.01?(e.actualVelocity.x*sin+e.actualVelocity.y*cos)/speed:1,
      localStrafe:speed>.01?(e.actualVelocity.x*cos-e.actualVelocity.y*sin)/speed:0,
      aim:aiming?1:sprinting?.18:.72,aimYaw:angleDelta(e.group.rotation.y,playerYaw),
      shot:e.shotKick/.15,hit:e.flinch/.26,turn:e.turn,time:state.elapsed
    });
    e.healthBar.quaternion.copy(camera.quaternion).premultiply(e.group.quaternion.clone().invert());
    if(aiming&&e.attack<=0&&e.aimTime>.2&&Math.abs(angleDelta(e.group.rotation.y,playerYaw))<.4){
      e.group.updateMatrixWorld(true);
      const origin=e.rig.muzzle.getWorldPosition(new THREE.Vector3());
      dir.copy(player).sub(origin).normalize();raycaster.set(origin,dir);raycaster.far=Math.max(.01,origin.distanceTo(player)-.4);
      if(raycaster.intersectObjects(world.raycastMeshes,false).length){e.canSee=false;e.losTime=.1;e.aimTime=0;continue;}
      e.attack=1.7+Math.random()*1.2;e.shotKick=.15;
      const end=player.clone().add(new THREE.Vector3((Math.random()-.5)*2.5,-.3,(Math.random()-.5)*2.5));
      makeTracer(origin,end,true);
      if(Math.random()<(moveAmount>.5?.38:.75))hurt(state.wave===3?8:6,e.group.position.toArray());
    }
  }
  if(enemies.length&&enemies.every(e=>e.dead)&&state.waveWait===0){
    if(state.wave>=3){finish(true);return;}
    state.waveWait=3;showBanner('WAVE CLEAR / 漂亮！',2.5);state.health=Math.min(100,state.health+20);updateHUD();
  }
  if(state.waveWait>0){state.waveWait-=dt;if(state.waveWait<=0){removeEnemies();state.wave++;spawnWave();}}
}
function updateFX(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=8*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*5;p.mesh.scale.setScalar(Math.max(.01,p.life/.6));if(p.life<=0){disposeGroup(p.mesh);p.mesh.material.dispose();particles.splice(i,1);}}
  for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];t.life-=dt;t.mesh.material.opacity=Math.max(0,t.life/t.total);if(t.life<=0){disposeGroup(t.mesh);t.mesh.material.dispose();tracers.splice(i,1);}}
  for(let i=shells.length-1;i>=0;i--){const s=shells[i];s.life-=dt;s.velocity.y-=9*dt;s.mesh.position.addScaledVector(s.velocity,dt);s.mesh.rotation.x+=dt*9;s.mesh.rotation.z+=dt*4;if(s.life<=0){disposeGroup(s.mesh);shells.splice(i,1);}}
  state.damage=Math.max(0,state.damage-dt);state.hit=Math.max(0,state.hit-dt);state.pop=Math.max(0,state.pop-dt);state.banner=Math.max(0,state.banner-dt);
  $('damage-overlay').style.opacity=state.damage*1.8;$('hitmarker').style.opacity=state.hit>0?1:0;$('comic-pop').style.opacity=state.pop>0?Math.min(1,state.pop*7):0;$('wave-banner').style.opacity=state.banner>0?Math.min(1,state.banner*2):0;
}
function drawMinimap(){
  const c=$('minimap').getContext('2d'),s=180,scale=2.8,feet=player.y-PLAYER.eye,upper=feet>2.5,level=upper?feet:0;
  $('radar-level').textContent=lanActive?(upper?'队友 · 上层':'队友位置'):(upper?'UPPER LEVEL':'THE YARD');$('minimap').setAttribute('aria-label',lanActive?'自己和存活队友的位置':'敌人位置雷达');
  c.clearRect(0,0,s,s);c.save();c.translate(90,90);c.strokeStyle='#272a3214';c.lineWidth=1;
  for(let i=-90;i<=90;i+=30){c.beginPath();c.moveTo(i,-90);c.lineTo(i,90);c.stroke();c.beginPath();c.moveTo(-90,i);c.lineTo(90,i);c.stroke();}
  c.strokeStyle='#272a3244';c.strokeRect(-68,-68,136,136);
  c.fillStyle=upper?'#55927f44':'#55927f14';
  for(const d of world.upperSurfaces)c.fillRect((d.x-d.w/2)*scale,(d.z-d.d/2)*scale,d.w*scale,d.d*scale);
  c.fillStyle='#272a3255';for(const b of world.colliders){if(b.min.y>=level+2.1||b.max.y<=level+.05)continue;c.fillRect(b.min.x*scale,b.min.z*scale,(b.max.x-b.min.x)*scale,(b.max.z-b.min.z)*scale);}
  const radarActors=lanActive?[...remotes.players.values()].filter(p=>ownSnapshot?.team&&p.data.team===ownSnapshot.team).map(p=>({group:p.rig.group,dead:p.data.health<=0,team:p.data.team})):enemies;
  for(const e of radarActors){
    if(e.dead)continue;const x=e.group.position.x*scale,z=e.group.position.z*scale,delta=e.group.position.y-feet;
    c.fillStyle=hex(TEAM_COLORS[e.team]||TEAM_COLORS.red);c.strokeStyle='#272a32';c.beginPath();
    if(Math.abs(delta)>2){const sign=delta>0?-1:1;c.moveTo(x,z+sign*5);c.lineTo(x-4,z-sign*3);c.lineTo(x+4,z-sign*3);c.closePath();}
    else c.arc(x,z,4,0,Math.PI*2);c.fill();c.stroke();
  }
  c.translate(player.x*scale,player.z*scale);c.rotate(-yaw);c.fillStyle='#ffd183';c.strokeStyle='#272a32';c.lineWidth=1.8;c.beginPath();c.moveTo(0,-8);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fill();c.stroke();c.restore();
}
function loop(t){
  requestAnimationFrame(loop);const elapsed=Math.max(0,(t-lastTime)/1000||0),dt=Math.min(elapsed,.04);lastTime=t;frame++;
  if(lanActive){
    state.elapsed+=dt;state.shotCooldown=Math.max(0,state.shotCooldown-dt);moveLanPlayer(dt);remotes.update(dt,camera,state.elapsed);
    $('reload-bar').style.width=state.reload>0?`${(1-state.reload/state.reloadTotal)*100}%`:'0';
    $('status-label').textContent=state.reload>0?'RELOADING / 正在换弹':`${state.kills} 击倒 · ${ownSnapshot?.deaths||0} 阵亡 · ${lan.ping} ms`;
  }else if(state.mode==='playing'){
    state.weaponCooldowns=state.weaponCooldowns.map(t=>Math.max(0,t-dt));state.time-=dt;state.elapsed+=dt;state.comboTime-=dt;state.shotCooldown=Math.max(0,state.shotCooldown-dt);movePlayer(dt);enemyUpdate(dt);
    if(state.time<=0){state.time=0;finish(false);}
    // Clamp completion to zero: a negative countdown must not block the next reload.
    if(state.reload>0){state.reload=Math.max(0,state.reload-dt);$('reload-bar').style.width=`${(1-state.reload/state.reloadTotal)*100}%`;if(state.reload===0){state.ammo[state.weapon]=weapons[state.weapon].capacity;$('reload-bar').style.width='0';updateHUD();}}else if(state.shooting)fire();
    $('status-label').textContent=state.reload>0?'RELOADING / 正在换弹':`${String(state.score).padStart(5,'0')} PTS${pointerFallback?' · 拖动转向':''}`;
  }else if(state.mode==='ready'){
    yaw=Math.sin(t*.00008)*.04;
    for(const e of enemies){
      e.group.rotation.y=Math.atan2(player.x-e.group.position.x,player.z-e.group.position.z);
      e.rig.animate(dt,{speed:0,aim:.65,time:t*.001});
      e.healthBar.quaternion.copy(camera.quaternion).premultiply(e.group.quaternion.clone().invert());
    }
  }
  if(state.mode==='won'||state.mode==='lost')for(const e of enemies){if(e.dead&&!e.disposed){e.body.forEach(m=>{if(!m.userData.hitProxy)m.material=m.userData.baseMaterial||m.material;});updateEnemyDeath(e,dt);}}
  const sprinting=state.mode==='playing'&&keys.has('ShiftLeft')&&moveAmount>.5&&!state.aiming;
  sprintBlend=THREE.MathUtils.lerp(sprintBlend,sprinting?1:0,1-Math.exp(-dt*8));
  lookSwayX*=Math.exp(-dt*10);lookSwayY*=Math.exp(-dt*10);
  const w=weapons[state.weapon],aiming=state.aiming&&aimAllowed()&&gunSwitch===0;
  aimBlend=THREE.MathUtils.lerp(aimBlend,aiming?1:0,Math.min(1,dt*14));
  scoped=Boolean(w.scope&&aiming&&aimBlend>.8);$('sniper-scope').classList.toggle('hidden',!scoped);arena.classList.toggle('scoped',scoped);
  arena.classList.toggle('aiming',aimBlend>.8);camera.fov=73+(w.adsFov-73)*aimBlend+sprintBlend*3;camera.updateProjectionMatrix();
  camera.position.copy(player);camera.position.y+=controller.motion.viewOffset+Math.sin(bob*2)*(.022+sprintBlend*.014)*moveAmount*(w.scope?1-aimBlend:1);camera.rotation.set(pitch+(Math.random()-.5)*shake,yaw+(Math.random()-.5)*shake,Math.sin(bob)*(.006+sprintBlend*.005)*moveAmount*(w.scope?1-aimBlend:1));shake*=Math.exp(-dt*17);
  deathView.update(Math.min(elapsed,.25),camera);
  gunRecoil=THREE.MathUtils.lerp(gunRecoil,0,Math.min(1,dt*17));gunSwitch=Math.max(0,gunSwitch-dt*5);
  const reloadPhase=state.reload>0?Math.sin((1-state.reload/state.reloadTotal)*Math.PI):0;
  gun.position.set(THREE.MathUtils.lerp(.32,0,aimBlend)+sprintBlend*.045+Math.sin(bob)*(.012+sprintBlend*.017)*moveAmount+lookSwayX,THREE.MathUtils.lerp(-.30,w.adsY*.9/1.1,aimBlend)+Math.abs(Math.cos(bob))*(.012+sprintBlend*.016)*moveAmount-sprintBlend*.09+reloadPhase*.20-gunSwitch*.3,THREE.MathUtils.lerp(-1.08,-.56,aimBlend)+gunRecoil*.9);
  // Show the support hand beside the receiver; bring reloads up into view.
  // ADS removes the hip-fire yaw so the existing sights still align centrally.
  gun.rotation.set(gunRecoil*.9+reloadPhase*.16+sprintBlend*.12+lookSwayY,(1-aimBlend)*.14+reloadPhase*.36+sprintBlend*.24+lookSwayX*1.4,-reloadPhase*.35-sprintBlend*.19+Math.sin(bob)*(.014+sprintBlend*.013)*moveAmount);gun.scale.setScalar(.9);
  gunModels.forEach((model,i)=>model.update(dt,{reload:i===state.weapon&&state.reload>0?1-state.reload/state.reloadTotal:0}));
  flash.position.fromArray(w.muzzle);flashTime=Math.max(0,flashTime-dt);flash.visible=flashTime>0&&state.mode==='playing';flashLight.intensity=flash.visible?2.5:0;
  $('crosshair').style.setProperty('--spread',`${gunRecoil*75+moveAmount*2}px`);updateFX(dt);
  const sec=Math.max(0,Math.ceil(state.time));$('match-time').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  minimapClock+=dt;if(minimapClock>.09){drawMinimap();minimapClock=0;}
  world.update?.(t*.001);renderer.clear();renderer.render(scene,camera);renderer.clearDepth();if(!deathView.active&&!scoped&&(!lanActive||(state.health>0&&lan.latest?.phase!=='finished')))renderer.render(gunScene,gunCamera);
}

$('death-restart').addEventListener('click',()=>startGame());
$('play-button').addEventListener('click',()=>startGame());$('resume-button').addEventListener('click',resume);$('restart-button').addEventListener('click',()=>lanActive?leaveLan():startGame());
$('lan-button').addEventListener('click',()=>openLan());$('close-lan').addEventListener('click',()=>{if(lan&&!lanActive){lan.disconnect();lan=null;}$('lan-dialog').classList.add('hidden');$('lan-join').disabled=false;});$('lan-form').addEventListener('submit',joinLan);
$('arena-tab').addEventListener('click',()=>{if(state.mode==='paused')resume();else if(state.mode==='playing')pause();else if(lanActive&&state.mode==='dead'){state.mode='playing';pause();}});
function openGuide(){guideWasPlaying=state.mode==='playing'||(lanActive&&state.mode==='dead');if(guideWasPlaying){state.mode='paused';releaseTrigger();resetAim();document.exitPointerLock?.();}keys.clear();$('guide').classList.remove('hidden');}
$('guide-button').addEventListener('click',openGuide);$('close-guide').addEventListener('click',()=>{$('guide').classList.add('hidden');if(guideWasPlaying)resume();});$('guide-play').addEventListener('click',()=>{$('guide').classList.add('hidden');if(guideWasPlaying||lanActive)resume();else startGame();});
function toggleSound(){state.muted=!state.muted;audio.unlock();audio.setMuted(state.muted);$('sound-button').setAttribute('aria-pressed',String(state.muted));$('sound-button').title=state.muted?'打开声音':'静音';}
$('sound-button').addEventListener('click',toggleSound);
function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
function syncFullscreen(){
  const active=Boolean(fullscreenElement());document.body.classList.toggle('game-fullscreen',active);
  $('fullscreen-button').setAttribute('aria-pressed',String(active));$('fullscreen-button').setAttribute('aria-label',active?'退出全屏':'进入全屏');
  $('fullscreen-button').title=active?'退出全屏（F）':'进入全屏（F）';$('pause-fullscreen').textContent=active?'退出全屏 · F':'进入全屏 · F';
  requestAnimationFrame(resize);
}
async function toggleFullscreen(){
  try{
    if(fullscreenElement())await (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    else{const request=arena.requestFullscreen||arena.webkitRequestFullscreen;if(!request){showBanner('此浏览器暂不支持游戏全屏',3);return;}await request.call(arena);}
  }catch{showBanner('未能切换全屏，请点击全屏按钮重试',3);}
}
for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,syncFullscreen);
$('fullscreen-button').addEventListener('click',toggleFullscreen);$('pause-fullscreen').addEventListener('click',toggleFullscreen);
document.addEventListener('keydown',e=>{if(e.target.closest?.('input,textarea,select'))return;if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','KeyR','KeyE','KeyF','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Tab'&&lanActive){e.preventDefault();$('lan-scoreboard').open=true;}if(e.repeat)return;if(e.code==='KeyF')toggleFullscreen();if(e.code==='KeyR')reload();if(/^Digit[1-6]$/.test(e.code))switchWeapon(Number(e.code.slice(-1))-1);if(e.code==='KeyM')toggleSound();if(e.code==='Escape'){if(!$('guide').classList.contains('hidden')){$('guide').classList.add('hidden');if(guideWasPlaying)resume();}else if(state.mode==='playing')pause();else if(state.mode==='dead'){state.mode='playing';pause();}else if(state.mode==='paused')resume();}});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'&&lanActive)$('lan-scoreboard').open=false;});
canvas.addEventListener('mousedown',e=>{if(state.mode!=='playing')return;if(e.button===0){state.shooting=true;mouseDown=true;if(pointerFallback)dragLook=true;fire();}if(e.button===2)setAim(true);});
document.addEventListener('mouseup',e=>{if(e.button===0){releaseTrigger();mouseDown=false;dragLook=false;}if(e.button===2)setAim(false);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(state.mode==='playing'&&(document.pointerLockElement===canvas||dragLook)){const sensitivity=state.aiming?(weapons[state.weapon].scope?.00043:.0012):.002;const mx=Math.max(-160,Math.min(160,e.movementX)),my=Math.max(-100,Math.min(100,e.movementY));lookSwayX=THREE.MathUtils.clamp(lookSwayX+mx*.00012,-.025,.025);lookSwayY=THREE.MathUtils.clamp(lookSwayY+my*.00013,-.02,.02);yaw-=mx*sensitivity;pitch=THREE.MathUtils.clamp(pitch-my*sensitivity,-1.30,1.30);}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&state.mode==='playing'&&!pointerFallback)pause();});
document.addEventListener('pointerlockerror',()=>{pointerFallback=true;showBanner('拖动鼠标转向 · 点击射击',3);});
window.addEventListener('blur',()=>{if(state.mode==='playing')pause();keys.clear();if(lanActive)lan.send({type:'input',...lanInput()});});
// Touch controls: the right side looks, the left stick moves.
const joystick=$('joystick');let stickId=null,stickOrigin=null;
joystick.addEventListener('pointerdown',e=>{e.preventDefault();stickId=e.pointerId;stickOrigin={x:e.clientX,y:e.clientY};joystick.setPointerCapture(e.pointerId);});
joystick.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;const dx=e.clientX-stickOrigin.x,dy=e.clientY-stickOrigin.y,r=Math.max(1,Math.hypot(dx,dy)/35);mobileMove={x:dx/r/35,y:dy/r/35};joystick.firstElementChild.style.transform=`translate(${dx/r}px,${dy/r}px)`;});
function resetStick(){stickId=null;mobileMove={x:0,y:0};joystick.firstElementChild.style.transform='';}joystick.addEventListener('pointerup',resetStick);joystick.addEventListener('pointercancel',resetStick);
canvas.addEventListener('touchstart',e=>{if(state.mode==='playing'&&e.touches.length){const touch=e.changedTouches[0];lookTouch={id:touch.identifier,x:touch.clientX,y:touch.clientY};}},{passive:true});
canvas.addEventListener('touchmove',e=>{if(!lookTouch||state.mode!=='playing')return;const t=[...e.touches].find(t=>t.identifier===lookTouch.id);if(t){const sensitivity=state.aiming?(weapons[state.weapon].scope?.00086:.0024):.004;yaw-=(t.clientX-lookTouch.x)*sensitivity;pitch=THREE.MathUtils.clamp(pitch-(t.clientY-lookTouch.y)*sensitivity,-1.3,1.3);lookTouch.x=t.clientX;lookTouch.y=t.clientY;}},{passive:true});canvas.addEventListener('touchend',()=>lookTouch=null);
$('mobile-fire').addEventListener('pointerdown',e=>{e.preventDefault();state.shooting=true;fire();});for(const type of ['pointerup','pointercancel','pointerleave'])$('mobile-fire').addEventListener(type,releaseTrigger);
for(const [id,code] of [['mobile-jump','Space'],['mobile-interact','KeyE']]){
  const button=$(id);button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(code);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(code));
}
$('mobile-aim').addEventListener('click',()=>setAim(!state.aiming));$('mobile-reload').addEventListener('click',reload);
document.querySelectorAll('[data-weapon]').forEach(button=>button.addEventListener('click',()=>switchWeapon(Number(button.dataset.weapon))));
$('mobile-weapon').addEventListener('click',()=>switchWeapon((state.weapon+1)%weapons.length));
canvas.addEventListener('wheel',e=>{if(state.mode==='playing'){e.preventDefault();switchWeapon((state.weapon+(e.deltaY>0?1:weapons.length-1))%weapons.length);}},{passive:false});
try{
  await Promise.allSettled([document.fonts.load('16px "Lilita One"'),document.fonts.load('16px "ZCOOL KuaiLe"')]);
  init();updateHUD();
}catch(error){console.error(error);$('loading').innerHTML='<b>战场绘制遇到问题</b><span>请使用支持 WebGL 2 的浏览器刷新重试。</span>';}
