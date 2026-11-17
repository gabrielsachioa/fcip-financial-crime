// Isolated UI regression checks. Every API response is a fabricated QA fixture.
// Start Vite with VITE_API_BASE_URL=https://fcip-qa.invalid and a dedicated
// headless Chrome profile at127.0.0.1:9237. No request reaches the real backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const origin = 'http://127.0.0.1:5177';
const output = path.resolve('..', 'docs/screenshots/redesign-20261117');
fs.mkdirSync(output, { recursive: true });
const targets = await (await fetch('http://127.0.0.1:9237/json/list')).json();
const target = targets.find((item) => item.type === 'page');
assert(target, 'Dedicated QA Chrome must have a page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let serial = 0;
const pending = new Map(), errors = [], requests = [], unknown = [], checks = [];
let role = 'ROLE_DATA_OPS', mode = 'populated', signedIn = true;
const date = '2026-11-17T09:30:00Z';
const signal = 'Sinyal ini merupakan observasi yang mendukung investigasi dan bukan bukti adanya perbuatan salah. This signal is an observation that supports an investigation; it is not evidence of wrongdoing.';
const synthetic = 'QA fixtures only. No real transactions, model evaluation or deployment.';
const tx = { id: 'txn-1', transaction_ref: 'QA-TRX-000042', account_number: 'SYNTHETIC-001', transaction_date: date,
  timestamp_precision: 'second', source_timezone_known: true, amount: '375000000', currency: 'IDR', direction: 'DEBIT',
  channel: 'MOBILE', counterparty_ref: 'QA-RECIPIENT', description: 'Transaksi sintetis untuk pengujian antarmuka.',
  customer_id: 'customer-1', customer_ref: 'QA-CUS-42', customer_name: 'Nasabah Contoh' };
const contribution = { feature: 'PRIOR_COUNT_R7D', definition: 'Number of observations strictly before this transaction in the preceding seven days', value: 12, contribution: .3 };
const score = { id: 'score-1', model_version: 'qa-model-v1', unit: 'FRAUD', customer_id: tx.customer_id,
  customer_ref: tx.customer_ref, customer_name: tx.customer_name, as_of: date, transaction_ref: tx.transaction_ref,
  transaction_amount: 375000000, score: .82, threshold: .65, flagged: true,
  contributions: [contribution, { feature: 'NO_BASELINE', definition: 'Insufficient observed history', value: 1, contribution: .12 }],
  feature_set_version: 'lab:behavioral_v1', explanation_method: 'tree_shap_log_odds', score_kind: 'score', currency: 'IDR',
  timestamp_precision: 'second', source_timezone_known: true };
const rule = { rule_id: 'rule-1', rule_ref: 'RUL-0001', version: 1, state: 'ACTIVE', template_version: 'v1',
  reason_code: 'RC-STRUCT-01', severity: 'HIGH', description: 'QA original stored rule description.', parameters: { MIN_COUNT: 3 },
  window_type: 'ROLLING', window_length: 'P7D' };
const alert = { id: 'alert-1', pattern_code: 'P02', status: 'OPEN', customer_id: tx.customer_id, customer_ref: tx.customer_ref,
  customer_name: tx.customer_name, reason: 'QA technical reason remains available.', case_id: null, created_at: date, model_score: .82,
  correlation_id: '11111111-1111-4111-8111-111111111111', rule, detection_details: { TXN_COUNT_IN_BAND: 3,
    AGGREGATE_AMOUNT: '1125000000', THRESHOLD_APPLIED: '500000000', BAND_LOWER_APPLIED: '350000000',
    window_start: '2026-11-10T00:00:00Z', window_end: '2026-11-17T00:00:00Z' },
  disposed_by: null, disposed_by_email: null, disposed_at: null, disposition_reason: null, transactions: [tx], model_signals: [score], signal_notice: signal };
const model = { id: 'model-1', version: 'qa-model-v1', unit: 'FRAUD', state: 'DRAFT', artefact_type: 'LAB_LIGHTGBM',
  definition_hash: 'a'.repeat(64), feature_set_version: 'lab:behavioral_v1', threshold: .65,
  trained_on: { profile: 'Fictional UI QA data', seed: 42 }, validation: { precision: .72, recall: .86, average_precision: .79 },
  created_at: date, synthetic_notice: synthetic, training_kind: 'supervised', currency: 'IDR' };
const fields = [['transaction_ref','ID transaksi'],['transaction_date','Tanggal & waktu'],['amount','Nominal'],['account_number','Rekening / ID akun'],['direction','Arah dana']]
  .map(([key,label]) => ({key,label,required:['transaction_date','amount','account_number'].includes(key),help:''}));
const options = { fields, feature_groups: [{key:'kecepatan',label:'Kecepatan transaksi',description:'QA feature group',default:true,features:['PRIOR_COUNT_R7D']}],
  models: [{key:'lightgbm',name:'LightGBM',kind:'supervised',description:'QA model',default:true}], max_upload_bytes: 52428800,
  min_per_class: 30, synthetic_notice: synthetic };
const point = { threshold: .65, tp: 86, fp: 24, fn: 14, tn: 876, flagged: 110, precision: .78, recall: .86, f1: .82, flagged_per_10k: 1100 };
const curve = [{...point,threshold:.2,precision:.60,recall:.98},point,{...point,threshold:.9,precision:.93,recall:.5}];
const result = { key:'lightgbm', name:'LightGBM',kind:'supervised',description:'QA',seconds:1,default_index:1,
  validation_ranking:{average_precision:.79,roc_auc:.9},validation_curve:curve,validation_by_category:[{category:'P04',positives:100,caught:86}],
  validation_category_curve:curve.map((p)=>[{category:'P04',positives:100,caught:p.tp}]),
  top_features:[{feature:contribution.feature,share:.4,direction:'positive',definition:contribution.definition}] };
const split = {rows:1000,positives:100,date_from:'2026-01-01',date_to:'2026-10-01'};
const run = {id:'run-1',dataset_id:'dataset-1',dataset_name:'Contoh QA',created_at:date,seconds:1,
  config:{feature_groups:['kecepatan'],models:['lightgbm'],train_share:.7}, results:{protocol:{train_share:.7},
  split:{train:{...split,rows:700},validation:{...split,rows:150},test:{...split,rows:150}},
  features:{requested_groups:['kecepatan'],used:['PRIOR_COUNT_R7D'],unusable:[],definitions:{PRIOR_COUNT_R7D:contribution.definition},feature_seconds:.1},
  models:[result],best_model:'lightgbm',seconds:1},saved_versions:[],evaluation:{state:'SEALED'},synthetic_notice:synthetic};
const mapping = {fields:Object.fromEntries(fields.map((field)=>[field.key,field.key])),label_column:'label',positive_values:['1'],negative_values:['0'],category_column:null,date_format:'iso',default_currency:'IDR'};
const dataset = {id:'dataset-1',name:'Contoh QA',file_name:'qa-fixture.csv',file_sha256:'a'.repeat(64),file_size_bytes:12000,file_format:'csv',row_count:1000,
  columns:[...fields.map((field)=>field.key),'label'],preview:[{...tx,label:'1'}],
  suggestion:{...mapping,low_cardinality:{label:['0','1']}},mapping,
  validation:{total_rows:1000,accepted:1000,quarantined:0,quarantine_reasons:[],usable_rows:1000,missing_label:0,excluded_other_currency:0,
    positives:100,negatives:900,positive_rate:.1,currency:'IDR',date_from:'2026-01-01',date_to:'2026-10-01',accounts:100,timestamp_precision:{second:1000},category_counts:{P04:100},notes:[],ready:true},
  status:'MAPPED',uploaded_by_email:'qa@example.test',created_at:date,runs:[{id:'run-1',created_at:date,seconds:1,best_model:'lightgbm',models:['lightgbm']}],
  evaluation:{state:'SEALED',protocol_id:'qa-protocol',train_share:.7}};
const labVersion = {id:'labmodel-1',version:'qa-pending-v1',state:'PENDING_APPROVAL',artefact_type:'LAB_LIGHTGBM',model_key:'lightgbm',model_name:'LightGBM',
  training_kind:'supervised',threshold:.65,dataset_id:dataset.id,dataset_name:dataset.name,lab_run_id:'run-1',validation:point,test:{},
  created_by_email:'analyst@example.test',submitted_by_email:'analyst@example.test',approved_by_email:null,approved_at:null,superseded_by_version:null,created_at:date,history:[]};

function send(method,params={}) { return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));}); }
function fixture(url,method,body) {
  const p=url.pathname;
  if(p==='/auth/refresh'||p==='/auth/login') return signedIn ? {access_token:'qa-fixture-token',token_type:'bearer'} : {detail:mode==='locked'?'Account locked, try again later':'Invalid email or password'};
  if(p==='/auth/me') return {id:'qa-user',email:'qa@example.test',full_name:'Pengguna Contoh',role};
  if(method==='POST'&&p.endsWith('/mapping')) return {...dataset,mapping:JSON.parse(body),runs:[],evaluation:{state:'UNCONFIGURED'}};
  if(method==='POST'&&p.endsWith('/disposition')) return {...alert,status:'ESCALATED',disposition_reason:JSON.parse(body).reason};
  if(method!=='GET') return {detail:'Only fixture mutations are accepted by this test.'};
  const list=(items)=>({items:mode==='empty'?[]:items,total:mode==='empty'?0:items.length,limit:Number(url.searchParams.get('limit'))||50,offset:Number(url.searchParams.get('offset'))||0});
  if(p==='/overview') return mode==='empty'?{customers:0,accounts:0,transactions:0,quarantined:0,alerts_open:0,alerts_escalated:0,alerts_disposed:0,cases:0,latest_transaction_date:null}:
    {customers:2481,accounts:3202,transactions:124820,quarantined:312,alerts_open:37,alerts_escalated:8,alerts_disposed:16,cases:5,latest_transaction_date:date,latest_transaction_timestamp_precision:'second',latest_transaction_source_timezone_known:true};
  if(p==='/transactions')return list([tx]);
  if(p==='/ingestion/quarantine')return list([{id:'q-1',source_file_name:'qa.csv',row_number:43,raw_row:{amount:'-100'},error_reason:'Nominal harus lebih besar dari nol.',created_at:date}]);
  if(p==='/ingestion/batches')return list([{id:'batch-1',batch_ref:'BAT-QA42',source_system:'QA',business_date:'2026-11-17',file_name:'qa.csv',file_checksum:'a'.repeat(64),file_size_bytes:12000,expected_records:1000,status:'COMPLETED',total_rows:1000,accepted_rows:990,quarantined_rows:10,correlation_id:alert.correlation_id,registered_by_email:'qa@example.test',created_at:date,completed_at:date}]);
  if(p==='/ml/models')return mode==='empty'?[]:[model];
  if(p==='/ml/scores')return {...list([{...score,unit:url.searchParams.get('unit')||'FRAUD',...(mode==='boundary'?{score:.001235,threshold:.001234}:{})}]),signal_notice:signal,synthetic_notice:synthetic};
  if(p==='/alerts')return list([{...alert,status:url.searchParams.get('status')||'OPEN'}]);
  if(p.startsWith('/alerts/'))return mode==='ml'?{...alert,pattern_code:'ML_SCORE',detection_details:{SCORE:.82,THRESHOLD:.65,CONTRIBUTIONS:score.contributions,MODEL_VERSION:model.version,SCORE_IDS:[score.id],window_start:date,window_end:date}}:alert;
  if(p.startsWith('/cases/'))return {id:'case-1',case_number:'CASE-QA42',status:'OPEN',correlation_id:alert.correlation_id,opened_by:'qa-user',opened_by_email:'qa@example.test',assigned_to:null,created_at:date,updated_at:date,alerts:[{...alert,status:'ESCALATED',case_id:'case-1'}]};
  if(p==='/audit')return list([{id:'audit-1',correlation_id:alert.correlation_id,actor_user_id:'qa-user',actor_email:'qa@example.test',actor_role:role,object_type:'ALERT',object_id:alert.id,from_state:null,to_state:'OPEN',reason:'QA original audit reason.',created_at:date}]);
  if(p==='/lab/options')return options;
  if(p==='/lab/datasets')return mode==='empty'?[]:[mode==='mapping'?{...dataset,mapping:null,status:'UPLOADED',validation:null,runs:[],evaluation:{state:'UNCONFIGURED'}}:dataset];
  if(p==='/lab/datasets/dataset-1')return mode==='mapping'?{...dataset,mapping:null,status:'UPLOADED',validation:null,runs:[],evaluation:{state:'UNCONFIGURED'}}:dataset;
  if(p==='/lab/runs/run-1')return run;
  if(p==='/lab/models')return {items:mode==='empty'||mode==='mapping'?[]:[labVersion],model_alerts:{rule_ref:'RUL-0002',version:1,state:'DRAFT',active:false,reason_code:'RC-ML-01',severity:'MEDIUM'},min_reason_length:20,synthetic_notice:synthetic,signal_notice:signal};
  unknown.push(p);return {detail:'Unknown fixture: '+p};
}
ws.addEventListener('message',async(event)=>{
  const message=JSON.parse(event.data);
  if(message.id){const handler=pending.get(message.id);pending.delete(message.id);message.error?handler?.reject(Error(JSON.stringify(message.error))):handler?.resolve(message.result);return;}
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  if(message.method!=='Fetch.requestPaused')return;
  const {requestId,request}=message.params,url=new URL(request.url);
  try {
    if(url.origin===origin){await send('Fetch.continueRequest',{requestId});return;}
    if(url.origin!=='https://fcip-qa.invalid'){await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});unknown.push('BLOCKED '+url.origin);return;}
    requests.push({path:url.pathname,query:url.search,method:request.method,body:request.postData});
    const failure=(mode==='error'&&url.pathname==='/overview')||(mode==='model-error'&&url.pathname==='/ml/models')||(mode==='run-error'&&url.pathname==='/lab/runs/run-1');
    const authFailure=!signedIn&&url.pathname.startsWith('/auth/');
    const responseCode=request.method==='OPTIONS'?200:failure?503:authFailure?(mode==='locked'?423:401):200;
    const value=request.method==='OPTIONS'?{}:failure?{detail:'Layanan contoh sedang tidak tersedia.'}:fixture(url,request.method,request.postData);
    await send('Fetch.fulfillRequest',{requestId,responseCode,responseHeaders:[{name:'Content-Type',value:'application/json'},
      {name:'Access-Control-Allow-Origin',value:origin},{name:'Access-Control-Allow-Credentials',value:'true'},
      {name:'Access-Control-Allow-Headers',value:'authorization,content-type'},{name:'Access-Control-Allow-Methods',value:'GET,POST,OPTIONS'}],body:Buffer.from(JSON.stringify(value)).toString('base64')});
  }catch(error){errors.push(String(error));}
});
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise((resolve)=>setTimeout(resolve,50));}throw Error('Timeout: '+expression);}
async function nav(route){await send('Page.navigate',{url:origin+route});await until(`document.querySelector('h1')`);await new Promise((resolve)=>setTimeout(resolve,180));}
async function viewport(width,height=1000){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));}
async function clickText(text){await evaluate(`(()=>{const element=[...document.querySelectorAll('button,a,summary')].find(e=>e.getClientRects().length&&e.textContent.trim().includes(${JSON.stringify(text)}));if(!element)throw Error('Missing visible control: '+${JSON.stringify(text)});element.click();})()`);await new Promise((resolve)=>setTimeout(resolve,100));}
async function input(selector,value){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}

const routes=['/','/alerts','/alerts/alert-1','/cases/case-1','/model-flags','/lab','/audit','/guide'];
for(const width of [320,375,768,1024,1440]){
  await viewport(width);
  for(const route of routes){
    mode='populated';signedIn=true;role=route==='/alerts/alert-1'?'ROLE_TRIAGE':'ROLE_DATA_OPS';
    await nav(route);
    const fit=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1').innerText,overflow:[...document.querySelectorAll('main *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-scroll')).slice(0,6).map(e=>e.outerHTML.slice(0,240))})`);
    checks.push({kind:'responsive',route,...fit});
    assert(fit.scroll<=fit.width+1,JSON.stringify(checks.at(-1)));
    const label=route==='/'?'beranda':route.startsWith('/alerts/')?'detail-temuan':route.startsWith('/cases/')?'pemeriksaan':route.split('/')[1];
    if(width===1440||width===375&&['/','/alerts/alert-1','/lab','/guide'].includes(route))await screenshot(`${width}-${label}`);
  }
}
// Authentication messages, accessible password control, no real authentication.
signedIn=false;mode='populated';await viewport(1440);await nav('/login');await screenshot('1440-login');
await input('input[type=email]','qa@example.test');await input('input[autocomplete=current-password]','test-only-password');
await clickText('Masuk ke ruang kerja');await until(`document.querySelector('[role=alert]')`);
assert(await evaluate(`document.querySelector('[role=alert]').innerText.includes('Email atau kata sandi belum cocok')`));
mode='locked';await clickText('Masuk ke ruang kerja');await until(`document.querySelector('[role=alert]')?.innerText.includes('Akun dikunci sementara')`);
await viewport(375,812);await screenshot('375-login');checks.push({kind:'login-localized-error',passed:true});
// Mobile navigation traps focus and restores it on Escape.
signedIn=true;role='ROLE_ANALYST';await nav('/');
await evaluate(`document.querySelector('.mobile-menu-button').click()`);await until(`document.querySelector('.sidebar.is-open')`);
await evaluate(`document.querySelector('.sidebar a').focus()`);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});
assert(await evaluate(`document.activeElement.classList.contains('mobile-menu-close')`));
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
assert(await evaluate(`document.activeElement===document.querySelector('.sidebar a')`));
checks.push({kind:'drawer-focus-trap',passed:true});
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await until(`!document.querySelector('.sidebar.is-open')&&document.activeElement.classList.contains('mobile-menu-button')`);
checks.push({kind:'drawer-escape-focus',passed:true});
// Direct filter links, readonly access, and the 20-character decision guard.
role='ROLE_TRIAGE';await nav('/alerts?status=ESCALATED');
assert(requests.some((item)=>item.path==='/alerts'&&item.query.includes('status=ESCALATED')));
await nav('/alerts/alert-1');await input('#disposition-reason','a'.repeat(19));
assert(await evaluate(`document.querySelector('.review-decision-card button[type=submit]').disabled`));
await input('#disposition-reason','a'.repeat(20));await until(`!document.querySelector('.review-decision-card button[type=submit]').disabled`);
checks.push({kind:'decision-reason-guard',passed:true});
await clickText('Simpan hasil tinjauan');await until(`document.querySelector('.review-recorded-decision')`);
const decisionRequest=requests.findLast((item)=>item.method==='POST'&&item.path.endsWith('/disposition'));
assert.deepEqual(JSON.parse(decisionRequest.body),{decision:'escalate',reason:'a'.repeat(20)});
checks.push({kind:'decision-api-contract',passed:true});
role='ROLE_ANALYST';await nav('/alerts/alert-1');assert(!await evaluate(`document.querySelector('#disposition-reason')`));
checks.push({kind:'readonly-decision-role',passed:true});
// Upload selections survive view switches; mutations still hit only mock fixtures.
role='ROLE_DATA_OPS';await viewport(1440);await nav('/');await clickText('Tambah & periksa data');
await evaluate(`(()=>{const el=document.querySelector('#csv-file');const dt=new DataTransfer();dt.items.add(new File(['transaction_ref,amount\\nQA,100'], 'qa-only.csv',{type:'text/csv'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await clickText('Keterangan unggahan tambahan');await input('input[aria-label="Asal data"]','QA preserved source');
await clickText('Daftar transaksi');await clickText('Tambah & periksa data');
assert(await evaluate(`document.querySelector('#csv-file').files.length===1&&document.querySelector('input[aria-label="Asal data"]').value==='QA preserved source'`));
checks.push({kind:'upload-state-retained',passed:true});await evaluate(`document.querySelector('#workspace-data').scrollIntoView({block:'start'})`);await screenshot('1440-upload');
// Searchable glossary and honest score explanations.
await nav('/guide');await input('input[type=search]','recall');await until(`document.querySelectorAll('.guide-term').length===1`);
assert(await evaluate(`document.querySelector('.guide-term').innerText.includes('berlabel positif')`));
mode='ml';await nav('/alerts/alert-1');assert(await evaluate(`document.querySelector('.review-story').innerText.includes('batas')`));
assert(await evaluate(`document.querySelector('.model-signals').innerText.includes('bukan peluang')`));
assert(await evaluate(`document.querySelector('.review-story').innerText.includes('12')&&document.querySelector('.review-story').innerText.includes('Riwayat belum cukup')`));
checks.push({kind:'model-story-observed-indicators',passed:true});
checks.push({kind:'glossary-and-score-language',passed:true});await screenshot('1440-ml-explanation');
mode='boundary';await nav('/model-flags');
const boundaryValues=await evaluate(`[...document.querySelectorAll('.signal-score strong')].map(e=>e.innerText)`);
assert.equal(boundaryValues.length,2);assert.notEqual(boundaryValues[0],boundaryValues[1]);
checks.push({kind:'visible-small-score-boundary',passed:true});
// Label choices and evaluation locks retain their actual input contracts.
mode='mapping';role='ROLE_ANALYST';await nav('/lab');
await until(`document.querySelector('select[aria-label="Arti label 0"]')`);
assert(await evaluate(`document.querySelector('select[aria-label="Arti label 0"]').value==='negative'&&document.querySelector('select[aria-label="Arti label 1"]').value==='positive'`));
await clickText('Periksa kecocokan kolom');
await until(`document.querySelector('.lab-validation')`);
const mappingRequest=requests.findLast((item)=>item.method==='POST'&&item.path.endsWith('/mapping'));
assert.deepEqual(JSON.parse(mappingRequest.body).negative_values,['0']);
assert.deepEqual(JSON.parse(mappingRequest.body).positive_values,['1']);
checks.push({kind:'explicit-label-mapping-contract',passed:true});
mode='populated';await nav('/lab');
assert(await evaluate(`document.querySelector('select[aria-label="Arti label 0"]').disabled`));
checks.push({kind:'evaluation-mapping-lock',passed:true});
// Error and empty states stay understandable and visible.
for(const route of ['/','/alerts','/model-flags','/audit','/lab']){mode='empty';await nav(route);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));checks.push({kind:'empty',route,passed:true});}
await viewport(375,812);await nav('/lab');await screenshot('375-lab-first-use');
await viewport(1440);
mode='model-error';await nav('/model-flags');assert(await evaluate(`[...document.querySelectorAll('[role=alert]')].some(e=>e.getClientRects().length&&e.innerText.includes('Layanan contoh'))`));
mode='run-error';await nav('/lab');await until(`[...document.querySelectorAll('[role=alert]')].some(e=>e.getClientRects().length&&e.innerText.includes('Layanan contoh'))`);
checks.push({kind:'visible-model-run-errors',passed:true});
mode='populated';role='ROLE_MLRO';await viewport(1440);await nav('/lab');
assert(await evaluate(`[...document.querySelectorAll('.lab-workspace-tabs button')].some(e=>e.innerText.includes('Setujui')&&e.getAttribute('aria-pressed')==='true')`));
await evaluate(`document.querySelector('#lab-step-6')?.scrollIntoView({block:'start'})`);await screenshot('1440-approval');checks.push({kind:'mlro-approval-view',passed:true});
await input('textarea[aria-label="Catatan untuk tindakan ini"]','a'.repeat(19));
assert(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.includes('Setujui & aktifkan')).disabled`));
await input('textarea[aria-label="Catatan untuk tindakan ini"]','a'.repeat(20));
assert(await evaluate(`![...document.querySelectorAll('button')].find(e=>e.innerText.includes('Setujui & aktifkan')).disabled`));
checks.push({kind:'approval-reason-guard',passed:true});
await viewport(375,812);await nav('/lab');
assert(await evaluate(`document.querySelector('.lab-mobile-progress').getClientRects().length>0&&!document.querySelector('.lab-mobile-progress details').open&&document.querySelector('.lab-desktop-progress').getClientRects().length===0`));
await clickText('Lihat semua langkah');
assert(await evaluate(`document.querySelector('.lab-mobile-progress details').open`));
checks.push({kind:'compact-mobile-progress',passed:true});
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await viewport(812,375);await nav('/guide');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
checks.push({kind:'landscape-reduced-motion',passed:true});
assert.deepEqual(errors,[],'Browser runtime exceptions');assert.deepEqual(unknown,[],'Unmocked requests');
const report={purpose:'Fictional fixtures for UI behavior only; not ML or production results.',live_backend_requests:0,checks,requests:requests.map(({body,...item})=>item),runtime_errors:errors,unmocked_requests:unknown};
fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,live_backend_requests:0,runtime_errors:errors.length,output}));
await send('Browser.close');ws.close();
