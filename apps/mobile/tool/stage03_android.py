#!/usr/bin/env python3
"""Native read-only Work Order parts UAT against stage03_fixture.cjs --serve only.
Use a disposable emulator; --reset-test-app explicitly clears only the test app.
Runtime credentials are read from the private fixture file and never printed.
"""
import argparse, hashlib, json, os, re, shlex, subprocess, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runtime', default='/tmp/pbl6-mobile-stage03-runtime.json')
p.add_argument('--device', required=True)
p.add_argument('--reset-test-app', action='store_true')
a = p.parse_args()
state = json.loads(Path(a.runtime).read_text())
assert state['status'] == 'READY' and state['gateway'].startswith('http://127.0.0.1:'), 'Use the running dedicated stage 3 test fixture'
assert a.reset_test_app, 'Use --reset-test-app on a disposable emulator to opt into clearing this app'
ADB = os.environ.get('ADB_BIN', 'adb')
PACKAGE = 'com.pbl6.pbl6_technician'
ART = Path('/tmp/pbl6-mobile-stage03-android'); ART.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output([ADB, '-s', a.device, *args], stderr=subprocess.DEVNULL).decode()
assert a.device.startswith('emulator-') and adb('shell', 'getprop', 'ro.kernel.qemu').strip() == '1', 'Use a disposable Android emulator, not a physical phone'
def tree():
    for _ in range(8):
        adb('shell', 'uiautomator', 'dump', '/sdcard/m03-ui.xml')
        raw = adb('exec-out', 'cat', '/sdcard/m03-ui.xml')
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

port = state['gateway'].rsplit(':', 1)[1]
with (ART/'build.log').open('w') as log:
    subprocess.run(['flutter', 'build', 'apk', '--debug', '--no-pub', '--dart-define=API_BASE_URL=http://10.0.2.2:'+port], cwd=ROOT/'apps/mobile', stdout=log, stderr=subprocess.STDOUT, check=True)
apk = ROOT/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'
tested_apk_sha256 = hashlib.sha256(apk.read_bytes()).hexdigest()
adb('install', '-r', str(apk))
adb('shell', 'pm', 'clear', PACKAGE)
adb('shell', 'am', 'start', '-n', PACKAGE+'/.MainActivity'); wait('Đăng nhập để bắt đầu')
tenant = state['tenants'][0]
for index, value in enumerate([tenant['code'], tenant['technician'], state['password']]):
    fields = [n for n in tree().iter('node') if n.get('class') == 'android.widget.EditText']
    tap(fields[index]); write(value, clear=index == 0); hide_keyboard()
click('Đăng nhập'); wait('Hôm nay của bạn')
def parts_tab():
    for _ in range(4):
        nodes = list(tree().iter('node'))
        candidates = [n for n in nodes if 'Phụ tùng' in label(n).splitlines() and len(bounds(n)) == 4]
        if candidates: tap(candidates[0]); time.sleep(.5); return
        anchor = next(n for n in nodes if any(v in label(n).splitlines() for v in ['Tổng quan', 'Hoạt động', 'Báo cáo']) and len(bounds(n)) == 4)
        b=bounds(anchor); y=str((b[1]+b[3])//2)
        adb('shell','input','swipe','640',y,'100',y,'300')
    raise AssertionError('Parts tab not visible')
def back_to_jobs():
    adb('shell','input','keyevent','4'); wait('Công việc của tôi')
def scroll_top():
    for _ in range(8):
        # Stop before overscroll triggers the screen's pull-to-refresh.
        if any(any(v in label(n).splitlines() for v in ['Công việc của tôi', 'Tổng quan']) and len(bounds(n)) == 4 for n in tree().iter('node')): return
        adb('shell','input','swipe','15','450','15','1350','250')

token = api('POST', '/api/identity/auth/login', body={'tenantCode': tenant['code'], 'email': tenant['technician'], 'password': state['password']})['accessToken']
orders=state['orders']
open_job(orders['inProgress']['number']); parts_tab(); wait('Dau bao tri luc cap')
tap(node('Dau bao tri luc cap', partial=True)); node('Đã xác nhận dùng', partial=True); screenshot('issued-returned')
node('0.50 · Hư hỏng', partial=True); screenshot('return-history')
print('Android: running WO quantities and return conditions verified.', flush=True)
scroll_top()
tap(node('Phụ tùng chưa có tên lưu tại lúc cấp', partial=True)); node('chưa được lưu đầy đủ', partial=True); screenshot('legacy-metadata')
print('Android: legacy metadata verified.', flush=True)
back_to_jobs(); open_job(orders['partsCompleted']['number'], history=True); parts_tab()
tap(node('Dau bao tri luc cap', partial=True)); node('Đã xác nhận dùng', partial=True); screenshot('confirmed-quantities')
node('Đính chính xác nhận', partial=True); screenshot('confirmation-history')
print('Android: completed WO and confirmation reversal verified.', flush=True)
back_to_jobs(); open_job(orders['partsCancelled']['number'], history=True); parts_tab()
tap(node('Vong dem luc cap', partial=True)); node('1.00 · Chờ kiểm tra', partial=True); screenshot('cancelled-return')
back_to_jobs(); open_job(orders['assigned']['number']); parts_tab(); wait('Chưa có phụ tùng được cấp cho công việc này.'); screenshot('empty-parts')
rows=api('GET','/api/inventory/work-orders/'+orders['inProgress']['id']+'/parts', token)
oil=next(row for row in rows if row['id']==state['parts']['runningUsageId'])
assert oil['quantityIssued']=='5.50' and oil['quantityReturned']=='1.75' and oil['quantityConfirmedUsed']=='0.00'
assert oil['partSnapshot']['name']=='Dau bao tri luc cap'
history=api('GET','/api/inventory/work-orders/'+orders['partsCompleted']['id']+'/parts',token)[0]
assert history['quantityConfirmedUsed']=='1.50' and history['quantityOutstanding']=='3.00' and len(history['confirmations'])==3
evidence={'status':'PASS','baseCommit':state['baseCommit'],'testedApkSha256':tested_apk_sha256,'device':a.device,
  'cases':['real Identity login','scoped WO parts displayed','historical names survive catalogue changes','issued/returned/confirmed remain distinct',
  'good and damaged return history','missing legacy metadata explicitly shown','completed use confirmations and reversal','cancelled return pending inspection','true empty WO'],
  'fixtureChecks':state['parts'],'screenshots':['issued-returned.png','return-history.png','legacy-metadata.png','confirmed-quantities.png','confirmation-history.png','cancelled-return.png','empty-parts.png']}
(ART/'results.json').write_text(json.dumps(evidence,indent=2))
print('PASS Android: read-only WO parts, exact quantities, historical labels, returns, confirmations/reversal, cancelled history and empty state verified.')
