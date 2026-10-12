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
const document={querySelector:selector=>nodes[selector] ||= new Element(),
  createElement:()=>new Element()};
class LatLng { constructor(lat,lng){this.latitude=lat;this.longitude=lng;}
  lat(){return this.latitude;} lng(){return this.longitude;} }
class Panorama {
  constructor(element,options){
    this.element=element;this.options=options;this.listeners={};
    this.fixture=fixtures.shift() || {id:'photo-'+instances.length,
      point:[options.position.lng(),options.position.lat()]};
    instances.push(this);
    timer(()=>this.emit('init'),50);
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
  currentPage:'guide',routeRequestToken:1,walkPreviewState:null,console};
vm.createContext(sandbox);
vm.runInContext(previewSource,sandbox);

const frames=sandbox.walkPreviewFrames(route,[]);
const place={name:'테스트 호텔',longitude:point(100)[0],latitude:37};
assert.equal(sandbox.walkPreviewArrivalEndpoint(frames.at(-1),{end:place},route),true);
assert.equal(sandbox.walkPreviewArrivalEndpoint(frames.find(frame=>frame.meters>=60),{end:place},route),false,
  'a photograph before the final route point is not arrival');
const landmarkStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{name:'동대문',resolvedName:'흥인지문'}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(landmarkStart),/동대문 \(흥인지문\)에서 출발해요/);
assert.doesNotMatch(sandbox.walkPreviewStepInstruction(landmarkStart),/번 출구/);
const stationStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{landmark:{kind:'station-exit',label:'동대문역 9번 출구',position:point(0)}}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(stationStart),/동대문역 9번 출구에서 출발해요/);
const busStart=sandbox.walkPreviewEndpointFrames(frames,{
  start:{landmark:{kind:'bus-stop',label:'동대문 버스 승강장',position:point(0)}}},route)[0];
assert.match(sandbox.walkPreviewStepInstruction(busStart),/동대문 버스 승강장에서 출발해요/);

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
  assert.equal(preview.close.hidden,true,'map-view button stays hidden after arrival');
  assert.equal(preview.next.disabled,true,'next cannot pass the destination');
  assert.equal(preview.message.textContent,'','extra alerts are cleared');
  assert.equal(preview.message.style.display,'none');
  assert.equal(preview.instruction.textContent,'테스트 호텔에 도착했어요.');
  assert.equal(preview.progress.textContent,'목적지 도착 완료');
  assert.equal(Number(preview.seek.value),Number(preview.seek.max),'progress ends at the route endpoint');
  assert.equal(preview.visual.classList.contains('walk-preview-map-fallback'),finalPhoto!=='exact',
    'a missing or earlier final photo uses the map at the verified endpoint');
  const index=preview.index, instruction=preview.instruction.textContent;
  preview.next.onclick();
  instances.at(-1).emit('init');
  while(tick()){}
  assert.equal(preview.index,index,'stale callbacks cannot advance after arrival');
  assert.equal(preview.close.hidden,true);
  assert.equal(preview.message.textContent,'');
  assert.equal(preview.instruction.textContent,instruction);
  preview.play.onclick();
  assert.equal(preview.arrivalComplete,false,'replay is an intentional exit from the terminal state');
  assert.equal(preview.close.hidden,false);
  sandbox.stopWalkPreview(true);
  while(tick()){}
}
console.log('PASS: exact-origin start cues, final-photo and no-photo arrival, synchronized progress, no post-arrival regression');
