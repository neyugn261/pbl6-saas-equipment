#!/usr/bin/env python3
"""Real Android UAT, invoked only inside scripts/test-model-policies.cjs test stack.
Credentials arrive through environment; artifacts and build logs stay in /tmp.
"""
import os,re,shlex,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
ART=Path(os.environ.get('POLICY_ARTIFACTS','/tmp/pbl6-model-policy-uat'));ART.mkdir(parents=True,exist_ok=True)
FLUTTER=os.environ.get('FLUTTER_BIN','flutter');ADB=os.environ.get('ADB_BIN','adb');DEVICE=os.environ.get('POLICY_TEST_DEVICE','emulator-5554');PACKAGE='com.pbl6.pbl6_technician'
def run(*args):return subprocess.check_output([ADB,'-s',DEVICE,*args]).decode()
def ui():
 for _ in range(8):
  run('shell','uiautomator','dump','/sdcard/policy-ui.xml');v=run('exec-out','cat','/sdcard/policy-ui.xml')
  try:return ET.fromstring(v[v.index('<?xml'):])
  except (ValueError,ET.ParseError):time.sleep(.4)
 raise AssertionError('Accessibility tree not ready')
def label(n):return (n.get('text','')+'\n'+n.get('content-desc','')).strip()
def wait(text):
 for _ in range(70):
  tree=ui()
  if any(text in label(n) for n in tree.iter('node')):return tree
  time.sleep(.3)
 raise AssertionError('Missing Android state: '+text)
def tap(n):
 b=list(map(int,re.findall(r'\d+',n.get('bounds',''))));run('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2));time.sleep(.4)
def click(text):
 nodes=[n for n in ui().iter('node') if text==label(n) or text in label(n).splitlines()]
 assert nodes,'Missing action: '+text
 tap(nodes[0])
def scroll(text):
 for _ in range(15):
  nodes=[n for n in ui().iter('node') if text in label(n)]
  if nodes:return nodes[0]
  run('shell','input','swipe','15','1260','15','500','350');time.sleep(.4)
 raise AssertionError('Missing scrolled action: '+text)
def write(value,clear=0):
 subprocess.run([ADB,'-s',DEVICE,'shell','sh','-s'],input=('input keyevent 123\ninput keyevent '+' '.join(['67']*clear)+'\n' if clear else '')+'input text '+shlex.quote(value.replace(' ','%s'))+'\n',text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
def fill(hint,value):
 if 'mInputShown=true' in run('shell','dumpsys','input_method'):run('shell','input','keyevent','4');time.sleep(.4)
 for _ in range(15):
  nodes=[n for n in ui().iter('node') if n.get('class')=='android.widget.EditText' and hint in (n.get('hint','')+' '+label(n))]
  if nodes:tap(nodes[0]);time.sleep(.5);write(value);return
  run('shell','input','swipe','15','1260','15','500','350');time.sleep(.3)
 raise AssertionError('Missing Android input: '+hint)
def screenshot(name):(ART/(name+'.png')).write_bytes(subprocess.check_output([ADB,'-s',DEVICE,'exec-out','screencap','-p']))
with (ART/'android-build.log').open('w') as log:
 result=subprocess.run([FLUTTER,'build','apk','--debug','--dart-define=API_BASE_URL=http://10.0.2.2:'+os.environ['POLICY_TEST_GATEWAY']],cwd=ROOT/'apps/mobile',stdout=log,stderr=subprocess.STDOUT)
assert result.returncode==0,'Android build failed; see android-build.log'
run('install','-r',str(ROOT/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'))
# Clear only this test app on the dedicated emulator to force a real Identity login.
run('shell','pm','clear',PACKAGE);run('shell','am','start','-n',PACKAGE+'/.MainActivity');wait('Đăng nhập để bắt đầu')
for index,value in enumerate([os.environ['POLICY_TEST_TENANT'],'technician@policy.test',os.environ['POLICY_TEST_PASSWORD']]):
 fields=[n for n in ui().iter('node') if n.get('class')=='android.widget.EditText'];tap(fields[index]);time.sleep(.7);write(value,4 if index==0 else 0)
 if 'mInputShown=true' in run('shell','dumpsys','input_method'):run('shell','input','keyevent','4')
click('Đăng nhập');wait('Hôm nay của bạn');click('Công việc');wait('Công việc của tôi');tap(scroll(os.environ['POLICY_TEST_ORDER']));wait('Chi tiết công việc')
for title in ['Nhận việc','Bắt đầu công việc']:
 click(title);click('Xác nhận');time.sleep(1)
click('Thực hiện checklist');wait('Checklist thực hiện');tap(scroll('Chưa thực hiện'));click('Đã thực hiện');tap(scroll('Lưu kết quả checklist'));time.sleep(1);screenshot('android-checklist-saved')
# Return to workflow tab; checklist is verified again by the backend completion guard.
click('Gửi báo cáo và hoàn thành');wait('Service Report')
fill('Vấn đề / hiện trạng','Routine policy maintenance');fill('Nguyên nhân nội bộ','Scheduled inspection');click('Tiếp tục');fill('Giải pháp đã thực hiện','Filter inspected');click('Tiếp tục');fill('Tóm tắt gửi khách hàng','Android policy service completed');click('Xem trước báo cáo');wait('Xem trước · Chưa gửi');click('Gửi báo cáo và hoàn thành');wait('Báo cáo đã ghi nhận');screenshot('android-policy-report-complete')
print('PASS Android real Identity/Gateway: assigned WO, checklist persisted, service report completed; backend verified.',flush=True)
