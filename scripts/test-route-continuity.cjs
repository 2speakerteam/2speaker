const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
new Function(source);
const part = source.slice(source.indexOf('function walkPreviewDistance'), source.indexOf('function selectGuideTransport'));
const origin = [127, 37];
const point = m => [127 + m / 88804, 37];
const route = [[origin, point(100)]];
let now = 0, id = 0, jobs = new Map(), instances = [], currentFixture = [];
function timer(fn, delay = 0) { const key = ++id; jobs.set(key, { fn, time: now + delay }); return key; }
function tick() {
  const item = [...jobs].sort((a,b) => a[1].time-b[1].time || a[0]-b[0])[0];
  if (!item) return false;
  jobs.delete(item[0]); now = item[1].time; item[1].fn(); return true;
}
function until(test, max = 1000) { for(let i=0;i<max;i++) { if(test()) return; if(!tick()) break; } assert.ok(test(), 'condition not reached'); }
class Element {
  constructor() { this.style = { setProperty(key,value) { this[key]=value; } }; this.children = []; this.textContent = ''; this.isConnected = true; this.disabled = false; const classes=new Set(); this.classList = { add(x){classes.add(x);}, remove(x){classes.delete(x);}, contains(x){return classes.has(x);} }; }
  getBoundingClientRect() { return {width:600,height:300}; }
  querySelector(s) { return nodes[s] ||= new Element(); }
  closest() { return visual; }
  append(el) { this.children.push(el); el.parent = this; }
  remove() { if(this.parent) this.parent.children = this.parent.children.filter(x=>x!==this); }
  replaceChildren() { this.children = []; }
  setAttribute() {} removeAttribute() {} addEventListener() {} removeEventListener() {} focus() {} scrollIntoView() {}
}
const nodes = {}; const visual = new Element();
const document = { querySelector(s) { return nodes[s] ||= new Element(); }, createElement() { return new Element(); } };
class LatLng { constructor(lat,lng) { this.a=lat; this.b=lng; } lat(){return this.a;} lng(){return this.b;} }
class Panorama {
  constructor(el,options) {
    this.el = el; this.listeners = {}; this.options = options;
    this.fixture = options.panoId ? (instances.find(x=>x.fixture.id===options.panoId)?.fixture
      || currentFixture.shift() || {id:options.panoId,point:origin})
      : (currentFixture.shift() || {id:'photo-'+instances.length, point:[options.position.lng(),options.position.lat()]});
    instances.push(this);
    timer(()=>this.emit('pano_changed'),1);
    timer(()=>this.emit('init'),50);
  }
  emit(name,value) { for(const fn of this.listeners[name]||[]) fn(value); }
  getLocation() { return {coord:new LatLng(this.fixture.point[1],this.fixture.point[0]),photodate:'2026-06-01'}; }
  getPanoId() { return this.fixture.id; }
  getPov() { return this.pov || this.options.pov; }
  setPov(pov) { this.pov=pov; this.povUpdates=(this.povUpdates||0)+1; (this.povTimes||=[]).push(now); this.emit('pov_changed'); }
  setVisible() {}
}
const maps = {LatLng, Panorama, Event:{addListener(p,n,f){(p.listeners[n] ||= []).push(f);},clearInstanceListeners(p){p.listeners={};}}};
const sandbox = { document, window:{matchMedia(){return {matches:false};}}, setTimeout:timer, clearTimeout:k=>jobs.delete(k),requestAnimationFrame:f=>timer(f,16),currentPage:'guide',routeRequestToken:1,walkPreviewState:null,console };
vm.createContext(sandbox); vm.runInContext(part,sandbox);
const frames = sandbox.walkPreviewFrames(route,[]);
assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'landmark-start',holdMs:3500},{phase:'start'}),1000,'show starting exit for one second before departure');
for(const phase of ['approach','turn','depart','landmark-end']) {
  assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'turn',holdMs:1600},{phase,important:true}),1000,'one-second pause before each important orientation');
}
assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'approach',holdMs:850},{phase:'straight'}),850,'non-rotation approach pacing is unchanged');
assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'turn',holdMs:1600},{phase:'straight'}),1600,'post-turn hold is unchanged when no further orientation follows');
assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'straight',holdMs:400},{phase:'straight'}),400,'ordinary slide pacing unchanged');
assert.equal(sandbox.walkPreviewHoldBeforeNext({phase:'straight',holdMs:750},{phase:'straight'}),750,'straight junction reading time unchanged');
const arrowFrame={phase:'turn',turnAngle:90,position:origin,ahead:[127,37.00013],meters:30};
const arrowPhoto={offset:0,lateral:0,meters:30,nearby:false};
const arrowPov={pan:0,tilt:0,fov:75};
const arrow=sandbox.walkPreviewTurnArrow(arrowFrame,origin,arrowPhoto,arrowPov,600,300);
assert.ok(arrow,'small arrow projects onto lower road area');
const arrowPoints=arrow.split(' ').map(p=>p.split(',').map(Number));
assert.ok(arrowPoints.every(p=>p[1]>150 && p[1]<282),'ground cue is below horizon, not centered');
assert.ok(Math.max(...arrowPoints.map(p=>p[0]))-Math.min(...arrowPoints.map(p=>p[0]))<80,'small cue');
assert.notEqual(sandbox.walkPreviewTurnArrow(arrowFrame,origin,arrowPhoto,{...arrowPov,pan:10},600,300),arrow,'cue follows view rotation');
assert.equal(sandbox.walkPreviewTurnArrow(arrowFrame,origin,arrowPhoto,{...arrowPov,pan:180},600,300),null,'hide when target is behind camera');
for(const phase of ['start','approach','depart','arrival']) assert.equal(sandbox.walkPreviewTurnArrow({...arrowFrame,phase},origin,arrowPhoto,arrowPov,600,300),null);
assert.equal(sandbox.walkPreviewTurnArrow({...arrowFrame,phase:'straight',turnAngle:0},origin,arrowPhoto,arrowPov,600,300),null,'ordinary straight roads never show an arrow');
assert.equal(sandbox.walkPreviewTurnArrow({...arrowFrame,phase:'straight',junctionCue:true,turnAngle:0},origin,arrowPhoto,arrowPov,600,300),arrow,'confirmed straight-through junction gets the unchanged forward cue');
const snappedPoint=[127,37+10/111320];
const snappedStraight={...arrowFrame,phase:'straight',junctionCue:true,cueAhead:[127,37+30/111320]};
const snappedPhoto={...arrowPhoto,point:snappedPoint,meters:40,offset:10};
assert.ok(sandbox.walkPreviewTurnArrow(snappedStraight,snappedPoint,snappedPhoto,arrowPov,600,300),'straight cue follows the photograph route position, not a sample behind it');
assert.ok(sandbox.walkPreviewTurnArrow(snappedStraight,[snappedPoint[0]+10/88804,snappedPoint[1]],{...snappedPhoto,lateral:10,offset:15},arrowPov,600,300),'sidewalk offset does not push connecting direction cue off-screen');
assert.equal(sandbox.walkPreviewTurnArrow({...snappedStraight,cueAhead:[127,37+15/111320]},snappedPoint,snappedPhoto,arrowPov,600,300),null,'snapped cue cannot extend across an upcoming corner');
assert.equal(sandbox.walkPreviewTurnArrow({...arrowFrame,phase:'straight'},origin,{...arrowPhoto,nearby:true},arrowPov,600,300),null,'uncertain connecting scene never gets a guessed cue');
assert.equal(sandbox.walkPreviewTurnArrow({...snappedStraight,phase:'depart'},snappedPoint,snappedPhoto,arrowPov,600,300),null,'cue disappears after leaving the junction even if its metadata remains');
const verifiedCenter=[127.09204455377541,37.5516751937452];
const junctionRoute=[[verifiedCenter.map((v,i)=>v+(i?-50/111320:0)),verifiedCenter.map((v,i)=>v+(i?50/111320:0))]];
const junctionFrames=sandbox.walkPreviewFrames(junctionRoute,[]);
assert.ok(junctionFrames.some(f=>f.junctionCue),'verified intersection detected by geographic proximity');
assert.ok(junctionFrames.filter(f=>f.junctionCue).every(f=>f.important),'confirmed junctions cannot be discarded as duplicate straight scenes');
assert.ok(junctionFrames.filter(f=>f.junctionCue).length<=3,'brief junction window only');
assert.equal(new Set(junctionFrames.filter(f=>f.junctionCue).map(f=>f.arrowCueKey)).size,1,'adjacent samples share one junction identity');
assert.ok(junctionFrames.filter(f=>f.meters>55).every(f=>!f.junctionCue),'hide on straight road after junction');
assert.ok(sandbox.walkPreviewFrames(junctionRoute.map(path=>path.map(p=>[p[0]+.001,p[1]])),[]).every(f=>!f.junctionCue),'unrelated parallel road cannot inherit a junction cue');
for(const description of ['두 갈래길에서 직진','삼거리에서 직진','사거리에서 직진']) {
  assert.ok(sandbox.walkPreviewFrames(junctionRoute,[{position:verifiedCenter,description}]).some(f=>f.important),'provider fork descriptions retained');
}
const stepFrame={phase:'straight',meters:20,total:300,nextDecision:{meters:120,direction:'right'}};
assert.equal(sandbox.walkPreviewStepInstruction(stepFrame),'약 100m 직진 후 우회전하세요.');
assert.equal(sandbox.walkPreviewStepInstruction({...stepFrame,meters:70}),'약 50m 직진 후 우회전하세요.');
assert.equal(sandbox.walkPreviewStepInstruction({...stepFrame,phase:'approach',focusMeters:30,direction:'left'}),'약 10m 직진 후 좌회전하세요.');
assert.equal(sandbox.walkPreviewStepInstruction({...stepFrame,phase:'turn',direction:'right'}),'여기서 우회전하세요.');
assert.equal(sandbox.walkPreviewStepInstruction({...stepFrame,junctionCue:true}),'이 갈림길에서는 앞쪽 길로 직진하세요.');
assert.match(sandbox.walkPreviewStepInstruction({...stepFrame,phase:'depart'}),/100m 직진 후 우회전/);
assert.match(sandbox.walkPreviewStepInstruction({...stepFrame,nextDecision:null}),/목적지까지 약 280m/);
assert.match(sandbox.walkPreviewStepInstruction(stepFrame,true),/100 m, then turn right/);
assert.match(sandbox.walkPreviewStepInstruction({phase:'landmark-start',landmark:{label:'테스트역 2번 출구'}}),/테스트역 2번 출구에서 출발/);
assert.match(sandbox.walkPreviewStepInstruction({phase:'arrival'}),/실제 입구/);
assert.equal(sandbox.walkPreviewTurnArrow(arrowFrame,origin,{...arrowPhoto,nearby:true},arrowPov,600,300),null);
assert.equal(sandbox.walkPreviewTurnArrow(arrowFrame,origin,{...arrowPhoto,meters:40},arrowPov,600,300),null,'no backward cue from overshot camera');
assert.equal(sandbox.walkPreviewTurnArrow({...arrowFrame,ahead:[127,37.00005]},origin,arrowPhoto,arrowPov,600,300),null,'do not project beyond next close junction');
assert.equal(sandbox.walkPreviewTurnArrow(arrowFrame,origin,arrowPhoto,arrowPov,0,0),null);
console.log('PASS: road-plane turn and connecting cues, snapped-camera anchoring, endpoint/uncertain/offscreen suppression');
const junctionPoint=[127,37+10/111320];
const approachArrow={...arrowFrame,phase:'approach',position:origin,turnPosition:junctionPoint,turnAhead:[127+14/88804,junctionPoint[1]]};
assert.ok(sandbox.walkPreviewTurnArrow(approachArrow,origin,arrowPhoto,arrowPov,600,300),'intersection approach shows a bent directional cue before turning');
const compactArrow=sandbox.walkPreviewTurnArrow(approachArrow,origin,arrowPhoto,arrowPov,600,300).split(' ').map(p=>p.split(',').map(Number));
assert.ok(compactArrow.length>15,'turn shaft has a rounded bend');
assert.ok(Math.max(...compactArrow.map(p=>p[0]))-Math.min(...compactArrow.map(p=>p[0]))<=96.1,'turn cue width capped at 16 percent');
assert.equal(sandbox.walkPreviewTurnArrow(approachArrow,origin,arrowPhoto,{...arrowPov,pan:180},600,300),null);
const parkGate = {label:'어린이대공원 정문',kind:'park-gate',position:[127.07579042,37.5495968]};
const exitOne = {label:'어린이대공원역 1번 출구',kind:'station-exit',position:[127.07548491,37.54901353]};
const entranceViews = sandbox.walkPreviewEntranceScenes(parkGate,'end');
assert.equal(entranceViews.length,4);
assert.equal(new Set(entranceViews.map(x=>x.verifiedView.panoId)).size,4);
assert.equal(sandbox.walkPreviewEntranceScenes({...parkGate,position:origin},'end').length,0);
assert.equal(sandbox.walkPreviewEntranceScenes({...exitOne,label:'어린이대공원역 11번 출구'},'start').length,0);
assert.equal(sandbox.walkPreviewEntranceScenes(parkGate,'start').length,0);
const verifiedFrames = sandbox.walkPreviewEndpointFrames(frames,{start:{landmark:exitOne},end:{landmark:parkGate}},route);
assert.equal(verifiedFrames[0].verifiedView.panoId,'LqZVpRDZplIJ30MsJTVr6w');
assert.equal(verifiedFrames.at(-1).verifiedView.panoId,'6Vu26tJDnRclihsCDB7N1g');
assert.equal(sandbox.walkPreviewPhotoContext(origin,verifiedFrames.at(-1),route),null);
assert.match(sandbox.walkPreviewCue(verifiedFrames.at(-1),false),/정문 바로 앞/);
assert.match(sandbox.walkPreviewCue(verifiedFrames.at(-1),false),/미리보기/);
assert.equal(frames[0].phase,'start');
assert.equal(frames.at(-1).phase,'arrival');
assert.ok(frames.some(x=>Math.abs(x.meters-5)<0.01));
assert.equal(frames.find(x=>x.phase==='straight').holdMs,400);
assert.equal(frames[0].holdMs,1800);
const corner = [[origin,point(60),[point(60)[0],37.0006]]];
const turnFrames = sandbox.walkPreviewFrames(corner,[]);
for (const phase of ['approach','turn','depart']) assert.ok(turnFrames.some(x=>x.phase===phase),phase);
assert.equal(turnFrames.find(x=>x.phase==='turn').holdMs,1600);
assert.equal(turnFrames.find(x=>x.phase==='approach').holdMs,850);
const cornerBridge=turnFrames.find(x=>Math.abs(x.meters-55)<.1);
assert.equal(cornerBridge.phase,'approach','sample immediately before corner keeps junction context');
const bridgePhoto=sandbox.walkPreviewPhotoContext(point(55),cornerBridge,corner);
assert.ok(Math.abs(bridgePhoto.heading-90)<1,'do not look around corner while still approaching it');
// Achasan exit: instruction at 18 m precedes the physical left corner at 28 m.
const exitApproachPath = [[[127.09008350144443,37.551658418163264],
  [127.09015572151327,37.551502881985],[127.0901946090726,37.55142511394591],
  [127.09076121941453,37.55159177145594]]];
const exitApproachFrames = sandbox.walkPreviewFrames(exitApproachPath,[{
  position:exitApproachPath[0][1],description:'좌회전 후 천호대로를 따라 10m 이동',turnType:12
}]);
const exitCorner = exitApproachFrames.find(f=>f.phase==='turn');
const exitApproach = exitApproachFrames.find(f=>f.phase==='approach' && Math.abs(f.meters-12.286)<.1);
assert.ok(exitCorner.turnAngle>80 && Math.abs(exitCorner.meters-27.732)<.1,'early instruction must not erase real corner');
assert.ok(exitApproach && exitApproach.direction==='left','preserve 12 m approach and show upcoming left turn');
const exitPhoto = sandbox.walkPreviewPhotoContext(exitApproach.position,exitApproach,exitApproachPath);
assert.ok(sandbox.walkPreviewTurnArrow(exitApproach,exitApproach.position,exitPhoto,
  {pan:exitPhoto.heading,tilt:0,fov:75},600,300),'exit approach arrow is visible on the road');
assert.equal(exitApproachFrames.filter(f=>f.phase==='turn').length,1,'no duplicate early turn');
const oppositeInstruction = sandbox.walkPreviewFrames(exitApproachPath,[{
  position:exitApproachPath[0][1],description:'우회전 후 10m 이동',turnType:13
}]);
assert.ok(oppositeInstruction.find(f=>f.phase==='turn').meters<20,'do not match an opposite-direction instruction to this corner');
console.log('PASS: early station-exit instruction retains approach cue and actual geometric corner');
const css = fs.readFileSync(__dirname + '/../src/styles.css','utf8');
assert.match(css,/\.walk-preview-panorama \{[^}]*z-index: 0;[^}]*isolation: isolate;/);
assert.match(css,/\.walk-preview-map-button \{[^}]*z-index: 3;/);
// Nearby reverse-running parallel segment must not override the requested forward section.
const loop = [[point(0),point(100),[point(100)[0],37.00004],[127,37.00004]]];
const context = sandbox.walkPreviewPhotoContext([point(30)[0],37.000035],{position:point(30),meters:30,focusMeters:null,phase:'straight'},loop);
assert.ok(context.heading > 80 && context.heading < 100, 'prefer forward local section');
assert.equal(sandbox.walkPreviewPhotoContext([point(30)[0],37.00015],{position:point(30),meters:30,focusMeters:null,phase:'straight'},route),null,'reject sideways driveway photograph');
function start(fixtures) {
  jobs.clear(); instances=[]; currentFixture=fixtures; now=0;
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1},{paths:route,maneuvers:[]});
  return sandbox.walkPreviewState;
}
const state = start([
  {id:'first',point:point(0)},
  {id:'first',point:point(0)},
  {id:'second',point:point(22)},
  {id:'backwards',point:point(10)},
  {id:'second',point:point(22)},
]);
tick(); assert.equal(state.history.length,0,'pano_changed must not reveal uninitialized view');
tick(); assert.equal(state.history.length,0,'init must allow camera to settle');
until(()=>state.history.length===1);
assert.ok(now>=350,'offscreen camera settle');
const firstMessage = state.message.textContent;
const firstInstruction = state.instruction.textContent;
assert.equal(state.instruction.hidden,false);
until(()=>state.duplicateScenes===1);
assert.equal(state.message.textContent,firstMessage,'skip must not replace visible cue');
assert.equal(state.instruction.textContent,firstInstruction,'pending or skipped image cannot change visible step instruction');
assert.equal(state.viewer.style.visibility,'visible');
until(()=>state.finished && !state.playing && !state.loading);
const ids = Array.from(state.history,x=>x.panoId);
assert.equal(new Set(ids).size,ids.length,'no duplicate scene IDs');
assert.ok(!ids.includes('backwards'),'reject backwards snap');
assert.ok(state.history.length>2);
for(let i=1;i<state.history.length;i++) assert.ok(state.history[i].routeMeters>=state.history[i-1].routeMeters-6);
const lastCount=instances.length;
while(tick()) {}
assert.equal(instances.length,lastCount,'finish does not reload final photograph');
state.prev.onclick(); until(()=>!state.loading);
assert.equal(state.cursor,state.history.length-2);
state.play.onclick(); until(()=>!state.playing && !state.loading);
state.play.onclick();
assert.match(state.progress.textContent,/장면 1 · /,'replay counter resets before image loading');
assert.equal(state.seek.value,'0','replay bar resets immediately');
until(()=>!state.loading);
assert.equal(state.cursor,0,'replay starts at first cached view');
assert.equal(state.instruction.textContent,firstInstruction,'cached replay restores starting instruction');
sandbox.stopWalkPreview(true);
assert.equal(state.instruction.textContent,state.originalInstruction.text,'closing restores route overview');
while(tick()) {}
assert.equal(state.layers.size,0,'close disposes all layers');
assert.equal(nodes['#walk-preview-panorama'].children.length,0);
// A bad candidate must keep the preceding real photo visible while searching.
const missing = start([{id:'a',point:point(0)},{id:'far',point:[128,38]},{id:'b',point:point(22)}]);
until(()=>missing.skippedScenes===1);
assert.equal(missing.viewer.style.visibility,'visible');
assert.equal(missing.loading,true);
sandbox.stopWalkPreview(true); while(tick()) {}
assert.equal(missing.layers.size,0);
const closing = start([{id:'closing',point:point(0)}]);
tick(); tick(); // Camera is settling, but the new scene has not been committed.
assert.equal(closing.history.length,0);
sandbox.stopWalkPreview(true); while(tick()) {}
assert.equal(closing.history.length,0,'closing during settle cannot reveal a stale scene');
assert.equal(closing.layers.size,0);
console.log('PASS: syntax, dense sampling, turn phases, loop heading, init/settle, physical duplicates, backward snaps, stable cue, missing image seek, previous/replay/finish/cleanup');
const stable = start([]);
assert.match(stable.progress.textContent,/장면 1 · /,'new route clears previous progress immediately');
assert.equal(stable.seek.value,'0');
until(()=>stable.history.length===3 && !stable.loading);
until(()=>stable.loading);
assert.equal(stable.prev.disabled,false,'previous stays enabled during background loading');
assert.equal(stable.next.disabled,false,'next stays enabled during background loading');
const visibleIndex=stable.history[stable.activeLayer.sceneCursor].index;
stable.prev.onclick();
until(()=>!stable.loading); while(tick()) {}
assert.ok(stable.index<visibleIndex,'previous interrupts loading and moves back from visible scene');
assert.equal(stable.playing,false);
stable.next.onclick();
assert.equal(stable.loading,false,'recent forward view is reused immediately');
assert.equal(stable.next.disabled,false,'manual loading also keeps button appearance stable');
sandbox.stopWalkPreview(true); while(tick()) {}
assert.ok(!source.includes('촘촘히 찾은 거리뷰를 빠르게 잇고'),'requested note removed');
console.log('PASS: stable controls during loading, interruptible previous/next, immediate start/replay reset, note removal');
const scrub = start([]);
assert.equal(scrub.seek.disabled,true,'cannot scrub before any real scene');
until(()=>scrub.history.length===3 && !scrub.loading);
scrub.play.onclick();
assert.equal(scrub.playing,false);
assert.equal(scrub.seek.disabled,false);
assert.ok(Number(scrub.seek.max)>2,'unseen route scenes reserve space on the playback bar');
assert.ok(Number(scrub.seek.value)<Number(scrub.seek.max),'ongoing playback must not be pinned to the end');
scrub.seek.onpointerdown();
scrub.seek.value='0'; scrub.seek.oninput(); scrub.seek.onpointerup();
until(()=>!scrub.loading);
assert.equal(scrub.cursor,0,'drag to far left returns to first photograph');
assert.equal(scrub.index,scrub.history[0].index);
assert.equal(scrub.playing,false,'manual scrub stays paused');
scrub.seek.value='1'; scrub.seek.oninput(); scrub.seek.onchange();
until(()=>!scrub.loading);
assert.equal(scrub.cursor,1,'keyboard/range step visits precisely one scene');
// Fast scrub requests must cancel old loads and only reveal the last selection.
scrub.seek.value='0'; scrub.seek.oninput(); scrub.seek.onchange();
assert.equal(scrub.loading,false,'cached first scene needs no reload');
scrub.seek.value='2'; scrub.seek.oninput(); scrub.seek.onchange();
until(()=>!scrub.loading); while(tick()) {}
assert.equal(scrub.cursor,2,'latest drag wins');
assert.equal(scrub.activeLayer.sceneCursor,2);
scrub.seek.value='0'; scrub.seek.oninput(); scrub.seek.onpointerup();
until(()=>!scrub.loading);
scrub.next.onclick(); assert.equal(scrub.loading,false,'cached next scene is immediate');
scrub.seek.onpointerdown(); scrub.seek.value='0'; scrub.seek.oninput(); scrub.seek.onpointercancel();
while(tick()) {}
assert.equal(scrub.cursor,0,'drag interrupts in-flight next scene');
assert.equal(scrub.activeLayer.sceneCursor,0);
assert.equal(scrub.playing,false);
scrub.seek.value='1'; scrub.seek.oninput();
sandbox.stopWalkPreview(true); while(tick()) {}
assert.equal(scrub.layers.size,0);
assert.equal(scrub.seek.oninput,null,'seek handlers removed on close');
assert.equal(scrub.seek.onpointerdown,null);
console.log('PASS: scene-index slider, first scene, keyboard steps, paused drag, latest request wins, interrupted load, cancelled pointer, closed debounce cleanup');
const free = start([]);
until(()=>free.history.length===1 && !free.loading);
free.play.onclick();
assert.equal(free.seek.disabled,false,'forward seeking enabled after the first image');
const fullMax=Number(free.seek.max);
free.seek.value=String(Math.floor(fullMax/2)); free.seek.oninput(); free.seek.onchange();
until(()=>!free.loading);
assert.equal(free.index,Math.floor(fullMax/2),'load unseen middle directly');
assert.match(free.progress.textContent,/장면 2 · /,'candidate index is not the displayed scene number');
assert.equal(free.playing,false);
free.seek.value=String(fullMax); free.seek.oninput(); free.seek.onchange();
until(()=>!free.loading);
assert.equal(free.index,fullMax,'unseen end can be selected');
assert.match(free.progress.textContent,/장면 3 · /,'displayed photographs have contiguous ordinals');
assert.equal(free.seek.max,String(fullMax),'timeline length remains stable');
free.seek.value='0'; free.seek.oninput(); free.seek.onchange(); until(()=>!free.loading);
assert.equal(free.index,0,'return from end to start');
free.next.onclick(); until(()=>!free.loading);
assert.equal(free.index,1,'next goes to adjacent route point, not last cached endpoint');
free.prev.onclick(); until(()=>!free.loading); assert.equal(free.index,0);
sandbox.stopWalkPreview(true); while(tick()) {}
console.log('PASS: free forward/back seeking, uncached middle/end, stable timeline and adjacent navigation');

// Holding the scrubber must not start repeated panorama loads. Cached returns
// cancel in-flight work and remain selected after all old callbacks have run.
const smooth = start([]);
until(()=>smooth.history.length >= 8 && !smooth.loading);
assert.ok(smooth.layers.size <= 6,'bounded cache plus at most one loading viewer');
const firstLayer = [...smooth.layers].find(layer => layer.sceneCursor === 0);
assert.ok(firstLayer,'first photograph remains pinned after many scenes');
until(()=>smooth.loading && smooth.pendingLayer);
const lateInit = smooth.pendingLayer.panorama.listeners.init[0];
const beforeDrag = instances.length;
smooth.seek.onpointerdown();
smooth.seek.value='4'; smooth.seek.oninput();
smooth.seek.onchange();
while(tick()) {}
assert.equal(instances.length,beforeDrag,'no intermediate requests while holding pointer');
assert.equal(smooth.scrubbing,true,'change event cannot commit while pointer held');
smooth.seek.value='0'; smooth.seek.oninput(); smooth.seek.onpointerup();
assert.equal(smooth.loading,false);
assert.equal(smooth.activeLayer,firstLayer,'first scene reused without rebuilding panorama');
assert.equal(instances.length,beforeDrag);
lateInit(); while(tick()) {}
assert.equal(smooth.index,0,'late init cannot override selected first scene');
assert.equal(smooth.playing,false);
assert.equal(firstLayer.element.style.opacity,'1');
// A manual request with no photo must remain there, not scan to the end.
currentFixture=[{id:'manual-missing',point:[128,38]}];
const unseen=smooth.frames.length-2;
smooth.seek.value=String(unseen); smooth.seek.oninput(); smooth.seek.onchange();
until(()=>!smooth.loading); while(tick()) {}
assert.equal(smooth.index,unseen,'missing manual selection does not advance');
assert.equal(smooth.playing,false);
smooth.seek.value='0'; smooth.seek.oninput(); smooth.seek.onchange();
assert.equal(smooth.activeLayer,firstLayer);
sandbox.stopWalkPreview(true); while(tick()) {}
assert.equal(smooth.layers.size,0,'all cached viewers released on close');
console.log('PASS: bounded first/recent viewer cache, release-only pointer seek, stale callback cancellation, no manual missing-photo jump');

const startLandmark = { label:'테스트역 1번 출구',kind:'station-exit',position:point(0) };
const centeredExit = sandbox.walkPreviewCameraPov({landmark:startLandmark},
  {heading:80,routeHeading:170},'2026-01-01');
assert.equal(centeredExit.pan,80,'exit introduction must not rotate away toward the route');
assert.equal(centeredExit.fov,100,'wide road context retained');
const endLandmark = { label:'테스트공원 정문',kind:'gate',position:point(100) };
const endpointContext = { maps,map:{},english:false,requestId:1,start:{landmark:startLandmark},end:{landmark:endLandmark} };
const endpointFrames = sandbox.walkPreviewEndpointFrames(frames,endpointContext,route);
assert.equal(endpointFrames[0].phase,'landmark-start');
assert.equal(endpointFrames[1].phase,'start');
assert.equal(endpointFrames.at(-1).phase,'landmark-end');
assert.equal(endpointFrames[0].meters,0);
assert.deepEqual(endpointFrames[0].position,startLandmark.position,'query exact exit, not another year 12 m along the path');
assert.equal(endpointFrames.at(-1).meters,frames.at(-1).total);
const facingExit = sandbox.walkPreviewPhotoContext(point(12),endpointFrames[0],route);
assert.ok(facingExit.heading > 260 && facingExit.heading < 280,'first photo looks back at exit');
const facingGate = sandbox.walkPreviewPhotoContext(point(84),endpointFrames.at(-1),route);
assert.ok(facingGate.heading > 80 && facingGate.heading < 100,'last photo looks at gate');
assert.equal(sandbox.walkPreviewPhotoContext(point(60),endpointFrames[0],route),null,'no distant exit photograph');
assert.equal(sandbox.walkPreviewPhotoContext(point(0),endpointFrames[0],route),null,'no unstable heading at exact landmark');
const signFrame={landmark:{kind:'station-exit',label:'어린이대공원역 1번 출구'}};
const signPov=sandbox.walkPreviewCameraPov(signFrame,{heading:10},'2023-10-30 10:52:14');
assert.equal(signPov.pan,38);
assert.equal(signPov.fov,38);
assert.equal(sandbox.walkPreviewCameraPov(signFrame,{heading:10},'2026-09-18 14:14:07').pan,10,'sign adjustment cannot leak to newer photographs');
jobs.clear(); instances=[]; currentFixture=endpointFrames.map((frame,i)=>({id:i<2?'exit':'ep-'+i,
  point:i<2?point(12):frame.landmark?point(84):frame.position})); now=0;
sandbox.startWalkPreview(endpointContext,{paths:route,maneuvers:[]});
const ep=sandbox.walkPreviewState;
until(()=>ep.history.length===1 && !ep.loading);
assert.equal(instances[0].options.logoControl,false,'official panorama logo control is disabled');
assert.equal(instances[0].pov.fov,100,'exit introduction includes pavement and road context');
const exitShownAt=now, exitUpdatesBeforeRotation=instances[0].povUpdates;
until(()=>instances[0].povUpdates>exitUpdatesBeforeRotation);
assert.equal(now-exitShownAt,1050,'rotation follows one-second exit hold plus panorama initialization');
until(()=>ep.history.length===2);
assert.equal(instances[1].options.panoId,ep.history[0].panoId,'departure retains the original camera and capture date');
assert.ok(instances[0].povUpdates>=30,'departure rotates through intermediate views in the real panorama');
const exitRotationTimes=instances[0].povTimes.slice(-60);
assert.equal(exitRotationTimes.length,60,'station departure uses 25 percent longer rotation without longer holds');
assert.equal(exitRotationTimes.at(-1)-exitRotationTimes[0],1180,'rotation is slightly slower without changing the one-second hold');
assert.ok(exitRotationTimes.slice(1).every((time,i)=>time-exitRotationTimes[i]===20),'station rotation uses steady 20 ms steps');
assert.equal(ep.history[0].panoId,ep.history[1].panoId,'keep purposeful exit-facing then route-facing views');
assert.ok(Math.abs(ep.history[0].heading-ep.history[1].heading)>150);
// Returning by Previous or the scrubber must replay the same rotation, even
// when both panorama viewers are already cached. No extra viewer or history.
const cachedExit=instances[0], cachedViewerCount=instances.length;
ep.prev.onclick();
assert.equal(ep.index,0);
let cachedRotationStart=cachedExit.povUpdates;
ep.play.onclick();
until(()=>ep.index===1 && !ep.loading);
assert.equal(cachedExit.povUpdates-cachedRotationStart,60,'Previous then Play animates the cached exit again');
assert.equal(instances.length,cachedViewerCount,'cached replay needs no new panorama');
assert.equal(ep.history.length,2,'cached replay does not duplicate history');
ep.seek.value='0'; ep.seek.oninput(); ep.seek.onchange(); until(()=>!ep.loading);
cachedRotationStart=cachedExit.povUpdates;
ep.play.onclick();
until(()=>ep.index===1 && !ep.loading);
assert.equal(cachedExit.povUpdates-cachedRotationStart,60,'scrub to start then Play also rotates again');
ep.seek.value='0'; ep.seek.oninput(); ep.seek.onchange(); until(()=>!ep.loading);
cachedRotationStart=cachedExit.povUpdates;
ep.play.onclick(); until(()=>cachedExit.povUpdates>cachedRotationStart+5);
ep.seek.value='0'; ep.seek.oninput(); ep.seek.onchange(); until(()=>!ep.loading);
const cancelledCachedUpdates=cachedExit.povUpdates;
while(tick()) {}
assert.equal(cachedExit.povUpdates,cancelledCachedUpdates,'scrubbing cancels an active cached rotation');
assert.equal(ep.index,0,'late rotation cannot override selected scene');
ep.play.onclick();
until(()=>ep.finished && !ep.playing && !ep.loading);
assert.equal(ep.frames.at(-1).phase,'landmark-end');
assert.match(ep.message.textContent,/도착 입구 확인/);
cachedRotationStart=cachedExit.povUpdates;
const finishedHistoryCount=ep.history.length;
ep.play.onclick();
until(()=>ep.index===1 && !ep.loading);
assert.ok(cachedExit.povUpdates-cachedRotationStart>=60,'Replay animates even when the next viewer was evicted');
assert.equal(ep.history.length,finishedHistoryCount,'reloaded history is not appended twice');
sandbox.stopWalkPreview(true); while(tick()) {}
jobs.clear(); instances=[]; currentFixture=[{id:'cancel-exit',point:point(12)}]; now=0;
sandbox.startWalkPreview(endpointContext,{paths:route,maneuvers:[]});
const rotating=sandbox.walkPreviewState;
until(()=>instances[0].povUpdates>5);
const rotations=instances[0].povUpdates;
sandbox.stopWalkPreview(true); while(tick()) {}
assert.equal(instances[0].povUpdates,rotations,'closing cancels an in-progress orientation animation');
assert.equal(rotating.layers.size,0);
// Parse compact/no-space input and the user's colloquial “1번역”.
const parsing=source.slice(source.indexOf('function normalizeEntranceQuery'),source.indexOf('function bottomNav'));
vm.runInContext(parsing,sandbox);
assert.equal(sandbox.parseRouteRequest('어린이대공원역1번출구에서어린이대공원정문').origin,'어린이대공원역 1번 출구');
assert.equal(sandbox.normalizeEntranceQuery('어린이대공원1번역'),'어린이대공원역 1번 출구');
assert.equal(sandbox.entranceNameMatches('어린이대공원역1번출구','어린이대공원역 11번 출구'),false);
assert.equal(sandbox.entranceNameMatches('어린이대공원역1번출구','어린이대공원역 7호선 1번출구'),true);
assert.equal(sandbox.entranceNameMatches('어린이대공원 정문','어린이대공원 후문'),false);
console.log('PASS: endpoint sequence, exit/gate headings, proximity limits, intentional orientation change, exact exit parsing');

// Preserve all three decision phases even when a nearest-camera lookup returns
// the identical panorama/heading. Animate a real head turn within that camera.
jobs.clear(); instances=[]; currentFixture=[]; now=0;
const bendFrames=sandbox.walkPreviewFrames(corner,[]);
const bendPoint=point(60);
currentFixture=bendFrames.map(frame=>({id:frame.meters>=50 && frame.meters<=75?'corner-camera':'bend-'+frame.meters,
  point:frame.meters>=50 && frame.meters<=75?bendPoint:frame.position}));
sandbox.startWalkPreview({maps,map:{},english:false,requestId:1},{paths:corner,maneuvers:[]});
const bend=sandbox.walkPreviewState;
until(()=>!bend.loading && bend.frames[bend.index].phase==='turn');
assert.equal(bend.activeLayer.turnArrow.hidden,false,'turn scene displays its ground cue');
const turnView=bend.activeLayer.panorama, turnPov=turnView.getPov();
turnView.setPov({...turnPov,pan:turnPov.pan+180});
assert.equal(bend.activeLayer.turnArrow.hidden,true,'user looking away hides the cue');
turnView.setPov(turnPov);
assert.equal(bend.activeLayer.turnArrow.hidden,false,'looking back restores the route-anchored cue');
until(()=>bend.finished && !bend.playing && !bend.loading);
assert.deepEqual(Array.from(bend.history.filter(entry=>entry.panoId==='corner-camera'),entry=>bend.frames[entry.index].phase),
  ['approach','approach','turn','depart'],'same-camera corner phases are never removed as duplicates');
assert.ok(instances.some(instance=>instance.fixture.id==='corner-camera' && instance.povUpdates>=36),
  'junction orientation changes rotate inside the actual panorama');
const cornerRotation=instances.find(instance=>instance.fixture.id==='corner-camera' && instance.povUpdates>=36);
assert.ok(cornerRotation.povTimes.some((_,start)=> {
  const rotation=cornerRotation.povTimes.slice(start,start+60);
  return rotation.length===60 && rotation.slice(1).every((time,i)=>time-rotation[i]===20);
}),
  'junction rotation retains its original 20 ms pacing');
assert.ok(instances.some(instance=>instance.el.style.cssText.includes('450ms')),'gentle crossfade');
sandbox.stopWalkPreview(true); while(tick()) {}
// A backward snap at an important junction must show an explicit map cue,
// not get silently fast-forwarded by the ordinary duplicate scanner.
jobs.clear(); instances=[]; currentFixture=[]; now=0;
currentFixture=bendFrames.map(frame=>({id:'junction-'+frame.meters,
  point:frame.phase==='turn'?point(30):frame.position}));
sandbox.startWalkPreview({maps,map:{},english:false,requestId:1},{paths:corner,maneuvers:[]});
const missedTurn=sandbox.walkPreviewState;
until(()=>missedTurn.message.textContent.includes('이 갈림길의 사진은 이전 구간'));
assert.equal(missedTurn.viewer.style.visibility,'hidden','show the route map for an untrustworthy turn view');
assert.equal(missedTurn.frames[missedTurn.index].phase,'turn');
sandbox.stopWalkPreview(true); while(tick()) {}
console.log('PASS: junction phases survive deduplication, gradual same-camera turn, slower pace, backward-turn map cue');

// One persistent forward overlay spans adjacent photographs of the same fork.
// It must survive provider late events, not blink or be consumed by a cache.
jobs.clear(); instances=[]; now=0;
currentFixture=junctionFrames.map((frame,i)=>({id:'once-'+i,point:frame.position}));
sandbox.startWalkPreview({maps,map:{},english:false,requestId:1},{paths:junctionRoute,maneuvers:[]});
const once=sandbox.walkPreviewState, visibleCueFrames=new Set(), cueElements=new Set();
let cueAppearances=0, wasCueVisible=false;
until(()=> {
  const visible=once.turnArrow && !once.turnArrow.hidden;
  if (visible && !wasCueVisible) cueAppearances++;
  wasCueVisible=Boolean(visible);
  if (once.activeLayer?.arrowContext && visible) {
    visibleCueFrames.add(once.activeLayer.arrowContext.frame);
    cueElements.add(once.turnArrow);
  }
  return once.finished && !once.playing && !once.loading;
});
assert.equal(cueAppearances,1,'one uninterrupted arrow appearance across the entire fork');
assert.equal(cueElements.size,1,'same overlay DOM element across photographs');
assert.equal(visibleCueFrames.size,junctionFrames.filter(f=>f.junctionCue).length,'both junction photographs stay guided');
const chosenCue=[...visibleCueFrames][0], chosenIndex=once.frames.indexOf(chosenCue);
const cueCandidates=once.frames.filter(f=>f.arrowCueKey===chosenCue.arrowCueKey && f.junctionCue);
assert.ok(cueCandidates.every(f=>f.junctionCue),'the short junction window shares its continuous cue');
const otherIndex=once.frames.findIndex(f=>f!==chosenCue && f.arrowCueKey===chosenCue.arrowCueKey);
assert.ok(otherIndex>=0,'test covers multiple adjacent junction candidates');
assert.ok(once.history.some(entry=>entry.index===otherIndex),'second photograph is retained, only its repeated arrow is suppressed');
once.seek.value=String(chosenIndex); once.seek.oninput(); once.seek.onchange(); until(()=>!once.loading);
assert.equal(once.activeLayer.turnArrow.hidden,false,'backward seek restores the selected cue photograph');
once.seek.value=String(otherIndex); once.seek.oninput(); once.seek.onchange(); until(()=>!once.loading);
assert.equal(once.activeLayer.turnArrow.hidden,false,'adjacent junction photograph also has guidance after seeking');
const sharedCue=once.turnArrow;
once.activeLayer.panorama.emit('pano_changed');
assert.equal(sharedCue.hidden,false,'late pano_changed does not hide the active junction cue');
const inactiveCueLayer=[...once.layers].find(layer=>layer!==once.activeLayer && layer.updateTurnArrow);
if (inactiveCueLayer) {
  inactiveCueLayer.panorama.emit('pano_changed');
  inactiveCueLayer.panorama.emit('pov_changed');
  assert.equal(sharedCue.hidden,false,'cached viewer events cannot hide the visible overlay');
}
once.arrowScenes.set(chosenCue.arrowCueKey,once.frames[otherIndex]);
once.seek.value=String(chosenIndex); once.seek.oninput(); once.seek.onchange(); until(()=>!once.loading);
assert.equal(once.activeLayer.turnArrow.hidden,false,'manual revisit clears stale cue claims');
once.play.onclick();
until(()=>once.finished && !once.playing && !once.loading);
once.arrowScenes.set(chosenCue.arrowCueKey,once.frames[otherIndex]);
once.play.onclick();
until(()=>once.activeLayer?.arrowContext?.frame===chosenCue && !once.loading);
assert.equal(once.activeLayer.turnArrow.hidden,false,'full replay shows the primary junction cue again');
sandbox.stopWalkPreview(true); while(tick()) {}
console.log('PASS: continuous single junction overlay, late provider events, backward/forward seeking and replay');

// The initial exit turn must not reappear in each adjacent photograph after
// manual Next/Previous. Failed projections do not consume the single cue.
jobs.clear(); instances=[]; now=0;
currentFixture=exitApproachFrames.map((frame,i)=>({id:'exit-cue-'+i,point:frame.position}));
sandbox.startWalkPreview({maps,map:{},english:false,requestId:1},{paths:exitApproachPath,maneuvers:[{
  position:exitApproachPath[0][1],description:'좌회전 후 천호대로를 따라 10m 이동',turnType:12
}]});
const exitCueState=sandbox.walkPreviewState, exitCueVisible=new Set();
until(()=> {
  if (exitCueState.turnArrow && !exitCueState.turnArrow.hidden && exitCueState.activeLayer?.arrowContext)
    exitCueVisible.add(exitCueState.activeLayer.arrowContext.frame);
  return exitCueState.finished && !exitCueState.playing && !exitCueState.loading;
});
assert.equal(exitCueVisible.size,1,'initial exit turn uses just one visible photograph');
const exitChosen=[...exitCueVisible][0], exitChosenIndex=exitCueState.frames.indexOf(exitChosen);
exitCueState.seek.value=String(exitChosenIndex); exitCueState.seek.oninput(); exitCueState.seek.onchange(); until(()=>!exitCueState.loading);
assert.equal(exitCueState.turnArrow.hidden,false,'chosen turn scene restores on seek');
exitCueState.next.onclick(); until(()=>!exitCueState.loading);
assert.equal(exitCueState.turnArrow.hidden,true,'manual next does not repeat the turn cue');
exitCueState.prev.onclick(); until(()=>!exitCueState.loading);
assert.equal(exitCueState.turnArrow.hidden,false,'manual previous restores the original cue');
sandbox.stopWalkPreview(true); while(tick()) {}
console.log('PASS: initial turn has one cue across autoplay, manual Next and Previous');

// The green answer bubble holds the route overview; scene instructions stay separate.
const overviewContext={maps:{LatLng,LatLngBounds:class {extend(){}},Polyline:class {},Marker:class {}},
  map:{fitBounds(){}},requestId:1,english:false,
  start:{latitude:37,longitude:127,landmark:{kind:'station-exit',label:'아차산역 2번 출구'},walkingComparison:{checked:10,candidates:10}},
  end:{latitude:37,longitude:127.01,landmark:{kind:'gate',label:'아차산어울림광장'}}};
let answerText='', previewStarts=0;
const overviewSandbox={guideTransportContext:overviewContext,
  guideTransportRoutes:{WALK:{minutes:15,distance:1100,paths:route},TAXI:{summary:'택시 테스트'}},
  currentPage:'guide',routeRequestToken:1,routeOrigin:'아차산역',destination:'아차산',routeMapOverlays:[],
  clearRouteOverlays(){},stopWalkPreview(){},startWalkPreview(){previewStarts++;},setGuideAnswer(text){answerText=text;}};
vm.createContext(overviewSandbox);
vm.runInContext(source.slice(source.indexOf('function walkPreviewRouteSummary'),source.indexOf('async function requestNaverTransitRoute')),overviewSandbox);
overviewSandbox.selectGuideTransport('WALK',true);
const expectedOverview='아차산역 2번 출구로 나와서 → 아차산어울림광장 · 약 1100m · 약 15분 · 확인된 10개 경로 중 최단 (10개 비교 요청)';
assert.equal(answerText,expectedOverview,'walking answer bubble shows requested full route overview');
assert.equal(previewStarts,1,'walking preview still starts normally');
overviewSandbox.selectGuideTransport('TAXI');
assert.match(answerText,/택시 테스트 경로를 확인했어요/,'non-walking answer remains unchanged');
overviewContext.english=true;
overviewSandbox.selectGuideTransport('WALK');
assert.match(answerText,/1100 m · about 15 min · shortest of 10 available routes \(10 requested\)/);
overviewContext.english=false;
delete overviewContext.start.walkingComparison;
delete overviewContext.start.landmark;
overviewSandbox.selectGuideTransport('WALK');
assert.equal(answerText,'아차산역 → 아차산어울림광장 · 약 1100m · 약 15분','no invented exit or shortest-route claim without comparison');
console.log('PASS: green walking answer overview, dynamic exit/comparison, English and non-walking modes');

(async()=>{
  vm.runInContext(source.slice(source.indexOf('function automaticEntranceQuery'),source.indexOf('function routeErrorMessage')),sandbox);
  assert.equal(sandbox.automaticEntranceQuery('아차산'),true);
  assert.equal(sandbox.automaticEntranceQuery('서울 아차산'),true);
  assert.equal(sandbox.automaticEntranceQuery('아차산 정상'),false);
  assert.equal(sandbox.automaticEntranceQuery('부산'),false);
  vm.runInContext(source.slice(source.indexOf('function isKoreaCoordinate'),source.indexOf('function createNaverMap')),sandbox);
  const calls=[];
  const candidates={
    '테스트역':[{name:'테스트역1번출구',longitude:127,latitude:37,kind:'station-exit',matched:true},
      {name:'테스트역2번출구',longitude:point(10)[0],latitude:37,kind:'station-exit',matched:true}],
    '테스트공원':[{name:'테스트공원정문',longitude:point(100)[0],latitude:37,kind:'gate',matched:true}]
  };
  sandbox.fetch=async(url,options)=>{
    calls.push(url);
    if(url.includes('/api/places/entrance')) return {ok:true,json:async()=>({candidates:candidates[decodeURIComponent(url.split('q=')[1])]})};
    const body=JSON.parse(options.body);
    // Exit 2 is closer in a straight line, but exit 1 has the shorter actual path.
    return {ok:true,json:async()=>({totalTime:60,totalDistance:body.startX===127?80:300,paths:route,maneuvers:[]})};
  };
  const picked=await sandbox.choosePedestrianEndpoints('테스트역','테스트공원',()=>true);
  assert.equal(picked.start.name,'테스트역1번출구');
  assert.equal(picked.end.name,'테스트공원정문');
  assert.ok(picked.start.walkingRoute,'reuse selected API route rather than fetch twice');
  assert.equal(calls.filter(url=>url==='/api/walking/routes').length,2);
  calls.length=0;
  assert.equal(await sandbox.choosePedestrianEndpoints('테스트역','테스트공원',()=>false),null);
  assert.equal(calls.filter(url=>url==='/api/walking/routes').length,0,'stale search cannot initiate route comparisons');
  console.log('PASS: automatic entrance selection uses real route distance, reuses response, cancels stale requests');
  vm.runInContext(source.slice(source.indexOf('function localPedestrianEntrance'),source.indexOf('function geocodeDestination')),sandbox);
  const market = sandbox.localPedestrianEntrance('동원시장',{longitude:127.0874,latitude:37.5895});
  assert.equal(market.landmark.label,'동원전통시장 면목로 입구');
  assert.equal(sandbox.localPedestrianEntrance('동원시장',{longitude:129,latitude:35}),null,'local market alias must not leak to another city');
  assert.equal(sandbox.localPedestrianEntrance('동원시장'),null,'unqualified market requires nearby origin');
  sandbox.resolvePedestrianLandmark=async()=>null;
  sandbox.resolveRouteStart=async()=>({longitude:point(100)[0],latitude:37});
  candidates['테스트역']=Array.from({length:4},(_,i)=>({name:`테스트역${i+1}번출구`,longitude:point(30-i*10)[0],latitude:37,kind:'station-exit',matched:true}));
  calls.length=0;
  const ordinary=await sandbox.choosePedestrianEndpoints('테스트역','일반시장',()=>true,{});
  assert.equal(ordinary.start.name,'테스트역4번출구','fourth geometrically closest exit must still be compared');
  assert.equal(ordinary.start.walkingComparison.checked,4);
  assert.equal(ordinary.start.walkingComparison.entranceConfirmed,false);
  assert.equal(calls.filter(url=>url==='/api/walking/routes').length,4);
  console.log('PASS: ordinary destinations compare every exit; verified market aliases are geographically scoped');
  candidates['아차산']=[{name:'아차산등산로입구',longitude:point(100)[0],latitude:37,kind:'gate',matched:true},
    {name:'아차산정상',longitude:128,latitude:38,kind:'gate',matched:true}];
  calls.length=0;
  const mountain=await sandbox.choosePedestrianEndpoints('테스트역','아차산',()=>true,{});
  assert.equal(mountain.end.landmark.label,'아차산등산로입구');
  assert.equal(mountain.start.walkingComparison.checked,4,'every exit is compared against actual trail entrances');
  assert.equal(mountain.start.walkingComparison.entranceConfirmed,true);
  sandbox.getCurrentPosition=async()=>({longitude:127,latitude:37});
  const current=await sandbox.choosePedestrianEndpoints('','아차산',()=>true,{});
  assert.equal(current.end.landmark.label,'아차산등산로입구');
  candidates['아차산'].push({name:'아차산어울림광장',longitude:127.103,latitude:37.553,kind:'approach',matched:true});
  assert.equal((await sandbox.pedestrianCandidates('아차산',{})).length,2,'include the verified southern public approach');
  candidates['아차산'][2].longitude=129;
  assert.equal((await sandbox.pedestrianCandidates('아차산',{})).length,1,'reject distant namesake plaza');
  console.log('PASS: Achasan entrance routing, explicit summit preserved, current-location origin');
})().catch(error=>{console.error(error);process.exitCode=1;});



