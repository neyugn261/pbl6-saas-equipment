// Real web login/create/review/accept and customer result/confirm, no API mocking.
// Dispatcher create/assign is explicitly via Gateway: the current web T2 is read-only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const runtime=process.env.PBL6_N6_RUNTIME_DIR ?? `/tmp/pbl6-mobile-n6-${userInfo().uid}`;
const statePath=path.join(runtime,'runtime.json');
const state=JSON.parse(readFileSync(statePath,'utf8'));
assert.equal(state.gateway,'http://127.0.0.1:13000');
const {chromium}=require(process.env.N6_PLAYWRIGHT_MODULE ?? '/tmp/pbl6-n6-browser/node_modules/playwright-core');
const cache=path.join(homedir(),'.cache/ms-playwright');
const cached=readdirSync(cache).filter(x=>x.startsWith('chromium_headless_shell-')).sort().reverse()
 .map(x=>path.join(cache,x,'chrome-headless-shell-linux64/chrome-headless-shell')).find(existsSync);
const browser=await chromium.launch({headless:true,...(process.env.N6_CHROMIUM_PATH || cached ? {executablePath:process.env.N6_CHROMIUM_PATH ?? cached}:{})});
async function call(method,route,token,body,status=200) {
 const response=await fetch(state.gateway+route,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));
 assert.equal(response.status,status,`${method} ${route}: ${response.status} ${data.code??''}`);return data;
}
async function loginApi(email) {return (await call('POST','/api/identity/auth/login',null,{tenantCode:'DEMO',email,password:state.password})).accessToken;}
async function loginWeb(email) {
 const context=await browser.newContext();const page=await context.newPage();
 page.on('dialog',dialog=>dialog.accept());
 await page.goto(state.web+'/login');await page.getByLabel('Mã doanh nghiệp',{exact:true}).fill('DEMO');
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(state.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.waitForURL(url=>!url.pathname.includes('login'));
 return page;
}
try {
 const customer=await loginWeb('customer.user@demo.local');
 if(process.argv[2]==='prepare') {
  await customer.goto(state.web+'/requests/new');
  await customer.locator('select').first().selectOption('00000000-0000-4000-8000-000000001101');
  await customer.getByLabel('Tiêu đề',{exact:true}).fill('N6 Android Workflow');
  await customer.getByLabel('Mô tả',{exact:true}).fill('N6 end-to-end: real web request and Android completion.');
  await customer.getByRole('button',{name:'Gửi yêu cầu dịch vụ',exact:true}).click();
  await customer.waitForURL(/\/requests\/[0-9a-f-]+$/);
  const requestId=customer.url().split('/').pop();
  await customer.screenshot({path:path.join(runtime,'web-created-request.png'),fullPage:true});
  const manager=await loginWeb('service.manager@demo.local');
  await manager.goto(state.web+'/requests/'+requestId);
  await manager.getByRole('button',{name:'Xem xét và kiểm tra bảo hành',exact:true}).click();
  await manager.getByRole('button',{name:'Tiếp nhận',exact:true}).click();
  const token=await loginApi('service.manager@demo.local');
  let request;
  for(let i=0;i<50;i++) {
   request=await call('GET','/api/service-requests/'+requestId,token);
   if(request.status==='ACCEPTED')break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(request.status,'ACCEPTED');
  await manager.screenshot({path:path.join(runtime,'web-reviewed-request.png'),fullPage:true});
  const wo=await call('POST','/api/workorders/work-orders',token,{serviceRequestId:requestId,scheduledStart:new Date(Date.now()+3600000).toISOString(),scheduledEnd:new Date(Date.now()+7200000).toISOString()},201);
  for(let i=0;i<60;i++) { const processing=await call('GET','/api/service-requests/'+requestId,token); if(processing.status==='PROCESSING')break; await new Promise(resolve=>setTimeout(resolve,250)); if(i===59)throw new Error('WO Created event did not move SR to PROCESSING'); }
  const dispatcher=await loginApi('dispatcher@demo.local');
  await call('POST',`/api/workorders/work-orders/${wo.id}/assign`,dispatcher,{technicianId:'00000000-0000-4000-8000-000000004001'});
  writeFileSync(statePath,JSON.stringify({...JSON.parse(readFileSync(statePath,'utf8')),requestId,workOrderId:wo.id,workOrderNo:wo.workOrderNo,equipmentId:wo.equipmentId,lostCompleteResponse:false,lostLogResponse:false}));
  console.log('PASS web login/create SR/review/warranty/accept. WO create and dispatcher assign via real Gateway API (web T2 UI gap recorded).');
 } else if(process.argv[2]==='verify') {
  const token=await loginApi('customer.user@demo.local');let request;
  for(let i=0;i<60;i++) {
   request=await call('GET','/api/service-requests/'+state.requestId,token);
   if(request.status==='RESOLVED')break;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.equal(request.status,'RESOLVED');assert.equal(request.resolutionSummary,'N6 equipment repaired');
  assert.equal(JSON.stringify(request).includes('N6 internal diagnosis'),false);
  await customer.goto(state.web+'/requests/'+state.requestId);
  await customer.getByText(/Tóm tắt cho khách hàng:.*N6 equipment repaired/).first().waitFor();
  assert.equal((await customer.locator('body').innerText()).includes('N6 internal diagnosis'),false);
  let eventFound=false;
  for(let i=0;i<60;i++) {
   const feed=await call('GET',`/api/assets/equipment/${state.equipmentId}/timeline?page=1&pageSize=100`,token);
   eventFound=feed.items.some(row=>row.referenceId===state.workOrderId && row.eventType==='WORK_ORDER_COMPLETED');
   if(eventFound)break;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(eventFound,true,'Asset history did not consume the completed WO event');
  await customer.screenshot({path:path.join(runtime,'web-customer-result.png'),fullPage:true});
  await customer.getByRole('button',{name:'Xác nhận hoàn tất',exact:true}).click();
  for(let i=0;i<40;i++) {
   request=await call('GET','/api/service-requests/'+state.requestId,token);if(request.status==='CLOSED')break;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(request.status,'CLOSED');
  await customer.screenshot({path:path.join(runtime,'web-confirmed-result.png'),fullPage:true});
  console.log('PASS real web customer sees broker-updated customer summary, no internal diagnosis, and confirms SR to CLOSED.');
 } else throw new Error('Use prepare or verify');
} catch(error) { const pages=browser.contexts().flatMap(c=>c.pages()); for(let i=0;i<pages.length;i++) { await pages[i].screenshot({path:path.join(runtime,`web-error-${i}.png`),fullPage:true}).catch(()=>{}); writeFileSync(path.join(runtime,`web-error-${i}.txt`),(await pages[i].locator('body').innerText()).slice(0,12000)); console.log('Web failed at path',new URL(pages[i].url()).pathname); } throw error; } finally {await browser.close();}
