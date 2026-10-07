const assert=require('node:assert/strict'), esbuild=require('esbuild'), vm=require('node:vm'), path=require('node:path');
function load(file) {
 const b=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src',file)],bundle:true,platform:'node',format:'cjs',write:false});
 const m={exports:{}}; vm.runInNewContext(b.outputFiles[0].text,{module:m,exports:m.exports,require,process}); return m.exports;
}
const {buildWagonWorkCards}=load('shared/utils/wagonWorkState.ts');
const {computeTransportFlowMetrics,buildReadyToExitFlowRows}=load('modules/dashboard/utils/transportHub.ts');
const u=(n,status,extra={})=>({id:n,wagonNumber:n,status,tareWeight:'',grossWeight:'',...extra});
const sealed={tareWeight:'20',grossWeight:'70',sealNumber:'s',sealConfirmedByScaleAt:'2026-09-10',sealConfirmedBySecurityAt:'2026-09-10'};
const a=(id,wagons,extra={})=>({id,arrivalNumber:'IB-'+id,stage:'SealInstallation',createdAt:'2026-09-10',wagons,...extra});
const arrivals=[
 a('old',[u('111','Sealed',sealed),u('222','Sealed',sealed)]),
 a('new',[u('111','Estakada'),u('333','Loading'),u('444','Loaded'),u('555','Sealed',sealed),u('666','Sealed'),u('777','Returned',{defectActNumber:'A'}),u('888','Loaded',{scaleExitedAt:'2026-09-11'})]),
 a('cancelled',[u('999','Estakada')],{stage:'Cancelled'}),
 a('1c',[u('000','Sealed',sealed)],{arrivalNumber:'1C-001'}),
];
const regs=[
 {emptyWagonArrivalId:'old',registryNumber:'WB-old',exitedToKengsoyAt:'2026-09-09',wagonRoutes:[{sourceArrivalId:'old',wagonNumber:'111'},{sourceArrivalId:'old',wagonNumber:'222'}]},
 {emptyWagonArrivalId:'new',registryNumber:'WB-new',wagonRoutes:[{sourceArrivalId:'new',wagonNumber:'444'}]},
];
const cards=buildWagonWorkCards(arrivals,regs);
assert.equal(cards.length,6);
assert(cards.some(c=>c.arrival.id==='new'&&c.unit.wagonNumber==='111'));
assert(!cards.some(c=>c.arrival.id==='old'));
const before=JSON.stringify(arrivals);
const m=computeTransportFlowMetrics(arrivals,regs);
for(const [tab,key] of [['ready','tared'],['loading','loading'],['done','loaded'],['exit','ready']])
 assert.equal(m[key].total,cards.filter(c=>c.tab===tab).length,tab);
assert.equal(m.onSite.total,cards.length);
assert.equal(m.ready.total,3);
assert.equal(m.loaded.total,1,'Sealed without evidence is not ready');
assert.equal(buildReadyToExitFlowRows(arrivals,regs).length,m.ready.total);
assert.equal(JSON.stringify(arrivals),before);
assert.equal(buildWagonWorkCards([arrivals[1],arrivals[1]],regs).length,6,'duplicate visit excluded');
console.log('PASS: dashboard/loading parity, return visits, exited registries, cancelled/1C exclusion, incomplete seals, defects, active registry, duplicate visits.');
