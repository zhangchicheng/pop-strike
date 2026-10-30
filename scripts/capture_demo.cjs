// Capture six five-second gameplay takes using real movement, aim and fire inputs.
// Frames advance at 30 Hz so software rendering does not slow the exported video.
// Usage: node scripts/capture_demo.cjs (set CHROME_BINARY if needed); requires ffmpeg.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const GAME=path.join(ROOT,'dist/pop-strike-itch-en');
const OUT=path.join(ROOT,'dist/showcase');
const WORK=fs.mkdtempSync(path.join(os.tmpdir(),'pop-strike-demo-'));
const CHROME=process.env.CHROME_BINARY||path.join(os.homedir(),'.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const FPS=30,WIDTH=1280,HEIGHT=720;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(OUT,{recursive:true});

const soundNames=['shoot','reload','hit','kill','hurt','dash','wave','victory','footstep'];
const hook=`
window.__soundClass=CombatAudio;
window.__soundOriginal=Object.fromEntries(['unlock',...${JSON.stringify(soundNames)}].map(n=>[n,CombatAudio.prototype[n]]));
CombatAudio.prototype.unlock=async function(){return true};
for(const name of ${JSON.stringify(soundNames)})CombatAudio.prototype[name]=function(...args){if(window.__recording)window.__sounds.push({time:window.__clipOffset+(window.__clock-window.__recordStart)/1000,name,args})};
`;
const clockScript=`
window.__clock=1000;window.__raf=new Map();window.__rafId=0;window.__sounds=[];window.__recording=false;
window.requestAnimationFrame=cb=>{const id=++window.__rafId;window.__raf.set(id,cb);return id};
window.cancelAnimationFrame=id=>window.__raf.delete(id);
window.__advance=()=>{window.__clock+=1000/30;const q=[...window.__raf.values()];window.__raf.clear();for(const fn of q)fn(window.__clock)};
`;

(async()=>{
 let chrome,server,errors=[];
 const report=[];
 try{
  server=http.createServer((req,res)=>{
   const pathname=new URL(req.url,'http://localhost').pathname;
   const file=path.resolve(GAME,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(GAME+path.sep)){res.writeHead(403);res.end();return;}
   fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end();return;}
    if(file===path.join(GAME,'game.js')){
     let source=data.toString();
     source=source.replace('const $ = id =>',hook+'\nconst $ = id =>');
     source=source.replace('window.__popStrike=',"window.__demo={THREE,scene,world,camera,enemies};window.__popStrike=");
     data=Buffer.from(source);
    }
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');res.end(data);
   });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-pipe',`--window-size=${WIDTH},${HEIGHT}`,`--user-data-dir=${WORK}/chrome`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
  let seq=0,buffer='',pending=new Map();chrome.stderr.on('data',()=>{});
  chrome.stdio[4].on('data',data=>{buffer+=data;let pos;while((pos=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,pos));buffer=buffer.slice(pos+1);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);}});
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0')});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const c=(method,params={})=>call(method,params,sessionId);
  const ev=async expression=>{const r=await c('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await c('Runtime.enable');await c('Page.enable');await c('Emulation.setDeviceMetricsOverride',{width:WIDTH,height:HEIGHT,deviceScaleFactor:1,mobile:false});
  await c('Page.addScriptToEvaluateOnNewDocument',{source:clockScript});
  await c('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/index.html`});
  for(let i=0;i<200&&!await ev('Boolean(window.__popStrike)');i++)await delay(100);
  assert.ok(await ev('Boolean(window.__popStrike)'),'Game initialized');
  await ev(`document.getElementById('fullscreen-button').click()`);await delay(200);await ev('__advance()');
  assert.equal(await ev('document.fullscreenElement?.id'),'arena');
  await ev(`
   window.__key=(code,down=true)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
   window.__tap=code=>{__key(code);__key(code,false)};
   window.__mouse=(down,button=0)=>(down?document.getElementById('game-canvas'):document).dispatchEvent(new MouseEvent(down?'mousedown':'mouseup',{button,bubbles:true}));
   window.__tick=n=>{for(let i=0;i<n;i++)__advance()};
   window.__move=(code,axis,value,greater)=>{__key(code);let i=0;for(;i<210;i++){const p=__popStrike.getState().player;if(greater?p[axis]>=value:p[axis]<=value)break;__advance()}__key(code,false);return i};
   window.__look=(yaw,pitch,rate=1)=>{const s=__popStrike.getState(),sensitivity=s.scope?.00043:document.getElementById('arena').classList.contains('aiming')?.0012:.002;const dy=Math.atan2(Math.sin(yaw-s.cameraRotation[1]),Math.cos(yaw-s.cameraRotation[1]))*rate,dp=(pitch-s.cameraRotation[0])*rate;let mx=-dy/sensitivity,my=-dp/sensitivity;for(let i=0;i<30&&(Math.abs(mx)>.001||Math.abs(my)>.001);i++){const x=Math.max(-160,Math.min(160,mx)),y=Math.max(-100,Math.min(100,my));document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y,bubbles:true}));mx-=x;my-=y;}};
   window.__target=null;
   window.__aim=(far=false,rate=.18)=>{const {THREE,world,enemies,camera}=__demo;const ray=new THREE.Raycaster(),origin=new THREE.Vector3().fromArray(__popStrike.getState().camera);__demo.scene.updateMatrixWorld(true);
    const targets=enemies.filter(e=>!e.dead&&!e.disposed).map(e=>{const point=e.group.position.clone().add(new THREE.Vector3(0,1.3,0)),delta=point.clone().sub(origin),distance=delta.length();ray.set(origin,delta.normalize());ray.far=distance-.3;return {e,point,distance,visible:ray.intersectObjects(world.raycastMeshes,false).length===0}}).filter(t=>t.visible);
    targets.sort((a,b)=>far?b.distance-a.distance:a.distance-b.distance);const target=targets.find(t=>t.e===__target)||targets[0];
    if(!target)return false;__target=target.e;const d=target.point.sub(origin),yaw=Math.atan2(-d.x,-d.z),pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));__look(yaw,pitch,rate);return true;};
   // Advance short-lived DOM effects on the same clock as the captured gameplay.
   window.__timers=new Map();window.__timerId=0;
   window.setTimeout=(fn,ms=0,...args)=>{const id=++__timerId;__timers.set(id,{at:__clock+ms,fn:()=>fn(...args)});return id};
   window.clearTimeout=id=>__timers.delete(id);
   window.__animateDOM=()=>{for(const [id,t]of __timers)if(t.at<=__clock){__timers.delete(id);t.fn()}for(const a of document.getAnimations()){a.__demoStart??=__clock;a.pause();a.currentTime=__clock-a.__demoStart}};
  `);
  const names=['POP RIFLE','PUMP SHOTGUN','SWIFT SMG','SCOUT SNIPER','HAND CANNON','SIXSHOT REVOLVER'];
  for(let weapon=0;weapon<6;weapon++){
   console.log(`Preparing ${weapon+1}/6: ${names[weapon]}`);
   await ev(`window.__recording=false;window.__target=null;__timers.clear();document.getElementById('restart-button').click();__tick(1)`);
   await delay(100);
   if(weapon===3)await ev(`__move('KeyS','z',20,true);__move('KeyD','x',18,true);__move('KeyW','z',6.5,false);__look(1.2,-.29);__tick(1);__move('KeyW','x',16.9,false);__tick(20)`);
   else if(weapon===2||weapon===5)await ev(`__move('KeyW','z',14,false);__move('KeyA','x',-1.3,false);__tick(75)`);
   else await ev(`__move('KeyA','x',-3.4,false);__move('KeyW','z',14,false);__tick(${weapon===1?75:40})`);
   await ev(`__tap('Digit${weapon+1}');__tick(12);__aim(${weapon===3},1);__tick(5);__animateDOM();window.__clipOffset=${weapon*5};window.__recordStart=__clock;window.__recording=true;`);
   const start=await ev('__popStrike.getState()');assert.ok(start.health>0,`Alive before ${names[weapon]}`);
   const initialSoundCount=await ev('__sounds.length');
   for(let frame=0;frame<150;frame++){
    const t=frame/30;
    let input='';
    if(weapon===0){if(frame===20||frame===120)input+='__mouse(true);';if(frame===48||frame===140)input+='__mouse(false);';if(frame===65)input+="__tap('KeyR');";}
    if(weapon===1){if([22,48,73].includes(frame))input+='__mouse(true);';if([23,49,74].includes(frame))input+='__mouse(false);';if(frame===85)input+="__tap('KeyR');";}
    if(weapon===2){if(frame===17||frame===102)input+='__mouse(true);';if(frame===43||frame===126)input+='__mouse(false);';if(frame===50)input+="__tap('KeyR');";}
    if(weapon===3){if(frame===25)input+='__mouse(true,2);';if(frame===120)input+='__mouse(false,2);';if(frame===50||frame===95)input+='__mouse(true);';if(frame===51||frame===96)input+='__mouse(false);';}
    if(weapon===4){if([23,44,64].includes(frame))input+='__mouse(true);';if([24,45,65].includes(frame))input+='__mouse(false);';if(frame===72)input+="__tap('KeyR');";}
    if(weapon===5){if([24,47,69].includes(frame))input+='__mouse(true);';if([25,48,70].includes(frame))input+='__mouse(false);';if(frame===80)input+="__tap('KeyR');";}
    // Small real strafes provide parallax while retaining a clear weapon silhouette.
    if(weapon!==3){if(frame===5)input+="__key('KeyD');";if(frame===18)input+="__key('KeyD',false);";if(frame===104)input+="__key('KeyA');";if(frame===116)input+="__key('KeyA',false);";}
    const s=await ev(`__aim(${weapon===3},.16);${input}__advance();__animateDOM();__popStrike.getState()`);
    assert.ok(s.health>0&&s.mode==='playing',`Take ${weapon} interrupted at ${t}s`);
    const {data}=await c('Page.captureScreenshot',{format:'jpeg',quality:92});
    fs.writeFileSync(path.join(WORK,`frame-${String(weapon*150+frame).padStart(4,'0')}.jpg`),Buffer.from(data,'base64'));
    if(frame===40||frame===90)fs.writeFileSync(path.join(OUT,`demo-preview-${weapon+1}-${frame}.jpg`),Buffer.from(data,'base64'));
    if(frame===74)console.log(`Captured ${weapon*5+2.5}s / 30s`);
   }
   const take=await ev(`__mouse(false);__mouse(false,2);window.__recording=false;({state:__popStrike.getState(),events:__sounds.slice(${initialSoundCount})})`);
   const shots=take.events.filter(e=>e.name==='shoot');assert.ok(shots.length>=2,`${names[weapon]} actually fires`);
   report.push({weapon:names[weapon],shots:shots.length,kills:take.state.kills,startHealth:start.health,endHealth:take.state.health});
   console.log(`Captured ${(weapon+1)*5}s / 30s: ${shots.length} shots, ${take.state.kills} kills.`);
  }
  console.log('Rendering the game’s original procedural audio…');
  const wav=await ev(`(async()=>{
   const offline=new OfflineAudioContext(2,48000*30,48000);let audioTime=0;
   const proxy=new Proxy(offline,{get(target,key){if(key==='currentTime')return audioTime;if(key==='state')return 'running';if(key==='resume')return async()=>{};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
   const NativeAudioContext=window.AudioContext;window.AudioContext=function(){return proxy};
   Object.assign(__soundClass.prototype,__soundOriginal);const audio=new __soundClass();await audio.unlock();
   for(const event of __sounds){audioTime=Math.max(0,event.time);audio[event.name](...event.args)}
   window.AudioContext=NativeAudioContext;const buffer=await offline.startRendering();
   const bytes=new ArrayBuffer(44+buffer.length*4),v=new DataView(bytes);const tag=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i))};
   tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,192000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,bytes.byteLength-44,true);
   const left=buffer.getChannelData(0),right=buffer.getChannelData(1);for(let i=0;i<buffer.length;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,left[i]))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,right[i]))*32767,true)}
   return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([bytes],{type:'audio/wav'}))});
  })()`);
  fs.writeFileSync(path.join(WORK,'game-audio.wav'),Buffer.from(wav,'base64'));
  assert.deepEqual(errors,[]);
  const filters=[];
  const font=path.join(GAME,'fonts/LilitaOne-Regular.ttf');
  for(let i=0;i<6;i++)filters.push(`drawtext=fontfile='${font}':text='0${i+1} / ${names[i]}':fontcolor=0xdad4c9:fontsize=28:box=1:boxcolor=0x272a32@0.88:boxborderw=12:x=36:y=92:enable='gte(t,${i*5})*lt(t,${(i+1)*5})'`);
  filters.push('fade=t=in:st=0:d=0.2','fade=t=out:st=29.6:d=0.4');
  const output=path.join(OUT,'pop-strike-demo-30s.mp4');
  const ff=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','warning','-framerate','30','-i',path.join(WORK,'frame-%04d.jpg'),'-i',path.join(WORK,'game-audio.wav'),'-vf',filters.join(','),'-af','afade=t=in:st=0:d=0.1,afade=t=out:st=29.6:d=0.4','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','30','-movflags','+faststart',output],{encoding:'utf8'});
  if(ff.status!==0)throw new Error(ff.stderr);
  fs.writeFileSync(path.join(OUT,'demo-capture-report.json'),JSON.stringify({duration:30,fps:FPS,width:WIDTH,height:HEIGHT,takes:report,soundEvents:await ev('__sounds.length'),output,work:WORK},null,2));
  console.log(JSON.stringify({output,bytes:fs.statSync(output).size,report,work:WORK}));
 }finally{chrome?.kill('SIGTERM');server?.close();server?.closeAllConnections();}
})().catch(error=>{console.error(error);process.exitCode=1;});
