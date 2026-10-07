const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/shared/utils/wagonQueueState.ts'), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const result = {};
vm.runInNewContext(output, { exports: result });
const {isReadyForWaybill, needsGrossReview, needsSealWork, registeredVisitKeys} = result;
const unit = {status:'Sealed',tareWeight:'37.2',grossWeight:'68.88',sealNumber:'4947127-25',sealConfirmedByScaleAt:'2026-09-14',sealConfirmedBySecurityAt:'2026-09-14'};
assert(isReadyForWaybill(unit)); assert(!needsGrossReview(unit)); assert(!needsSealWork(unit));
assert(!isReadyForWaybill({...unit, grossWeight:''}));
assert(!isReadyForWaybill({...unit, grossWeight:'—'}));
// 1C supplies weights and seal; extra manual scale/security seal approvals are not required.
assert(isReadyForWaybill({...unit, sealConfirmedByScaleAt:null, sealConfirmedBySecurityAt:null}));
assert(!isReadyForWaybill({...unit, tareWeight:'0'}));
assert(!isReadyForWaybill({...unit, grossWeight:'30'}));
const restart={...unit,status:'ToRailwayScale'};
assert(needsGrossReview(restart)); assert(!isReadyForWaybill(restart)); assert(!needsSealWork(restart));
const empty={...unit,status:'GrossWeighed',grossWeight:''};
assert(needsGrossReview(empty)); assert(!needsSealWork(empty));
const seal={...unit,status:'SealPending',sealNumber:'',sealConfirmedBySecurityAt:null};
assert(needsSealWork(seal)); assert(!needsGrossReview(seal)); assert(!isReadyForWaybill(seal));
const used=registeredVisitKeys([{emptyWagonArrivalId:'primary',wagonRoutes:[{sourceArrivalId:'old',wagonNumber:'50881820'}]}],[]);
assert(used.has('old:50881820'));assert(!used.has('new:50881820'));assert(!used.has('primary:50881820'));
console.log('PASS: valid evidence, missing values, separate queues, explicit recheck, repeat visits and source arrival matching');
if(process.argv[2]){
 const snapshot=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const regs=snapshot.LoadingRegistries.map(r=>({emptyWagonArrivalId:r.EmptyWagonArrivalId,wagonRoutes:JSON.parse(r.WagonRoutesJson).map(w=>({sourceArrivalId:w.SourceArrivalId,wagonNumber:w.WagonNumber}))}));
 const keys=registeredVisitKeys(regs,[]);const counts={remaining:0,ready:0,gross:0,seal:0,waybill:0,other:0};
 for(const u of snapshot.EmptyWagonUnits){if(keys.has(`${u.EmptyWagonArrivalId}:${u.WagonNumber}`)||u.ScaleExitedAt)continue;counts.remaining++;
 const v={status:u.Status,tareWeight:u.TareWeight,grossWeight:u.GrossWeight,sealNumber:u.SealNumber,sealConfirmedByScaleAt:u.SealConfirmedByScaleAt,sealConfirmedBySecurityAt:u.SealConfirmedBySecurityAt};
 if(isReadyForWaybill(v))counts.waybill++;else if(needsGrossReview(v))counts.gross++;else if(needsSealWork(v))counts.seal++;else if(v.status==='Estakada')counts.ready++;else counts.other++;
 } console.log(counts);
}
