"""Private runtime/API helpers for disposable N6 acceptance only."""
from pathlib import Path
import json, os, urllib.request, urllib.error
RUNTIME = Path(os.environ.get('PBL6_N6_RUNTIME_DIR', f'/tmp/pbl6-mobile-n6-{os.getuid()}'))
STATE = RUNTIME / 'runtime.json'

def state():
    data = json.loads(STATE.read_text())
    if data['gateway'] != 'http://127.0.0.1:13000' or not all('_test_db' in data['env'][k+'_DATABASE_URL'] for k in ['IDENTITY','ORGANIZATION','ASSET','SERVICE_REQUEST','WORKORDER','MAINTENANCE']):
        raise RuntimeError('N6 requires its isolated test runtime')
    return data

def update(**values):
    data = state(); data.update(values); STATE.write_text(json.dumps(data))

class Api:
    def __init__(self):
        self.runtime = state()
        self.tokens = {}
    def call(self, method, path, token=None, body=None, expected=200):
        headers = {'content-type':'application/json'}
        if token: headers['authorization'] = 'Bearer '+token
        request=urllib.request.Request(self.runtime['gateway']+path, method=method, headers=headers,
            data=json.dumps(body).encode() if body is not None else (b'{}' if method=='POST' else None))
        try:
            with urllib.request.urlopen(request,timeout=15) as response:
                status=response.status; data=json.load(response) if status!=204 else None
        except urllib.error.HTTPError as error:
            status=error.code
            try: data=json.load(error)
            except Exception: data={}
        if status==401 and method=='GET' and token in self.tokens:
            return self.call(method,path,self.login(self.tokens[token]),body,expected)
        if status!=expected:
            raise AssertionError(f'{method} {path}: HTTP {status}, expected {expected}, code {data.get("code", "UNKNOWN")}')
        return data
    def login(self,email):
        token=self.call('POST','/api/identity/auth/login',body={'tenantCode':'DEMO','email':email,'password':self.runtime['password']})['accessToken']
        self.tokens[token]=email
        return token
