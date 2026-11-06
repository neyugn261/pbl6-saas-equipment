#!/usr/bin/env python3
"""Native notification UAT against stage02_fixture.cjs --serve only.
Use a disposable emulator; --reset-test-app explicitly clears only the test app.
Runtime credentials are read from the private fixture file and never printed.
"""
import argparse, hashlib, json, os, re, shlex, subprocess, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runtime', default='/tmp/pbl6-mobile-stage02-runtime.json')
p.add_argument('--device', required=True)
p.add_argument('--reset-test-app', action='store_true')
a = p.parse_args()
state = json.loads(Path(a.runtime).read_text())
assert state['status'] == 'READY' and state['gateway'].startswith('http://127.0.0.1:'), 'Use the running dedicated stage 2 test fixture'
assert a.reset_test_app, 'Use --reset-test-app on a disposable emulator to opt into clearing this app'
ADB = os.environ.get('ADB_BIN', 'adb')
PACKAGE = 'com.pbl6.pbl6_technician'
ART = Path('/tmp/pbl6-mobile-stage02-android'); ART.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output([ADB, '-s', a.device, *args], stderr=subprocess.DEVNULL).decode()
assert a.device.startswith('emulator-') and adb('shell', 'getprop', 'ro.kernel.qemu').strip() == '1', 'Use a disposable Android emulator, not a physical phone'
def tree():
    for _ in range(8):
        adb('shell', 'uiautomator', 'dump', '/sdcard/m02-ui.xml')
        raw = adb('exec-out', 'cat', '/sdcard/m02-ui.xml')
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
        fields = [n for n in tree().iter('node') if n.get('class') == 'android.widget.EditText' and hint in (n.get('hint', '') + ' ' + label(n))]
        if fields: tap(fields[0]); write(value); hide_keyboard(); return
        adb('shell', 'input', 'swipe', '15', '1200', '15', '450', '300'); time.sleep(.3)
    raise AssertionError('Missing input: ' + hint)
def screenshot(name): (ART/(name+'.png')).write_bytes(subprocess.check_output([ADB, '-s', a.device, 'exec-out', 'screencap', '-p']))
def restart():
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE+'/.MainActivity')
    wait('Hôm nay của bạn')
def open_job(number):
    click('Công việc'); wait('Công việc của tôi'); fill('Mã WO', number)
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
token = api('POST', '/api/identity/auth/login', body={'tenantCode': tenant['code'], 'email': tenant['technician'], 'password': state['password']})['accessToken']
initial_count = api('GET', '/api/notifications/unread-count', token)['unreadCount']
assert initial_count == 21
wait('Thông báo · 21 chưa đọc'); screenshot('badge-before')
tap(node('Thông báo · 21 chưa đọc', partial=True)); wait('21 thông báo chưa đọc'); screenshot('inbox')
click('Chưa đọc'); click('Đánh dấu đã đọc'); wait('20 thông báo chưa đọc')
notice = api('GET', '/api/notifications?page=1&pageSize=20&readStatus=UNREAD', token)['items'][0]
click(notice['body']); wait('Chi tiết thông báo'); wait('Đã đọc'); screenshot('notice-read')
assert api('GET', '/api/notifications?readStatus=READ', token)['total'] == 3
click('Xem công việc'); wait('Chi tiết công việc'); screenshot('work-order-link')
for _ in range(3): adb('shell', 'input', 'keyevent', '4'); time.sleep(.5)
wait('Hôm nay của bạn'); wait('Thông báo · 19 chưa đọc')
adb('shell', 'input', 'keyevent', '3'); time.sleep(.5)
manager = api('POST', '/api/identity/auth/login', body={'tenantCode': tenant['code'], 'email': tenant['manager'], 'password': state['password']})['accessToken']
profile = api('GET', '/api/workorders/technicians/me', token)
api('POST', '/api/workorders/work-orders/'+state['orders']['hidden']['id']+'/assign', manager, {'technicianId': profile['id']})
for _ in range(40):
    if api('GET', '/api/notifications/unread-count', token)['unreadCount'] == 20: break
    time.sleep(.2)
else: raise AssertionError('New assignment notification was not received')
adb('shell', 'am', 'start', '-n', PACKAGE+'/.MainActivity'); wait('Thông báo · 20 chưa đọc'); screenshot('badge-foreground')
evidence = {'status': 'PASS', 'baseCommit': state['baseCommit'], 'testedApkSha256': tested_apk_sha256,
    'device': a.device, 'cases': ['real Identity login', 'unread badge equals server count', 'real inbox and unread filter',
    'explicit mark-read refreshes exact count', 'opening notice marks read', 'WO link reauthorized through Gateway',
    'new assignment through real outbox and RabbitMQ while app backgrounded', 'foreground refresh updates badge'],
    'fixtureChecks': state['notifications'], 'screenshots': ['badge-before.png', 'inbox.png', 'notice-read.png', 'work-order-link.png', 'badge-foreground.png']}
(ART/'results.json').write_text(json.dumps(evidence, indent=2))
print('PASS Android: real Notification inbox, badge, mark-read, authorized WO link and foreground delivery verified through Gateway.')
