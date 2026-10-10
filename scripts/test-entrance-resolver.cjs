const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../api/places/entrance.js','utf8');
const poi=(name,lon=127.073,lat=37.548)=>({name,noorLon:String(lon),noorLat:String(lat),frontLon:'127.9',frontLat:'37.9'});
async function run(q,fixtures,status=200) {
  const calls=[]; const sandbox={module:{exports:{}},URL,URLSearchParams,AbortSignal,process:{env:{TMAP_CAR_API_KEY:'test-only'}},fetch:async(url,options)=>{
    calls.push(String(url)); assert.equal(options.headers.appKey,'test-only');
    return {ok:status===200,status,json:async()=>({searchPoiInfo:{pois:{poi:fixtures}}})};
  }};
  vm.runInNewContext(source,sandbox);
  const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
  await sandbox.module.exports({method:'GET',query:{q}},res);
  return {...res,calls};
}
(async()=>{
  let result=await run('어린이대공원역 1번 출구',[poi('어린이대공원역'),poi('어린이대공원역11번출구'),poi('어린이대공원역7호선1번출구')]);
  assert.equal(result.statusCode,200); assert.equal(result.data.longitude,127.073,'named exit uses physical POI, not vehicle front point');
  assert.match(result.data.name,/1번출구$/);
  result=await run('어린이대공원역 1번 출구',[poi('어린이대공원역11번출구')]);assert.equal(result.statusCode,404);
  result=await run('어린이대공원역',[poi('어린이대공원역1번출구'),poi('어린이대공원역2번출구',127.074),poi('건대입구역1번출구')]);
  assert.equal(result.data.candidates.length,2);assert.equal(result.calls.length,1);
  result=await run('어린이대공원',[poi('서울어린이대공원정문'),poi('어린이대공원후문',127.077),poi('어린이대공원동물원입구')]);
  assert.equal(result.data.candidates.length,2,'deduplicate queries and exclude internal attractions');assert.equal(result.calls.length,3);
  result=await run('어린이대공원 정문',[poi('어린이대공원후문')]);assert.equal(result.statusCode,404);
  result=await run('어린이대공원 정문',[poi('어린이대공원정문'),poi('어린이대공원정문',129,35)]);assert.equal(result.statusCode,409);
  result=await run('x',[]);assert.equal(result.statusCode,400);assert.equal(result.calls.length,0);
  result=await run('아차산',[poi('아차산'),poi('아차산정상'),poi('아차산등산로입구',127.099,37.556),
    poi('아차산등산로입구',127.103,37.554),poi('아차산등산로입구',129,35),
    poi('아차산주차장입구'),poi('용마산등산로입구')]);
  assert.equal(result.statusCode,200);
  assert.equal(result.data.candidates.length,2,'distinct named trail entrances retained; summit and car park excluded');
  assert.equal(result.calls.length,2);
  result=await run('아차산',[poi('아차산')]);assert.equal(result.statusCode,404,'no fallback to a mountain centroid');
  result=await run('아차산 정상',[]);assert.equal(result.statusCode,400,'explicit summit is not an entrance alias');
  result=await run('부산',[]);assert.equal(result.statusCode,400,'do not treat arbitrary 산 suffix as a mountain');
  result=await run('어린이대공원역1번출구',[],403);assert.notEqual(result.statusCode,200);assert.ok(!JSON.stringify(result.data).includes('test-only'));
  console.log('PASS: exact exit/gate, POI landmark coordinates, automatic candidates, duplicates, ambiguity, upstream failure, validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
