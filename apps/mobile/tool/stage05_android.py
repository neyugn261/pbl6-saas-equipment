#!/usr/bin/env python3
"""Native schedule/profile/appearance UAT against stage05_fixture.cjs --serve only.
Use a disposable emulator; --reset-test-app explicitly clears only the test app.
Runtime credentials are read from the private fixture file and never printed.
"""
import argparse, hashlib, json, os, re, shlex, subprocess, time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runtime', default='/tmp/pbl6-mobile-stage05-runtime.json')
p.add_argument('--device', required=True)
p.add_argument('--reset-test-app', action='store_true')
p.add_argument('--reuse-test-apk', action='store_true', help='Use APK already built for this fixture origin')
a = p.parse_args()
state = json.loads(Path(a.runtime).read_text())
assert state['status'] == 'READY' and state['gateway'].startswith('http://127.0.0.1:'), 'Use the running dedicated stage 5 test fixture'
assert a.reset_test_app, 'Use --reset-test-app on a disposable emulator to opt into clearing this app'
ADB = os.environ.get('ADB_BIN', 'adb')
PACKAGE = 'com.pbl6.pbl6_technician'
ART = Path('/tmp/pbl6-mobile-stage05-android'); ART.mkdir(exist_ok=True)

def adb(*args):
    return subprocess.check_output([ADB, '-s', a.device, *args], stderr=subprocess.DEVNULL).decode()
assert a.device.startswith('emulator-') and adb('shell', 'getprop', 'ro.kernel.qemu').strip() == '1', 'Use a disposable Android emulator, not a physical phone'
def tree():
    for _ in range(8):
        adb('shell', 'uiautomator', 'dump', '/sdcard/m05-ui.xml')
        raw = adb('exec-out', 'cat', '/sdcard/m05-ui.xml')
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
def scroll_top():
    for _ in range(30):
        if any(any(v in label(n).splitlines() for v in ['Công việc của tôi','Lịch công việc','Cá nhân','Hôm nay của bạn']) and 'Tab ' not in label(n) and len(bounds(n))==4 and bounds(n)[3]>bounds(n)[1] for n in tree().iter('node')): return
        adb('shell','input','swipe','15','450','15','1350','250')
def back():
    adb('shell','input','keyevent','4'); time.sleep(.5)
def assert_query(value):
    assert any(value in n.get('text','') for n in tree().iter('node') if n.get('class')=='android.widget.EditText'), 'Search query lost'
def assert_dark(name, dark):
    from PIL import Image
    for _ in range(15):
        screenshot(name)
        pixel=Image.open(ART/(name+'.png')).convert('RGB').getpixel((12,300))
        if (max(pixel)<90 if dark else min(pixel)>200): return
        time.sleep(.3)
    raise AssertionError('Unexpected appearance after theme animation')

port=state['gateway'].rsplit(':',1)[1]
if not a.reuse_test_apk:
    with (ART/'build.log').open('w') as log:
        subprocess.run(['flutter','build','apk','--debug','--no-pub','--dart-define=API_BASE_URL=http://10.0.2.2:'+port],cwd=ROOT/'apps/mobile',stdout=log,stderr=subprocess.STDOUT,check=True)
apk=ROOT/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'
tested_apk_sha256=hashlib.sha256(apk.read_bytes()).hexdigest()
adb('install','-r',str(apk));adb('shell','pm','clear',PACKAGE)
adb('shell','am','start','-n',PACKAGE+'/.MainActivity');wait('Đăng nhập để bắt đầu')
tenant=state['tenants'][0];orders=state['orders']
for i,value in enumerate([tenant['code'],tenant['technician'],state['password']]):
    fields=[n for n in tree().iter('node') if n.get('class')=='android.widget.EditText']
    tap(fields[i]);write(value,clear=i==0);hide_keyboard()
click('Đăng nhập');wait('Hôm nay của bạn')
click('Công việc');wait('Công việc của tôi');click('Lịch sử');fill('Mã WO',orders['completed']['number'])
scroll_top();click('Tải lại');wait(orders['completed']['number']);assert_query(orders['completed']['number']);screenshot('history-filter-refresh')
tap(node(orders['completed']['number'],partial=True));wait('Chi tiết công việc');back();wait('Công việc của tôi');assert_query(orders['completed']['number'])
adb('shell','input','keyevent','3');adb('shell','am','start','-n',PACKAGE+'/.MainActivity');wait('Công việc của tôi');assert_query(orders['completed']['number'])
print('Android: history/search survive refresh, detail and foreground PASS.',flush=True)
click('Cá nhân');wait('Cá nhân');click('Giao diện');wait('Theo hệ thống');click('Tối');assert_dark('dark-appearance',True)
back();wait('Cá nhân');click('Thông tin ứng dụng')
package=adb('shell','dumpsys','package',PACKAGE)
version=re.search(r'versionName=([^\s]+)',package).group(1);build=re.search(r'versionCode=(\d+)',package).group(1)
wait(version);node(build);screenshot('installed-version')
back();click('Hướng dẫn sử dụng');wait('Nhận và thực hiện công việc');screenshot('help');back()
restart();assert_dark('restart-dark-home',True)
print('Android: persisted dark theme, help and actual installed version PASS.',flush=True)

click('Lịch');wait('Lịch công việc');click('Tháng')
today=state['calendar']['today'];year,month,day=today.split('-');date=f'{day}/{month}/{year}'
tap(node(date+' · ',partial=True));wait('Công việc ngày '+date+' · 1')
click('Bao gồm lịch sử cá nhân');wait('Công việc ngày '+date+' · 2');screenshot('month-day-history')
scroll_top();click('Tải lại');wait('Công việc ngày '+date+' · 2')
tap(node(orders['inProgress']['number'],partial=True));wait('Chi tiết công việc');back();node('Công việc ngày '+date+' · 2',partial=True)
scroll_top();click('Tuần');screenshot('week-agenda');click('Ngày');screenshot('day-agenda')
click('Cá nhân');click('Giao diện');click('Theo hệ thống')
adb('shell','cmd','uimode','night','yes');time.sleep(1);assert_dark('system-dark',True)
adb('shell','cmd','uimode','night','no');time.sleep(1);assert_dark('system-light',False)
click('Tối');back();click('Đăng xuất');wait('Đăng xuất khỏi ứng dụng?');screenshot('logout-drafts-policy')
click('Ở lại');wait('Cá nhân');click('Đăng xuất');click('Đăng xuất');wait('Đăng nhập để bắt đầu');assert_dark('dark-login-after-logout',True)
result={'status':'PASS','baseCommit':state['baseCommit'],'testedApkSha256':tested_apk_sha256,'device':a.device,
 'version':{'name':version,'build':build},'businessDay':today,
 'cases':['real Identity login','history and query survive refresh','return from WO preserves filters','foreground preserves filters',
 'dark appearance persisted across process restart','version read from installed Android package','help accessible',
 'month grid/day focus and historical count','calendar selection survives refresh and detail','week and day agenda',
 'system appearance follows Android night mode','cancel logout keeps session','logout confirmation explains local drafts','appearance preserved on login'],
 'screenshots':sorted(p.name for p in ART.glob('*.png'))}
(ART/'results.json').write_text(json.dumps(result,indent=2))
print('PASS Android: schedule, read-only profile, preferences, lifecycle and logout verified.',flush=True)
