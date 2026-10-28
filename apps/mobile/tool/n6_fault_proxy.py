#!/usr/bin/env python3
"""Forward mobile -> real Gateway. Drop one successful note and complete response as 503.
No request bodies, Authorization headers or token responses are logged.
"""
import http.client, json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from n6_common import RUNTIME, state, update
lock=threading.Lock()
counts={}
class Proxy(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self): self.forward()
    def do_POST(self): self.forward()
    def forward(self):
        body=self.rfile.read(int(self.headers.get('content-length','0')))
        headers={k:v for k,v in self.headers.items() if k.lower() not in ['host','connection','content-length','transfer-encoding']}
        connection=http.client.HTTPConnection('127.0.0.1',13000,timeout=20)
        try:
            connection.request(self.command,self.path,body or None,headers)
            response=connection.getresponse(); content=response.read(); status=response.status
            if self.command=='POST' and '/work-orders/' in self.path:
                with lock:
                    counts[self.path]=counts.get(self.path,0)+1
                    (RUNTIME/'mobile-post-counts.json').write_text(json.dumps(counts))
                    current=state()
                    fault = 'lostCompleteResponse' if self.path.endswith('/complete') else 'lostLogResponse' if self.path.endswith('/logs') else None
                    if fault and '/'+current.get('workOrderId','missing')+'/' in self.path and 200<=status<300 and not current.get(fault):
                        update(**{fault:True})
                        content=b'{"code":"N6_LOST_RESPONSE"}';status=503
            self.send_response(status)
            self.send_header('content-type',response.getheader('content-type','application/json'))
            self.send_header('content-length',str(len(content)));self.end_headers();self.wfile.write(content)
        finally: connection.close()
if __name__=='__main__':
    state()
    print('N6 mobile transport relay ready on 13100; one note and complete response will be lost after commit.',flush=True)
    ThreadingHTTPServer(('127.0.0.1',13100),Proxy).serve_forever()
