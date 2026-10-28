#!/usr/bin/env python3
"""Install only the explicit N6 relay build; preserve app data for other origins."""
from pathlib import Path
import hashlib, os, shutil, subprocess, sys, zipfile
from n6_common import RUNTIME, state, update
root=Path(__file__).resolve().parents[3]
apk=Path(sys.argv[1]) if len(sys.argv)>1 else root/'apps/mobile/build/app/outputs/flutter-apk/app-debug.apk'
state()
with zipfile.ZipFile(apk) as archive:
    kernel=archive.read('assets/flutter_assets/kernel_blob.bin')
    if b'http://10.0.2.2:13100' not in kernel or b'WorkOrderWorkflow' not in kernel:
        raise SystemExit('Refusing non-N6 APK. Build lib/main.dart debug with API_BASE_URL=http://10.0.2.2:13100 first.')
target=RUNTIME/'app-n6-debug.apk';shutil.copy2(apk,target)
digest=hashlib.sha256(target.read_bytes()).hexdigest()
adb=os.environ.get('ANDROID_HOME',str(Path.home()/'Android/Sdk'))+'/platform-tools/adb'
device=os.environ.get('PBL6_N6_DEVICE','emulator-5554')
subprocess.run([adb,'-s',device,'install','-r',str(target)],check=True)
update(apkSha256=digest)
print('N6 relay APK installed; digest recorded for UI safety checks. Existing storage was preserved.')
