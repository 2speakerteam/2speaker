const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
new Function(source);
const previewSource = source.slice(source.indexOf('function walkPreviewDistance'),
  source.indexOf('function selectGuideTransport'));
const point = meters => [127 + meters / 88804,37];
const route = [[point(0),point(100)]];
let now = 0, nextId = 0, jobs = new Map(), fixtures = [], instances = [];
function timer(fn,delay=0) { const id=++nextId; jobs.set(id,{fn,time:now+delay}); return id; }
function tick() {
  const next=[...jobs].sort((a,b)=>a[1].time-b[1].time || a[0]-b[0])[0];
  if (!next) return false;
  jobs.delete(next[0]); now=next[1].time; next[1].fn(); return true;
}
function until(done) { for(let i=0;i<2000;i++) { if(done()) return; if(!tick()) break; }
  assert.ok(done(),'expected preview state was not reached'); }
class Element {
  constructor() {
    this.style={setProperty(key,value){this[key]=value;}};
    this.children=[]; this.textContent=''; this.isConnected=true;
    const values=new Set();
    this.classList={add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)};
  }
  getBoundingClientRect(){return {width:600,height:300};}
  querySelector(selector){return nodes[selector] ||= new Element();}
  closest(){return visual;}
  append(child){this.children.push(child);child.parent=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  replaceChildren(){this.children=[];}
  setAttribute(){} removeAttribute(){} addEventListener(){} removeEventListener(){}
  focus(){} scrollIntoView(){}
}
const nodes={},visual=new Element();
const document={body:new Element(),querySelector:selector=>nodes[selector] ||= new Element(),
  createElement:()=>new Element()};
class LatLng { constructor(lat,lng){this.latitude=lat;this.longitude=lng;}
  lat(){return this.latitude;} lng(){return this.longitude;} }
class Panorama {
  constructor(element,options){
    this.element=element;this.options=options;this.listeners={};
    this.fixture=fixtures.shift() || {id:'photo-'+instances.length,
      point:[options.position.lng(),options.position.lat()]};
    instances.push(this);
    if(!this.fixture.hang) timer(()=>this.emit('init'),50);
  }
  emit(name,value){for(const listener of this.listeners[name]||[])listener(value);}
  getLocation(){return {coord:new LatLng(this.fixture.point[1],this.fixture.point[0]),photodate:'2026-06-01'};}
  getPanoId(){return this.fixture.id;}
  getPov(){return this.pov || this.options.pov;}
  setPov(pov){this.pov=pov;this.emit('pov_changed');}
  setVisible(){}
}
const maps={LatLng,Panorama,Event:{addListener(instance,name,listener){
  (instance.listeners[name] ||= []).push(listener);},clearInstanceListeners(instance){instance.listeners={};}}};
const sandbox={document,window:{matchMedia:()=>({matches:true})},setTimeout:timer,
  clearTimeout:id=>jobs.delete(id),requestAnimationFrame:fn=>timer(fn,16),
  currentPage:'guide',routeRequestToken:1,walkPreviewState:null,console,WALK_PANORAMA_TIMEOUT_MS:2500};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('function isLodgingPlace'),
  source.indexOf('async function ensureLodgingArrivalView')),sandbox);
vm.runInContext(previewSource,sandbox);
vm.runInContext(source.slice(source.indexOf('async function ensureLodgingArrivalView'),
  source.indexOf('async function routeToLodgingFront')),sandbox);
vm.runInContext(source.slice(source.indexOf('function trimWalkingRouteAtFront'),
  source.indexOf('async function prepareLodgingArrival')),sandbox);
vm.runInContext(source.slice(source.indexOf('async function prepareLodgingArrival'),
  source.indexOf('async function findNamedLodging')),sandbox);
const realEnsureLodgingArrivalView=sandbox.ensureLodgingArrivalView;

const frames=sandbox.walkPreviewFrames(route,[]);
const place={name:'테스트 호텔',longitude:point(100)[0],latitude:37};
assert.equal(sandbox.walkPreviewArrivalEndpoint(frames.at(-1),{end:place},route),true);
assert.equal(sandbox.walkPreviewArrivalEndpoint(frames.find(frame=>frame.meters>=60),{end:place},route),false,
  'a photograph before the final route point is not arrival');
const landmarkStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{name:'동대문',resolvedName:'흥인지문',originKind:'manual'}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(landmarkStart),/입력한 출발지 · 동대문 \(흥인지문\) 앞에서 출발해요/);
assert.doesNotMatch(sandbox.walkPreviewStepInstruction(landmarkStart),/번 출구/);
const gpsStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{name:'현재 위치 · 종로구 종로 266',originKind:'gps'}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(gpsStart),/현재 위치 · 종로구 종로 266에서 출발해요/);
assert.doesNotMatch(sandbox.walkPreviewStepInstruction(gpsStart),/입력한 출발지/);
const stationStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{landmark:{kind:'station-exit',label:'동대문역 9번 출구',position:point(0)}}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(stationStart),/동대문역 9번 출구에서 출발해요/);
const busStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{landmark:{kind:'bus-stop',label:'동대문 버스 승강장',position:point(0)}}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(busStart),/동대문 버스 승강장에서 출발해요/);

const lodging={...place,category:'숙박>호텔',arrivalView:{panoId:'hotel-front',position:point(60)}};
const lodgingFrames=sandbox.walkPreviewLodgingFrontFrames(frames,lodging,route);
assert.ok(lodgingFrames.length < frames.length,'verified street-side lodging photo removes the indoor/POI tail');
assert.ok(Math.abs(lodgingFrames.at(-1).meters-60)<1);
assert.equal(lodgingFrames.at(-1).phase,'landmark-end');
assert.equal(lodgingFrames.at(-1).verifiedView.panoId,'hotel-front');
assert.equal(sandbox.walkPreviewArrivalEndpoint(lodgingFrames.at(-1),{end:lodging},route),true);
assert.equal(sandbox.walkPreviewLodgingFrontFrames(frames,{...lodging,category:'음식점'},route),frames,
  'non-lodging routes retain the provider endpoint');
assert.equal(sandbox.walkPreviewLodgingFrontFrames(frames,{...lodging,arrivalView:{panoId:'far',position:point(300)}},route),frames,
  'an unrelated lodging photo cannot cut the route');
const trimmed=sandbox.trimWalkingRouteAtFront({paths:route,maneuvers:[],totalDistance:100,totalTime:600},lodging);
assert.ok(trimmed,'the original walking path is reused when it passes the verified hotel front');
assert.ok(Math.abs(sandbox.walkPreviewDistance(trimmed.paths.at(-1).at(-1),point(60)))<1);
assert.ok(Math.abs(trimmed.totalDistance-60)<1);
assert.ok(Math.abs(trimmed.totalTime-360)<10);
assert.equal(sandbox.walkPreviewFrames(trimmed.paths,trimmed.maneuvers).at(-1).meters<65,true,
  'route geometry ends at the lodging frontage, with no indoor tail');
assert.equal(sandbox.trimWalkingRouteAtFront({paths:route,maneuvers:[],totalTime:600},
  {...lodging,arrivalView:{panoId:'far',position:point(300)}}),null,
  'a distant photograph must not shorten the route');
const endpointPhoto={...lodging,arrivalView:{panoId:'terminal-front',position:point(98)}};
assert.equal(sandbox.walkPreviewLodgingFrontFrames(frames,endpointPhoto,route).at(-1).verifiedView.panoId,
  'terminal-front','a verified hotel photo near the route end is not discarded');
const routedFront={...lodging,arrivalAtFront:true,arrivalView:{panoId:'street-front',position:point(96)}};
const routedFrames=sandbox.walkPreviewLodgingFrontFrames(frames,routedFront,route);
assert.equal(routedFrames.at(-1).verifiedView.panoId,'street-front',
  'a walking route ending at the confirmed roadside photo uses it as the terminal scene');
assert.ok(Math.abs(routedFrames.at(-1).meters-100)<1);
assert.equal(sandbox.walkPreviewArrivalEndpoint(routedFrames.at(-1),{end:routedFront},route),true);
const nearFront=sandbox.walkPreviewSceneFrames(routedFrames).find(frame=>
  !frame.landmark && frame.meters>=frame.total-35 && frame.meters<frame.total-5);
assert.ok(nearFront,'the approach has a route point before the outside hotel photograph');
assert.equal(sandbox.walkPreviewLodgingArrivalPhoto(nearFront,'street-front',point(96),
  {end:routedFront},route),true);
assert.equal(sandbox.walkPreviewLodgingArrivalPhoto(nearFront,'unrelated',point(96),
  {end:routedFront},route),false,'another street image cannot imply hotel arrival');

function reset(finalPhoto='exact'){
  jobs.clear();now=0;instances=[];
  fixtures=frames.map((frame,index)=>({id:'frame-'+index,
    point:index!==frames.length-1?frame.position
      :finalPhoto==='missing'?point(300):finalPhoto==='early'?point(60):frame.position}));
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1,start:{name:'동대문'},end:place},
    {paths:route,maneuvers:[]});
  return sandbox.walkPreviewState;
}
for(const finalPhoto of ['exact','missing','early']){
  const preview=reset(finalPhoto);
  until(()=>preview.arrivalComplete && !preview.loading);
  assert.equal(preview.close.hidden,false,'map-view button stays hidden after arrival');
  assert.equal(preview.next.disabled,true,'next cannot pass the destination');
  assert.equal(preview.message.textContent,'','extra alerts are cleared');
  assert.equal(preview.message.style.display,'none');
  assert.equal(preview.instruction.textContent,'테스트 호텔에 도착했어요.');
  assert.equal(preview.progress.textContent,'목적지 도착 완료');
  assert.equal(Number(preview.seek.value),Number(preview.seek.max),'progress ends at the route endpoint');
  assert.equal(preview.visual.classList.contains('walk-preview-map-fallback'),false,
    'a missing or earlier final photo uses the map at the verified endpoint');
  const index=preview.index, instruction=preview.instruction.textContent;
  preview.next.onclick();
  instances.at(-1).emit('init');
  while(tick()){}
  assert.equal(preview.index,index,'stale callbacks cannot advance after arrival');
  assert.equal(preview.close.hidden,false);
  assert.equal(preview.message.textContent,'');
  assert.equal(preview.instruction.textContent,instruction);
  preview.play.onclick();
  assert.equal(preview.arrivalComplete,false,'replay is an intentional exit from the terminal state');
  assert.equal(preview.close.hidden,false);
  const mapElement=preview.mapElement;
  preview.close.onclick();
  assert.equal(sandbox.walkPreviewState,null,'Map view is shown only after the explicit button');
  assert.equal(preview.visual.classList.contains('walk-preview-open'),false);
  assert.equal(mapElement.style.visibility,'');
  assert.equal(mapElement.inert,false);
  sandbox.stopWalkPreview(true);
  while(tick()){}
}

for(const frontPhoto of ['matching','changed']){
  jobs.clear();now=0;instances=[];
  const previewFrames=sandbox.walkPreviewSceneFrames(lodgingFrames);
  fixtures=previewFrames.map((frame,index)=>({id:frame.lodgingFront
    ? frontPhoto==='matching'?'hotel-front':'different-photo' : 'lodging-'+index,
    point:frame.lodgingFront?point(60):frame.position}));
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1,
    start:{name:'동대문',resolvedName:'흥인지문'},end:lodging},
    {paths:route,maneuvers:[]});
  const preview=sandbox.walkPreviewState;
  until(()=>preview.arrivalComplete && !preview.loading);
  assert.equal(preview.index,preview.frames.length-1,'lodging preview stops at the street-side front');
  assert.ok(Math.abs(preview.frames.at(-1).meters-60)<1);
  assert.equal(preview.close.hidden,false);
  assert.equal(preview.next.disabled,true);
  assert.equal(preview.message.textContent,'');
  assert.equal(preview.instruction.textContent,'테스트 호텔에 도착했어요.');
  assert.equal(preview.progress.textContent,'목적지 도착 완료');
  assert.equal(Number(preview.seek.value),Number(preview.seek.max));
  assert.equal(document.querySelector('#walk-preview-origin').textContent,'동대문(흥인지문)앞',
    'origin label shows only the place, without duplicate source prefix');
  assert.equal(preview.visual.classList.contains('walk-preview-map-fallback'),false);
  const index=preview.index;
  while(tick()){}
  assert.equal(preview.index,index,'late playback cannot restart after the hotel front');
  sandbox.stopWalkPreview(true);
}
for (const finalPhoto of ['street-front','changed']) {
  jobs.clear();now=0;instances=[];
  const routeScenes=sandbox.walkPreviewSceneFrames(routedFrames);
  fixtures=routeScenes.map((frame,index)=>({id:index===routeScenes.length-1?finalPhoto:'road-'+index,
    point:index===routeScenes.length-1?point(96):frame.position}));
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1,
    start:{name:'현재 위치 · 종로구 종로 266',originKind:'gps'},end:routedFront},
    {paths:route,maneuvers:[]});
  const preview=sandbox.walkPreviewState;
  until(()=>preview.arrivalComplete && !preview.loading);
  assert.ok(Math.abs(preview.frames.at(-1).meters-100)<1);
  assert.equal(preview.close.hidden,false);
  assert.equal(preview.message.textContent,'');
  assert.equal(preview.instruction.textContent,'테스트 호텔에 도착했어요.');
  assert.equal(Number(preview.seek.value),Number(preview.seek.max));
  assert.equal(preview.visual.classList.contains('walk-preview-map-fallback'),false);
  const lastIndex=preview.index;
  instances.at(-1).emit('init');
  while(tick()){}
  assert.equal(preview.index,lastIndex,'late callbacks cannot resume after confirmed frontage');
  assert.equal(preview.close.hidden,false,'map-view button does not return');
  assert.equal(preview.message.textContent,'','extra guidance does not return');
  sandbox.stopWalkPreview(true);
}
// The confirmed outside photograph may be served before TMAP's last coordinate.
// It must become the terminal scene, with no later blank image or map-button flash.
{
  jobs.clear();now=0;instances=[];
  const scenes=sandbox.walkPreviewSceneFrames(routedFrames);
  const earlyIndex=scenes.findIndex(frame=>frame.meters===nearFront.meters);
  fixtures=scenes.map((frame,index)=>({id:index===earlyIndex?'street-front':'approach-'+index,
    point:index===earlyIndex?point(96):frame.position}));
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1,
    start:{name:'동대문'},end:routedFront},{paths:route,maneuvers:[]});
  const preview=sandbox.walkPreviewState;
  until(()=>preview.arrivalComplete && !preview.loading);
  assert.equal(preview.index,preview.frames.length-1);
  assert.equal(preview.close.hidden,false);
  assert.equal(preview.message.textContent,'');
  assert.equal(preview.instruction.textContent,'테스트 호텔에 도착했어요.');
  assert.equal(preview.visual.classList.contains('walk-preview-map-fallback'),false);
  assert.equal(Number(preview.seek.value),Number(preview.seek.max));
  assert.ok(instances.length<=earlyIndex+1,'no later panorama is requested after the lodging front');
  while(tick()){}
  assert.equal(preview.arrivalComplete,true,'late timers cannot restart a completed hotel route');
  sandbox.stopWalkPreview(true);
}
// If a nearby approach image is unavailable, preserve the outgoing photograph
// while autoplay moves to the verified front; even an important cue is not a
// reason to expose an empty map slide 20 m before arrival.
{
  jobs.clear();now=0;instances=[];
  const scenes=sandbox.walkPreviewSceneFrames(routedFrames);
  const missingIndex=scenes.findIndex(frame=>frame.meters===nearFront.meters);
  fixtures=scenes.map((frame,index)=>({id:index===scenes.length-1?'street-front':'approach-'+index,
    point:index===missingIndex?point(300):frame.position}));
  sandbox.startWalkPreview({maps,map:{},english:false,requestId:1,
    start:{name:'동대문'},end:routedFront},{paths:route,maneuvers:[]});
  const preview=sandbox.walkPreviewState;
  preview.frames[missingIndex].important=true;
  let blankFallback=false;
  for(let i=0;i<2000 && !preview.arrivalComplete;i++) {
    if(!tick()) break;
    if(preview.visual.classList.contains('walk-preview-map-fallback')) blankFallback=true;
  }
  assert.equal(preview.arrivalComplete,true,'autoplay still reaches the outside lodging photo');
  assert.equal(blankFallback,false,'missing near-arrival imagery never reveals a blank map slide');
  assert.equal(preview.close.hidden,false);
  assert.equal(preview.message.textContent,'');
  sandbox.stopWalkPreview(true);
}
jobs.clear();now=0;
sandbox.ensureLodgingArrivalView=async()=>{};
let reroutes=0;
sandbox.routeToLodgingFront=async()=>{reroutes+=1;return null;};
(async()=>{
  const start={walkingRoute:{paths:route,maneuvers:[],totalDistance:100,totalTime:600}};
  const selected={...lodging};
  await sandbox.prepareLodgingArrival(maps,start,selected,()=>true);
  assert.equal(reroutes,0,'a route already passing the hotel frontage is not recalculated');
  assert.equal(selected.arrivalAtFront,true);
  assert.ok(Math.abs(start.walkingRoute.totalDistance-60)<1);
  assert.ok(Math.abs(sandbox.walkPreviewDistance(start.walkingRoute.paths.at(-1).at(-1),point(60)))<1);
  const distantPhotoLodging={...place,category:'숙박>호텔',
    arrivalView:{panoId:'side-street',position:[point(100)[0],37.0007]}};
  const originalRoute={paths:route,maneuvers:[],totalDistance:100,totalTime:600};
  const originalStart={walkingRoute:originalRoute};
  await sandbox.prepareLodgingArrival(maps,originalStart,distantPhotoLodging,()=>true);
  assert.equal(originalStart.walkingRoute,originalRoute,
    'nearby lodging arrival keeps the original walking route when the photo is on another road');
  assert.equal(distantPhotoLodging.arrivalAtFront,true);
  assert.equal(reroutes,0,'a distant panorama cannot force a detour past a valid route endpoint');
  assert.equal(sandbox.walkPreviewArrivalEndpoint(frames.at(-1),
    {end:distantPhotoLodging},route),true,'the original endpoint remains a terminal arrival');
  sandbox.ensureLodgingArrivalView=realEnsureLodgingArrivalView;
  const endpointLodging={...place,category:'숙박>호텔',arrivalView:{panoId:'old-photo',position:point(20)}};
  fixtures=[{id:'route-end-photo',point:point(98)}];
  const reselection=sandbox.ensureLodgingArrivalView(maps,endpointLodging,point(100));
  tick();
  await reselection;
  assert.equal(endpointLodging.arrivalView.panoId,'route-end-photo',
    'a prior hotel photo away from the walking endpoint is replaced with a roadside panorama');
  const endpointStart={walkingRoute:{paths:route,maneuvers:[],totalDistance:100,totalTime:600}};
  await sandbox.prepareLodgingArrival(maps,endpointStart,endpointLodging,()=>true);
  assert.equal(endpointLodging.arrivalAtFront,true);
  assert.equal(endpointStart.walkingRoute.totalDistance,100,
    'the verified route endpoint needs no detour to an older panorama');
  assert.equal(reroutes,0);
  jobs.clear();now=0;instances=[];
  fixtures=[{id:'slow-hotel-photo',point:point(98),hang:true}];
  const slowLodging={...place,category:'숙박>호텔'};
  const lookupStart=now;
  const slowLookup=sandbox.ensureLodgingArrivalView(maps,slowLodging,point(100));
  while(tick()) await Promise.resolve();
  assert.equal(now-lookupStart,2500,'an unavailable hotel panorama no longer holds route preparation for eight seconds');
  assert.equal(await slowLookup,null,'a timed-out hotel panorama cleanly falls back without a stale arrival photo');
  console.log('PASS: verified lodging-front stop, origin context, reused walking route, early exterior arrival, missing-image skip, synchronized progress, no post-arrival regression');
})().catch(error=>{console.error(error);process.exitCode=1;});
