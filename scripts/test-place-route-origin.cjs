const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
new Function(source.replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/walking-preview\.mjs['"];?\s*/m, ''));
const busStopSnippet = source.slice(source.indexOf('function explicitBusStopLandmark'),
  source.indexOf('async function pedestrianCandidates'));
assert.ok(busStopSnippet.startsWith('function explicitBusStopLandmark'));
const busStopContext = vm.createContext({});
vm.runInContext(busStopSnippet,busStopContext);
assert.equal(busStopContext.explicitBusStopLandmark('동대문'),null,
  'a generic place origin must not become a made-up bus platform');
assert.equal(busStopContext.explicitBusStopLandmark('동대문역 9번 출구'),null);
assert.equal(busStopContext.explicitBusStopLandmark('서울역 버스 승강장').label,'서울역 버스 승강장');
assert.equal(busStopContext.explicitBusStopLandmark('서울역 버스 승강장').kind,'bus-stop');
const snippet = source.slice(source.indexOf('async function choosePedestrianStartForPlace'),
  source.indexOf('function routeErrorMessage'));
assert.ok(snippet.startsWith('async function choosePedestrianStartForPlace'));
const place={name:'테스트 호텔',longitude:127.002,latitude:37};
const exits=[
  {name:'테스트역1번출구',longitude:127,latitude:37,
    landmark:{kind:'station-exit',label:'테스트역 1번 출구',position:[127,37]}},
  {name:'테스트역2번출구',longitude:127.001,latitude:37,
    landmark:{kind:'station-exit',label:'테스트역 2번 출구',position:[127.001,37]}}
];
const requests=[];
const sandbox={pedestrianCandidates:async()=>exits,walkPreviewFrames:()=>[{}],walkPreviewDistance:()=>1,
  fetch:async(url,options)=>{
    assert.equal(url,'/api/walking/routes');
    const request=JSON.parse(options.body);
    requests.push(request);
    return {ok:true,json:async()=>({totalTime:60,
      totalDistance:request.startX===127?80:300,
      paths:[[[request.startX,37],[request.endX,request.endY]]],maneuvers:[]})};
  }};
vm.createContext(sandbox);
vm.runInContext(snippet,sandbox);
(async()=>{
  const selected=await sandbox.choosePedestrianStartForPlace('테스트역',place,()=>true,{});
  assert.equal(selected.landmark.label,'테스트역 1번 출구');
  assert.equal(selected.walkingRoute.totalDistance,80);
  assert.equal(selected.walkingComparison.checked,2);
  assert.equal(requests.length,2,'compare every station exit by its actual walking distance');
  assert.ok(requests.every(request=>request.endX===place.longitude && request.endY===place.latitude),
    'route to the selected Naver result rather than geocoding its name again');
  requests.length=0;
  assert.equal(await sandbox.choosePedestrianStartForPlace('테스트역',place,()=>false,{}),null);
  assert.equal(requests.length,0,'cancelled searches do not start route requests');
  console.log('PASS: selected place keeps exact destination and compares verified station exits');
})().catch(error=>{console.error(error);process.exitCode=1;});
