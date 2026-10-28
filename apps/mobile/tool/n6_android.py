#!/usr/bin/env python3
"""Exercise real Flutter Android UI against n6_stack, never a dev DB.
Use main (workflow/report + lost responses), branches (reject/reassign/cancel),
maintenance (WO from real Task), draft (Back/conflict recovery), or history
(report survives process restart).
"""
import argparse, json, os, re, shlex, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
from n6_common import Api, RUNTIME, state
ADB=os.environ.get('ANDROID_HOME',str(Path.home()/'Android/Sdk'))+'/platform-tools/adb'
DEVICE=os.environ.get('PBL6_N6_DEVICE','emulator-5554');PACKAGE='com.pbl6.pbl6_technician'
api=Api();data=state();manager=api.login('service.manager@demo.local');tech=api.login('technician@demo.local')
def run(*args):
    return subprocess.run([ADB,'-s',DEVICE,*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout.decode()
def ui():
    for _ in range(8):
        run('shell','uiautomator','dump','/sdcard/pbl6-n6-ui.xml')
        value=run('exec-out','cat','/sdcard/pbl6-n6-ui.xml')
        try:return ET.fromstring(value[value.index('<?xml'):])
        except (ValueError,ET.ParseError):time.sleep(.4)
    raise AssertionError('Android accessibility tree not ready')
def label(node):return (node.get('text','')+'\n'+node.get('content-desc','')).strip()
def matches(node,text):return text==label(node) or text in label(node).splitlines()
def wait(text,limit=45):
    deadline=time.monotonic()+limit
    while time.monotonic()<deadline:
        tree=ui()
        if any(text in label(n) for n in tree.iter('node')):return tree
        time.sleep(.3)
    raise AssertionError('Missing Android UI state: '+text)
def tap(node):
    b=list(map(int,re.findall(r'\d+',node.get('bounds',''))))
    run('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));time.sleep(.3)
def click(text):
    nodes=[n for n in ui().iter('node') if matches(n,text)]
    if not nodes:raise AssertionError('Android action not visible: '+text)
    tap(nodes[0])
def scroll_node(predicate):
    for _ in range(18):
        nodes=[n for n in ui().iter('node') if predicate(n)]
        if nodes:return nodes[0]
        run('shell','input','swipe','15','1260','15','500','350');time.sleep(.3)
    raise AssertionError('Android item not found by scrolling')
def write_text(value):
    # stdin, never credentials in command args/output. Prime the input connection.
    command='input text x\ninput keyevent 67\ninput text '+shlex.quote(value.replace(' ','%s'))+'\n'
    subprocess.run([ADB,'-s',DEVICE,'shell'],input=command,text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
def fill(hint,value):
    if 'mInputShown=true' in run('shell','dumpsys','input_method'):
        run('shell','input','tap','125','1555');time.sleep(.6)
    node=scroll_node(lambda n:n.get('class')=='android.widget.EditText' and hint in (n.get('hint','')+' '+n.get('content-desc','')))
    tap(node);write_text(value)
def screenshot(name):
    (RUNTIME/(name+'.png')).write_bytes(subprocess.check_output([ADB,'-s',DEVICE,'exec-out','screencap','-p']))
def login():
    run('shell','am','force-stop',PACKAGE);run('shell','am','start','-n',PACKAGE+'/.MainActivity')
    for _ in range(20):
        tree=ui()
        if 'Hôm nay của bạn' in ' '.join(label(n) for n in tree.iter('node')):return
        if any('Đăng nhập để bắt đầu' in label(n) for n in tree.iter('node')):break
        time.sleep(.5)
    fields=[n for n in ui().iter('node') if n.get('class')=='android.widget.EditText']
    tap(fields[1]);write_text('technician@demo.local')
    fields=[n for n in ui().iter('node') if n.get('class')=='android.widget.EditText']
    tap(fields[2]);write_text(data['password'])
    if 'mInputShown=true' in run('shell','dumpsys','input_method'):run('shell','input','keyevent','4')
    click('Đăng nhập');wait('Hôm nay của bạn')
def order(id):return api.call('GET','/api/workorders/work-orders/'+id,tech)
def open_order(id,history=False):
    global active_id
    active_id=id
    click('Công việc');wait('Công việc của tôi')
    click('Lịch sử' if history else 'Hiện tại')
    number=order(id)['workOrderNo'];tap(scroll_node(lambda n:matches(n,number)));wait('Chi tiết công việc')
def command(title,reason=None):
    click(title)
    if reason:fill('Lý do bắt buộc',reason)
    click('Xác nhận')
    expected={'Nhận việc':'ACCEPTED','Từ chối công việc':'CREATED','Bắt đầu di chuyển':'TRAVELLING','Bắt đầu công việc':'IN_PROGRESS','Tạm dừng công việc':'ON_HOLD','Tiếp tục công việc':'IN_PROGRESS'}[title]
    for _ in range(30):
        if order(active_id)['status']==expected:break
        time.sleep(.25)
    else:raise AssertionError('Android command did not reach expected server state: '+expected)
    for _ in range(12):
        if not any(matches(n,'Xác nhận') for n in ui().iter('node')):break
        time.sleep(.25)
def report(summary,diagnosis='N6 internal diagnosis'):
    click('Gửi báo cáo và hoàn thành');wait('Service Report')
    fill('Vấn đề / hiện trạng',diagnosis);fill('Nguyên nhân nội bộ','N6 loose connector');click('Tiếp tục')
    fill('Giải pháp đã thực hiện','N6 repaired connector');click('Tiếp tục')
    fill('Tóm tắt gửi khách hàng',summary);click('Xem trước báo cáo');wait('Xem trước · Chưa gửi')
    screenshot('android-report-preview')
    click('Gửi báo cáo và hoàn thành');wait('Báo cáo đã ghi nhận');scroll_node(lambda n:summary in label(n));screenshot('android-report-submitted')
    click('Xem công việc và báo cáo');wait('Chi tiết công việc')

def main_case():
    login();initial=order(data['workOrderId'])['status'];open_order(data['workOrderId'],initial=='COMPLETED');screenshot('android-assigned')
    if initial=='ASSIGNED':command('Nhận việc')
    if order(data['workOrderId'])['status']=='ACCEPTED':command('Bắt đầu di chuyển')
    if order(data['workOrderId'])['status']=='TRAVELLING':command('Bắt đầu công việc')
    logs=api.call('GET',f'/api/workorders/work-orders/{data["workOrderId"]}/logs',tech)
    if not any(l['eventType']=='NOTE' and l['note']=='N6 real Android note' for l in logs):
        click('Ghi chú');fill('Ghi chú nội bộ','N6 real Android note');click('Xác nhận');wait('Đã tìm thấy ghi chú trên máy chủ. Không gửi lại.')
    history=api.call('GET',f'/api/workorders/work-orders/{data["workOrderId"]}/history',tech)
    if not any(h['newStatus']=='ON_HOLD' for h in history):
        command('Tạm dừng công việc','N6 waiting for verification');screenshot('android-on-hold')
    if order(data['workOrderId'])['status']=='ON_HOLD':command('Tiếp tục công việc')
    if order(data['workOrderId'])['status']=='IN_PROGRESS':report('N6 equipment repaired')
    assert order(data['workOrderId'])['status']=='COMPLETED'
    r=api.call('GET',f'/api/workorders/work-orders/{data["workOrderId"]}/service-report',tech)
    assert r['problemDescription']=='N6 internal diagnosis' and r['customerSummary']=='N6 equipment repaired'
    assert len([l for l in api.call('GET',f'/api/workorders/work-orders/{data["workOrderId"]}/logs',tech) if l['eventType']=='NOTE' and l['note']=='N6 real Android note'])==1
    counts=json.loads((RUNTIME/'mobile-post-counts.json').read_text())
    for action in ['accept','start-travel','start','hold','resume','logs','complete']:
        assert counts[f'/api/workorders/work-orders/{data["workOrderId"]}/{action}']==1,action
    assert state()['lostCompleteResponse'] and state()['lostLogResponse']
    run('shell','input','keyevent','4');open_order(data['workOrderId'],True);click('Báo cáo');scroll_node(lambda n:'N6 equipment repaired' in label(n));screenshot('android-history-report')
    print('PASS Android accept/travel/start/note/hold/resume/report/complete/history with real Gateway/broker; lost note+complete responses reconciled with exactly one POST each.',flush=True)

def branches():
    login();open_order(data['rejectOrderId']);command('Từ chối công việc','N6 skill mismatch')
    assert order(data['rejectOrderId'])['status']=='CREATED';screenshot('android-rejected');run('shell','input','keyevent','4')
    open_order(data['raceOrderId']);click('Nhận việc')
    api.call('POST',f'/api/workorders/work-orders/{data["raceOrderId"]}/assign',manager,{'technicianId':data['secondTechnicianId']})
    click('Xác nhận');wait('Công việc đã thay đổi.');screenshot('android-reassignment-conflict');click('Đóng');run('shell','input','keyevent','4')
    if 'cancelOrderId' in data:
        open_order(data['cancelOrderId']);click('Nhận việc')
        api.call('POST',f'/api/workorders/work-orders/{data["cancelOrderId"]}/cancel',manager,{'reason':'N6 cancellation race'})
        click('Xác nhận');wait('Công việc đã thay đổi.');screenshot('android-cancellation-conflict');click('Đóng')
    print('PASS Android reasoned reject, reassignment/cancellation preflight conflicts; no stale mutation sent.',flush=True)

def maintenance():
    login();open_order(data['maintenanceOrderId']);command('Nhận việc');command('Bắt đầu công việc')
    report('N6 maintenance completed',diagnosis='N6 maintenance diagnosis')
    for _ in range(60):
        task=api.call('GET',f'/api/maintenance/maintenance-tasks/{data["maintenanceTaskId"]}',manager)
        if task['status']=='COMPLETED':break
        time.sleep(.5)
    assert task['status']=='COMPLETED'
    for _ in range(60):
        events=api.call('GET',f'/api/assets/equipment/{data["equipmentId"]}/timeline?page=1&pageSize=100',manager)['items']
        if any(e.get('referenceId')==data['maintenanceOrderId'] and e['eventType']=='WORK_ORDER_COMPLETED' for e in events):break
        time.sleep(.5)
    else:raise AssertionError('Asset has not consumed maintenance completion')
    screenshot('android-maintenance-completed');print('PASS Android completes real Maintenance WO; broker updates Task COMPLETED and equipment history.',flush=True)

def draft():
    login();open_order(data['draftOrderId'])
    if order(data['draftOrderId'])['status']=='ASSIGNED':command('Nhận việc')
    if order(data['draftOrderId'])['status']=='ACCEPTED':command('Bắt đầu công việc')
    click('Gửi báo cáo và hoàn thành');wait('Service Report');fill('Vấn đề / hiện trạng','N6 draft not submitted')
    if 'mInputShown=true' in run('shell','dumpsys','input_method'):run('shell','input','tap','125','1555');time.sleep(.6)
    for _ in range(3):
        run('shell','input','keyevent','4');tree=ui()
        if any('Rời báo cáo đang nhập?' in label(n) for n in tree.iter('node')):break
        if not any('Service Report' in label(n) for n in tree.iter('node')):raise AssertionError('Dirty report route was lost')
    wait('Rời báo cáo đang nhập?');screenshot('android-native-back-guard');click('Tiếp tục nhập')
    assert any('N6 draft not submitted' in label(n) for n in ui().iter('node'))
    fill('Nguyên nhân nội bộ','N6 draft cause');click('Tiếp tục');fill('Giải pháp đã thực hiện','N6 draft solution');click('Tiếp tục')
    fill('Tóm tắt gửi khách hàng','N6 draft retained after conflict');click('Xem trước báo cáo');wait('Xem trước · Chưa gửi')
    api.call('POST',f'/api/workorders/work-orders/{data["draftOrderId"]}/hold',manager,{'reason':'N6 concurrent hold while report drafted'})
    click('Gửi báo cáo và hoàn thành');wait('Công việc đã thay đổi.')
    for _ in range(3):run('shell','input','swipe','15','500','15','1260','350');time.sleep(.3)
    tap(scroll_node(lambda n:matches(n,'Tiếp tục công việc trước khi gửi báo cáo')));click('Xác nhận')
    for _ in range(30):
        if order(data['draftOrderId'])['status']=='IN_PROGRESS':break
        time.sleep(.25)
    wait('Tiếp tục công việc thành công.');click('Gửi báo cáo và hoàn thành');wait('Báo cáo đã ghi nhận')
    r=api.call('GET',f'/api/workorders/work-orders/{data["draftOrderId"]}/service-report',tech)
    assert r['problemDescription']=='N6 draft not submitted' and r['customerSummary']=='N6 draft retained after conflict'
    screenshot('android-report-conflict-recovered');print('PASS Android system Back protects draft; report survives conflict, explicit resume and successful complete.',flush=True)

def history():
    login();open_order(data['workOrderId'],True);click('Báo cáo');scroll_node(lambda n:'N6 equipment repaired' in label(n));screenshot('android-report-after-restart')
    print('PASS Android process restart restores session and reads terminal report via personal history.',flush=True)

def assert_test_binary():
    expected=data.get('apkSha256')
    if not expected:raise AssertionError('Run n6_install.py before Android automation')
    installed=run('shell','pm','path',PACKAGE).strip().split('package:',1)[1].splitlines()[0]
    actual=run('shell','sha256sum',installed).split()[0]
    if actual!=expected:raise AssertionError('Installed APK differs from the verified N6 relay build; no UI action sent')

if __name__=='__main__':
    assert_test_binary()
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('phase',choices=['main','branches','maintenance','history','draft']);args=parser.parse_args()
    try:globals()['main_case' if args.phase=='main' else args.phase]()
    finally:run('shell','rm','-f','/sdcard/pbl6-n6-ui.xml')
