// Run: node scripts/test-walk-preview.mjs
// Offline tests only: no provider API calls or credentials.
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../api/walking/routes.js', import.meta.url), 'utf8');
new Function(main);
new Function(api);
const pure = main.slice(main.indexOf('function walkPreviewDistance'), main.indexOf('function stopWalkPreview'));
const preview = main.slice(main.indexOf('function walkPreviewDistance'), main.indexOf('function selectGuideTransport'));
const geometryTests = String.raw`
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const A=[127,37],N=[127,37.001],E=[127.001,37.001],S=[127.001,37];
const route=[ [A,N,E,S] ];
const frames=walkPreviewFrames(route);
const key=frames.filter(f=>f.phase==='turn');
assert(key.length===2,'Two right-angle bends retained');
assert(key.every(f=>f.direction==='right'),'Right turns');
assert(frames.filter(f=>f.phase==='approach').length===2,'Before each turn');
assert(frames.filter(f=>f.phase==='depart').length===2,'After each turn');
assert(frames.every((f,i)=>!i||f.meters>=frames[i-1].meters),'Ordered frames');
assert(frames[0].phase==='start'&&frames.at(-1).phase==='arrival','Endpoints');
assert(frames.every(f=>Number.isFinite(walkPreviewBearing(f.position,f.ahead))),'Finite headings');
assert(Math.abs(walkPreviewBearing(frames.at(-1).position,frames.at(-1).ahead)-180)<1,'Arrival faces forward');
assert(key.every(f=>f.holdMs===6000),'Turns linger six seconds');
const left=walkPreviewFrames([[A,[127.001,37],E]]).find(f=>f.phase==='turn');
assert(left.direction==='left','Left turn');
const straight=walkPreviewFrames([[A,N]]);
assert(!straight.some(f=>f.important),'Straight route does not invent intersections');
const crossing=walkPreviewFrames([[A,N]],[{position:[127,37.0005],description:'사거리에서 횡단보도를 건너 직진'}]);
assert(crossing.filter(f=>f.important).length===3,'Provider crossing on straight path retained');
assert(crossing.find(f=>f.phase==='turn').direction==='straight','Crossing does not invent a turn');
const off=walkPreviewFrames([[A,N]],[{position:[127.01,37.0005],description:'우회전'}]);
assert(!off.some(f=>f.important),'Off-route instruction ignored');
const clean=walkPreviewFrames([[A,A,N],[N,E]]);
assert(clean.some(f=>f.direction==='right'),'Duplicate endpoints removed');
assert(walkPreviewFrames([[A,N],[[127.01,37.01],E]]).length===0,'Disconnected paths not joined');
assert(walkPreviewFrames([[A,null,N]]).length===0,'Invalid points rejected');
assert(walkPreviewFrames([]).length===0&&walkPreviewFrames([[A,A]]).length===0,'Empty and zero length');
const narrow=walkPreviewFrames([[A,N,[127.00012,37.001],[127.00012,37.002]]]);
assert(narrow.filter(f=>f.phase==='turn').length===2,'Close opposing turns retained');
const supplied=walkPreviewFrames(route,[{position:N,description:'우회전 후 골목길로 이동'}]);
assert(supplied.filter(f=>f.phase==='turn').length===2,'Geometry/provider deduplicated');
assert(walkPreviewCue(supplied.find(f=>f.phase==='turn'),false).includes('골목길'),'Provider detail included');
assert(!/[가-힣]/.test(walkPreviewCue(supplied.find(f=>f.phase==='turn'),true)),'English cue remains English');
const many=[A];for(let i=1;i<=40;i++){const p=many.at(-1);many.push(i%2?[p[0],p[1]+.0003]:[p[0]+.0003,p[1]])}
assert(walkPreviewFrames([many]).filter(f=>f.phase==='turn').length===39,'Long route keeps late turns');
return {tests:20,exampleFrames:frames.length,turns:key.length};
`;
const harness = String.raw`
const assert=(v,msg)=>{if(!v)throw Error(msg);};
function element() {
  return { hidden:true,isConnected:true,style:{},attrs:{},events:{},children:{},
    classList:{values:new Set(),add(n){this.values.add(n)},remove(n){this.values.delete(n)},contains(n){return this.values.has(n)}},
    querySelector(q){return this.children[q]},closest(){return visual},
    setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},
    replaceChildren(){this.cleared=true},focus(){this.focused=true},
    addEventListener(k,f){this.events[k]=f},removeEventListener(k,f){if(this.events[k]===f)delete this.events[k]},
    scrollIntoView(){this.scrolled=true}
  };
}
const panel=element(),scene=element(),viewer=element(),visual=element(),mapElement=element(),walkButton=element();
const close=element(),arrow=element(),prev=element(),next=element(),play=element(),message=element(),progress=element(),bar=element();
visual.children={'.naver-map':mapElement,'.walk-action':walkButton};
panel.children={'#walk-preview-prev':prev,'#walk-preview-next':next,'#walk-preview-play':play,'#walk-preview-message':message,'#walk-preview-progress-text':progress,'#walk-preview-progress-bar':bar};
scene.children={'#walk-preview-close':close,'#walk-preview-arrow':arrow};
const nodes={'#walk-preview':panel,'#walk-preview-panorama':viewer,'#walk-preview-scene':scene};
const document={querySelector:q=>nodes[q]};
const timers=new Map();let timerId=0;
const setTimeout=(f,delay)=>{f.delay=delay;timers.set(++timerId,f);return timerId},clearTimeout=id=>timers.delete(id);
let walkPreviewState=null,currentPage='guide',routeRequestToken=1;
class LatLng{constructor(lat,lng){this.latitude=lat;this.longitude=lng}lat(){return this.latitude}lng(){return this.longitude}}
class Panorama{
  constructor(v,options){this.options=options;this.position=options.position;this.visible=true;this.events={};}
  setVisible(v){this.visible=v}setPosition(p){this.position=p}
  getLocation(){return {coord:this.position,photodate:'2026-02'}}
  getProjection(){return {fromCoordToPov:()=>({pan:15})}}setPov(pov){this.pov=pov}
}
const maps={LatLng,Panorama,Event:{addListener:(p,e,f)=>{p.events[e]=f}}};
const context={maps,map:{setCenter(){throw Error('Hidden map must not be moved')}},english:false,requestId:1};
const choice={paths:[[[127.097,37.587],[127.1,37.587],[127.101,37.586]]]};
`;
const lifecycleTests = String.raw`assert(scene.hidden && panel.hidden,'Initial map mode');
startWalkPreview(context,choice);
assert(!scene.hidden&&!panel.hidden&&visual.classList.contains('walk-preview-open'),'Overlay opens in map slot');
assert(mapElement.inert&&mapElement.attrs['aria-hidden']==='true','Background map is inaccessible');
assert(walkButton.attrs['aria-expanded']==='true','Expanded state');
const first=walkPreviewState;
first.panorama.events.pano_status('OK');
assert(viewer.style.visibility==='visible','Panorama display');
assert(first.panorama.options.aroundControl===false,'Unwanted street/aerial switch hidden');
assert(first.panorama.options.zoomControl===true,'Zoom controls retained');
assert(first.panorama.options.logoControl!==false,'Naver attribution retained');
next.onclick();assert(walkPreviewState.index===1,'Next advances exactly once');
walkPreviewState.panorama.events.pano_status('OK');prev.onclick();assert(walkPreviewState.index===0,'Previous goes back');
close.onclick();
assert(scene.hidden&&panel.hidden&&!mapElement.inert&&!visual.classList.contains('walk-preview-open'),'Map restored');
assert(!walkPreviewState&&timers.size===0&&!prev.onclick&&!visual.events.keydown&&!panel.events.keydown,'Timers and handlers released');
const oldMessage=message.textContent;first.panorama.events.pano_status('OK');assert(message.textContent===oldMessage,'Stale panorama ignored');
startWalkPreview(context,choice);startWalkPreview(context,choice);
walkPreviewState.panorama.events.pano_status('OK');next.onclick();assert(walkPreviewState.index===1,'Repeated open does not duplicate handlers');
panel.events.keydown({key:'Escape',preventDefault(){}});
assert(scene.hidden&&walkButton.focused,'Escape closes and restores focus');
startWalkPreview(context,choice);walkPreviewState.panorama.events.pano_status('ZERO_RESULTS');
assert(viewer.style.visibility==='hidden'&&message.textContent.includes('거리뷰가 없어요'),'Unavailable imagery handled');
stopWalkPreview(true);stopWalkPreview(true);
startWalkPreview(context,{paths:[]});
assert(scene.hidden&&!walkPreviewState&&message.textContent.includes('경로가 이어지지'),'Empty path remains map-only with explanation');

startWalkPreview(context,choice);
let live=walkPreviewState;
assert(next.disabled&&prev.disabled,'Navigation locked while loading');
live.panorama.events.pano_status('OK');
assert(live.panorama.pov.fov===75,'Slightly enlarged view applied');
const hold=timers.get(live.timer);
assert(hold.delay===3000,'Straight hold time');
play.onclick();assert(!live.playing&&timers.size===0,'Pause clears playback');
next.onclick();
play.onclick(); // resume while loading
play.onclick(); // pause while loading
assert(live.loading&&timers.has(live.timer),'Pause retains load deadline');
const expired=live.panorama, deadline=timers.get(live.timer);
timers.delete(live.timer);deadline();
assert(!live.loading&&live.panorama===null,'Timeout releases failed viewer');
const stale=message.textContent;expired.events.pano_status('OK');
assert(message.textContent===stale,'Late timeout result ignored');
stopWalkPreview(true);
const bendChoice={paths:[[[127,37],[127,37.001],[127.001,37.001]]]};
startWalkPreview(context,bendChoice);live=walkPreviewState;
live.panorama.events.pano_status('OK');
next.onclick();
assert(live.frames[live.index].important,'Approaching important decision');
live.panorama.events.pano_status('OK');
assert(message.textContent.includes('진입 전'),'Approach cue visible');
assert(timers.size===0,'Manual next stays paused');
play.onclick();assert(timers.get(live.timer).delay===4500,'Approach uses longer dwell');
next.onclick();live.panorama.events.pano_status('ZERO_RESULTS');
assert(!live.playing&&viewer.style.visibility==='hidden'&&timers.size===0,'Missing junction image pauses rather than skipping');
assert(message.textContent.includes('거리뷰가 없어요'),'Missing image explained');
stopWalkPreview(true);
startWalkPreview(context,bendChoice);live=walkPreviewState;
live.panorama.events.pano_status('OK');next.onclick();
live.panorama.getLocation=()=>({coord:new LatLng(37.0015,127.0015)});
live.panorama.events.pano_status('OK');
assert(!live.playing&&viewer.style.visibility==='hidden','Far/off-route photo hidden at junction');
stopWalkPreview(true);
return 'PASS: lifecycle, 75-degree view, loading lock, pause/load timeout, late callback isolation, longer turn dwell, missing/remote decision imagery';
`;
console.log(new Function(pure + geometryTests)());
console.log(new Function(harness + preview + lifecycleTests)());
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const apiTests = String.raw`
let calls=0, captured=null;
const response={features:[
 {geometry:{type:'Point',coordinates:[127,37]},properties:{totalTime:600,totalDistance:741,turnType:200,description:'출발'}},
 {geometry:{type:'LineString',coordinates:[[127,37],[127,37.001],[127.001,37.001]]}},
 {geometry:{type:'Point',coordinates:[127,37.001]},properties:{turnType:13,description:'우회전 후 골목길로 이동'}},
 {geometry:{type:'Point',coordinates:['bad',37]},properties:{description:'잘못된 좌표'}},
 {geometry:{type:'Point',coordinates:[127.001,37.001]},properties:{turnType:201,description:'도착'}}
]};
const mockFetch=async(url,options)=>{calls++;captured={url,options};return {ok:true,status:200,json:async()=>response};};
const mod={exports:null};
new Function('module','process','fetch',api)(mod,{env:{TMAP_CAR_API_KEY:'test-only'}},mockFetch);
const res={setHeader(){},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}};
await mod.exports({method:'POST',body:{startX:127,startY:37,endX:127.001,endY:37.001}},res);
if(res.statusCode!==200||calls!==1||res.data.maneuvers.length!==3)throw Error('Single upstream request and valid maneuver extraction');
if(res.data.maneuvers[1].description!=='우회전 후 골목길로 이동'||res.data.paths.length!==1)throw Error('Instructions/geometry preserved');
if(JSON.parse(captured.options.body).searchOption!=='10')throw Error('Route selection unchanged');
await mod.exports({method:'GET'},res);if(res.statusCode!==405||calls!==1)throw Error('Method validation');
await mod.exports({method:'POST',body:{}},res);if(res.statusCode!==400||calls!==1)throw Error('Coordinate validation');
return 'PASS: routing response carries maneuver points without extra upstream calls; validation unchanged';
`;
console.log(await new AsyncFunction('api', apiTests)(api));
