#!/usr/bin/env python3
"""Prepare additional N5/N6 branches through each service API/owned scheduler."""
import datetime, json, subprocess, sys, time
from n6_common import Api, RUNTIME, state, update
api=Api(); data=state()
manager=api.login('service.manager@demo.local'); customer=api.login('customer.user@demo.local'); admin=api.login('tenant.admin@demo.local')
equipment='00000000-0000-4000-8000-000000001101'; technician='00000000-0000-4000-8000-000000004001'
if len(sys.argv)>1 and sys.argv[1]=='probe':
    sr=api.call('POST','/api/service-requests',customer,{'equipmentId':equipment,'type':'REPAIR','priority':'NORMAL','title':'N6 SDK Probe','description':'N6 real Gateway 409 and report scope probe.'},201)
    for action in ['review','accept']:api.call('POST',f'/api/service-requests/{sr["id"]}/{action}',manager)
    wo=api.call('POST','/api/workorders/work-orders',manager,{'serviceRequestId':sr['id']},201)
    api.call('POST',f'/api/workorders/work-orders/{wo["id"]}/assign',manager,{'technicianId':technician})
    update(probeOrderId=wo['id']);print('Fresh SDK probe WO prepared through API.');raise SystemExit(0)

invited=api.call('POST','/api/identity/users',admin,{'email':f'n6.second.{time.time_ns()}@example.test','fullName':'N6 second technician','userType':'TENANT_STAFF','roles':['TECHNICIAN']},201)
api.call('POST','/api/identity/users/activate',body={'token':invited['activationToken'],'password':'N6-Second-'+data['password']+'!aA1'})
second=api.call('POST','/api/workorders/technicians',manager,{'userId':invited['user']['id'],'branchId':'00000000-0000-4000-8000-000000000301','employeeCode':'N6-TECH-02','status':'AVAILABLE'},201)
created={}
for key,title,assigned in [('rejectOrderId','N6 Reject Demo',True),('raceOrderId','N6 Reassigned Demo',True),('probeOrderId','N6 SDK Probe',True),('hiddenOrderId','N6 Hidden Manager Only',False),('cancelOrderId','N6 Cancelled Demo',True),('draftOrderId','N6 Draft Recovery',True)]:
    sr=api.call('POST','/api/service-requests',customer,{'equipmentId':equipment,'type':'REPAIR','priority':'NORMAL','title':title,'description':'Isolated N6 workflow acceptance.'},201)
    for action in ['review','accept']:api.call('POST',f'/api/service-requests/{sr["id"]}/{action}',manager)
    wo=api.call('POST','/api/workorders/work-orders',manager,{'serviceRequestId':sr['id']},201)
    if assigned:api.call('POST',f'/api/workorders/work-orders/{wo["id"]}/assign',manager,{'technicianId':technician})
    created[key]=wo['id']
# Maintenance owns both the scheduler invocation and all its DB operations.
today=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=7)).date().isoformat()
plan=api.call('POST','/api/maintenance/maintenance-plans',manager,{'equipmentId':equipment,'name':'N6 Maintenance Demo','frequencyUnit':'MONTH','frequencyValue':1,'nextDueDate':today},201)
env=data['env'].copy();env['RABBITMQ_URL']='';env['MAINTENANCE_SCHEDULER_ENABLED']='false'
script="""require('reflect-metadata');const {NestFactory}=require('@nestjs/core');const {AppModule}=require('./dist/app.module');const {SchedulerService}=require('./dist/scheduler/scheduler.service');(async()=>{const app=await NestFactory.createApplicationContext(AppModule,{logger:false});try{await app.get(SchedulerService).tick();}finally{await app.close();}})().catch(()=>{process.exitCode=1;});"""
with (RUNTIME/'scheduler-tick.log').open('w') as out:
    subprocess.run(['node','-e',script],cwd=data['worktree']+'/apps/maintenance-service',env=env,stdout=out,stderr=subprocess.STDOUT,check=True)
maintenance=None;task=None
for _ in range(60):
    tasks=api.call('GET',f'/api/maintenance/maintenance-tasks?planId={plan["id"]}&pageSize=100',manager)['items']
    if tasks:
        task=tasks[0]
        orders=api.call('GET',f'/api/workorders/work-orders?equipmentId={equipment}&pageSize=100',manager)['items']
        maintenance=next((w for w in orders if w.get('maintenanceTaskId')==task['id']),None)
        if maintenance:break
    time.sleep(.5)
assert maintenance is not None,'Maintenance event did not create WO'
api.call('POST',f'/api/workorders/work-orders/{maintenance["id"]}/assign',manager,{'technicianId':technician})
update(**created,secondTechnicianId=second['id'],maintenanceOrderId=maintenance['id'],maintenanceOrderNo=maintenance['workOrderNo'],maintenanceTaskId=task['id'],maintenancePlanId=plan['id'])
print('PASS isolated fixtures: reject, reassignment, SDK probe, hidden WO and real Maintenance Task -> WO via RabbitMQ.')
