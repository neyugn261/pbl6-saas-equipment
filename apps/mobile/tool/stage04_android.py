#!/usr/bin/env python3
"""Native upload recovery UAT against stage04_fixture.cjs --serve only.
Use a disposable emulator; --reset-test-app explicitly clears only the test app.
Runtime credentials are read from the private fixture file and never printed.
"""
import argparse, hashlib, json, os, re, shlex, subprocess, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runtime', default='/tmp/pbl6-mobile-stage04-runtime.json')
p.add_argument('--device', required=True)
p.add_argument('--reset-test-app', action='store_true')
p.add_argument('--reuse-test-apk', action='store_true', help='Use APK already built for this fixture origin')
a = p.parse_args()
state = json.loads(Path(a.runtime).read_text())
assert state['status'] == 'READY' and state['gateway'].startswith('http://127.0.0.1:'), 'Use the running dedicated stage 4 test fixture'
assert a.reset_test_app, 'Use --reset-test-app on a disposable emulator to opt into clearing this app'
ADB = os.environ.get('ADB_BIN', 'adb')
PACKAGE = 'com.pbl6.pbl6_technician'
ART = Path('/tmp/pbl6-mobile-stage04-android'); ART.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output([ADB, '-s', a.device, *args], stderr=subprocess.DEVNULL).decode()
assert a.device.startswith('emulator-') and adb('shell', 'getprop', 'ro.kernel.qemu').strip() == '1', 'Use a disposable Android emulator, not a physical phone'
def tree():
    for _ in range(8):
        adb('shell', 'uiautomator', 'dump', '/sdcard/m04-ui.xml')
        raw = adb('exec-out', 'cat', '/sdcard/m04-ui.xml')
        try: return ET.fromstring(raw[raw.index('<?xml'):])
        except (ValueError, ET.ParseError): time.sleep(.3)
    raise AssertionError('Android accessibility tree unavailable')
def label(n): return (n.get('text', '') + '\n' + n.get('content-desc', '')).strip()
def bounds(n): return list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
def wait(text):
    for _ in range(40):
        t = tree()
        if any(text in label(n) for n in t.iter('node')): return t
        time.sleep(.3)
    raise AssertionError('Missing Android state: ' + text)
def node(text, partial=False):
    for _ in range(12):
        candidates = [n for n in tree().iter('node') if n.get('class') != 'android.widget.EditText' and (text in label(n) if partial else text in label(n).splitlines()) and len(bounds(n)) == 4 and bounds(n)[3] > bounds(n)[1]]
        if candidates: return min(candidates, key=lambda n: (bounds(n)[2]-bounds(n)[0])*(bounds(n)[3]-bounds(n)[1]))
        adb('shell', 'input', 'swipe', '15', '1200', '15', '450', '300'); time.sleep(.3)
    raise AssertionError('Missing action: ' + text)
def tap(n):
    b = bounds(n); adb('shell', 'input', 'tap', str((b[0]+b[2])//2), str((b[1]+b[3])//2)); time.sleep(.3)
def click(text): tap(node(text))
def hide_keyboard():
    if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method'):
        adb('shell', 'input', 'keyevent', '4'); time.sleep(.3)
def write(value, clear=False):
    commands = ('input keyevent 123\ninput keyevent ' + ' '.join(['67']*80) + '\n') if clear else ''
    commands += 'input text ' + shlex.quote(value.replace(' ', '%s')) + '\n'
    subprocess.run([ADB, '-s', a.device, 'shell', 'sh', '-s'], input=commands, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
def fill(hint, value):
    hide_keyboard()
    for _ in range(14):
        editable = [n for n in tree().iter('node') if n.get('class') == 'android.widget.EditText']
        fields = [n for n in editable if hint in (n.get('hint', '') + ' ' + label(n))]
        if not fields and hint == 'Mã WO' and len(editable) == 1: fields = editable
        if fields: tap(fields[0]); write(value, clear=True); hide_keyboard(); return
        adb('shell', 'input', 'swipe', '15', '1200', '15', '450', '300'); time.sleep(.3)
    raise AssertionError('Missing input: ' + hint)
def screenshot(name): (ART/(name+'.png')).write_bytes(subprocess.check_output([ADB, '-s', a.device, 'exec-out', 'screencap', '-p']))
def restart():
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE+'/.MainActivity')
    wait('Hôm nay của bạn')
def open_job(number, history=False):
    click('Công việc'); wait('Công việc của tôi'); scroll_top()
    click('Lịch sử' if history else 'Hiện tại'); fill('Mã WO', number)
    tap(node(number, partial=True)); wait('Chi tiết công việc')
def api(method, path, token=None, body=None):
    headers = {'content-type': 'application/json'}
    if token: headers['authorization'] = 'Bearer ' + token
    request = urllib.request.Request(state['gateway']+path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=20) as result: return json.load(result)

def scroll_top():
    for _ in range(8):
        if any(any(v in label(n).splitlines() for v in ['Công việc của tôi', 'Tổng quan']) and len(bounds(n)) == 4 for n in tree().iter('node')): return
        adb('shell','input','swipe','15','450','15','1350','250')
def back_to_jobs():
    adb('shell','input','keyevent','4'); wait('Công việc của tôi')
def files_tab():
    for _ in range(5):
        nodes = list(tree().iter('node'))
        candidates = [n for n in nodes if 'Tệp' in label(n).splitlines() and len(bounds(n)) == 4]
        if candidates: tap(candidates[0]); time.sleep(.5); return
        anchor = next(n for n in nodes if any(v in label(n).splitlines() for v in ['Tổng quan', 'Hoạt động', 'Báo cáo', 'Phụ tùng']) and len(bounds(n)) == 4)
        b=bounds(anchor); y=str((b[1]+b[3])//2)
        adb('shell','input','swipe','640',y,'100',y,'300')
    raise AssertionError('File tab not visible')
def resource(suffix):
    for _ in range(12):
        for n in tree().iter('node'):
            if n.get('resource-id', '').endswith('/'+suffix): return n
        time.sleep(.3)
    raise AssertionError('Missing native resource: '+suffix)
def allow_camera():
    for _ in range(4):
        nodes = list(tree().iter('node'))
        permission = [n for n in nodes if n.get('resource-id','').endswith(('/permission_allow_foreground_only_button','/permission_allow_button'))]
        if permission: tap(permission[0]); continue
        if any(n.get('package') == 'com.android.camera2' for n in nodes): return
        time.sleep(.5)
def downloads():
    click('Show roots')
    tap(next(n for n in tree().iter('node') if n.get('resource-id')=='android:id/title' and label(n)=='Downloads'))

port = state['gateway'].rsplit(':', 1)[1]
initial = api('GET','/__test/stats')
assert initial['puts'] == 0 and not initial['prepare'], 'Start a fresh stage 4 fixture for each Android run'
if not a.reuse_test_apk:
    with (ART/'build.log').open('w') as log:
        subprocess.run(['flutter','build','apk','--debug','--no-pub','--dart-define=API_BASE_URL=http://10.0.2.2:'+port], cwd=ROOT/'apps/mobile', stdout=log, stderr=subprocess.STDOUT, check=True)
apk = ROOT/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'
tested_apk_sha256 = hashlib.sha256(apk.read_bytes()).hexdigest()
adb('install','-r',str(apk)); adb('shell','pm','clear',PACKAGE)
adb('shell','am','start','-n',PACKAGE+'/.MainActivity'); wait('Đăng nhập để bắt đầu')
tenant=state['tenants'][0]
for index,value in enumerate([tenant['code'],tenant['technician'],state['password']]):
    fields=[n for n in tree().iter('node') if n.get('class') == 'android.widget.EditText']
    tap(fields[index]); write(value,clear=index==0); hide_keyboard()
click('Đăng nhập'); wait('Hôm nay của bạn')
orders=state['orders']
open_job(orders['inProgress']['number']); files_tab()
click('Chụp ảnh'); allow_camera()
old_pid=adb('shell','pidof',PACKAGE).strip()
assert old_pid, 'App must be alive before simulated background process death'
adb('shell','am','kill',PACKAGE); time.sleep(1)
remaining=adb('shell','sh','-c','pidof '+PACKAGE+' || true').strip()
assert old_pid not in remaining.split(), 'Android must kill the background app while camera is frontmost'
tap(resource('shutter_button')); time.sleep(1)
tap(resource('done_button'))
wait('Hôm nay của bạn'); screenshot('camera-process-recovered')
open_job(orders['inProgress']['number']); files_tab()
wait('Đang lưu trên máy'); screenshot('recovered-preview')
assert api('GET','/__test/stats')['puts'] == 0, 'Recovery must not upload automatically'
api('POST','/__test/control',body={'mode':'dropComplete'})
click('Tải tệp lên'); wait('Kiểm tra và tiếp tục lần tải'); screenshot('uncertain-finalize')
first=api('GET','/__test/stats')
assert first['puts']==1 and len(first['complete'])==1
restart(); open_job(orders['inProgress']['number']); files_tab()
wait('Kiểm tra và tiếp tục lần tải'); screenshot('restart-keeps-receipt')
click('Kiểm tra và tiếp tục lần tải'); wait('Đã đính kèm'); screenshot('confirmed-without-duplicate')
second=api('GET','/__test/stats')
assert second['puts']==1 and len(second['complete'])==1 and len(set(second['prepare']))==1
assert not second['bearerToStorage']
token=api('POST','/api/identity/auth/login',body={'tenantCode':tenant['code'],'email':tenant['technician'],'password':state['password']})['accessToken']
wo=api('GET','/api/workorders/work-orders/'+orders['inProgress']['id']+'/attachments?page=1&pageSize=100',token)
assert len(wo['items'])==1 and wo['items'][0]['mimeType']=='image/jpeg'
print('Android: process death during camera, durable preview, lost finalization and duplicate prevention PASS.',flush=True)

# A report attachment is a separate parent after WO completion.
pdf=ART/'m4-proof.pdf'; pdf.write_bytes(b'%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n')
adb('push',str(pdf),'/sdcard/Download/m4-proof.pdf')
back_to_jobs(); open_job(orders['partsCompleted']['number'],history=True); files_tab()
# Choose the report section's PDF action, not WO evidence.
buttons=[n for n in tree().iter('node') if label(n)=='Chọn tệp']
if len(buttons)<1: node('Tệp của báo cáo',partial=True)
buttons=[n for n in tree().iter('node') if label(n)=='Chọn tệp']
tap(buttons[-1]); time.sleep(1)
downloads()
tap(node('m4-proof.pdf',partial=True)); wait('Đang lưu trên máy')
screenshot('report-pdf-preview')
click('Tải tệp lên'); wait('Đã đính kèm m4-proof.pdf.'); screenshot('report-pdf-confirmed')
report=api('GET','/api/workorders/work-orders/'+orders['partsCompleted']['id']+'/service-report/attachments?page=1&pageSize=100',token)
assert len(report['items'])==1 and report['items'][0]['mimeType']=='application/pdf'
back_to_jobs(); open_job(orders['inProgress']['number']); files_tab()
click('Chọn tệp'); downloads()
tap(node('m4-proof.pdf',partial=True)); wait('Đang lưu trên máy')
api('POST','/__test/control',body={'mode':'slowPut'})
click('Tải tệp lên'); click('Dừng và giữ tệp')
wait('Kiểm tra và tiếp tục lần tải'); screenshot('paused-keeps-receipt')
click('Hủy lần tải'); click('Xác nhận'); wait('Đã xử lý hủy lần tải.')
screenshot('abort-confirmed')
api('POST','/__test/control',body={'mode':'none'})
remaining=api('GET','/api/workorders/work-orders/'+orders['inProgress']['id']+'/attachments?page=1&pageSize=100',token)
assert len(remaining['items'])==1, 'Paused/cancelled intent must not become a second attachment'
stats=api('GET','/__test/stats'); assert not stats['bearerToStorage']
assert stats['abort']==1 and len(stats['complete'])==2
evidence={'status':'PASS','baseCommit':state['baseCommit'],'testedApkSha256':tested_apk_sha256,'device':a.device,
 'cases':['real Identity and private MinIO','process killed while external camera open','lost picker result restored to original owner and WO',
 'recovered preview never auto-uploaded','server committed but complete response lost','receipt survived application restart',
 'same prepare key reconciles existing metadata without second PUT or finalize','PDF uploaded to completed service report',
 'pause keeps file and receipt','explicit cancel aborts server intent without extra attachment','no API bearer sent to storage'],
 'network':{'prepareRequests':len(stats['prepare']),'distinctPrepareKeys':len(set(stats['prepare'])),'completeRequests':len(stats['complete']),'puts':stats['puts'],'aborts':stats['abort'],'bearerToStorage':stats['bearerToStorage']},
 'screenshots':[p.name for p in ART.glob('*.png')]}
(ART/'results.json').write_text(json.dumps(evidence,indent=2))
print('PASS Android: camera recovery, uncertain upload, exact parent metadata and report PDF verified.',flush=True)
