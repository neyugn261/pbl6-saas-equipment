#!/usr/bin/env python3
"""Disposable N6 stack. Builds a detached worktree, never the running dev services.
Usage: python3 apps/mobile/tool/n6_stack.py start|stop|status
Secrets stay in a local 0600 runtime record, never printed or committed.
"""
from pathlib import Path
import argparse, json, os, secrets, signal, socket, subprocess, sys, time, urllib.request

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = Path(os.environ.get('PBL6_N6_RUNTIME_DIR', f'/tmp/pbl6-mobile-n6-{os.getuid()}'))
STATE = RUNTIME / 'runtime.json'
SERVICES = {'IDENTITY': ('identity-service', 13001), 'ORGANIZATION': ('organization-service', 13006),
            'ASSET': ('asset-service', 13002), 'SERVICE_REQUEST': ('service-request-service', 13007),
            'WORKORDER': ('workorder-service', 13004), 'MAINTENANCE': ('maintenance-service', 13003)}

def save(data):
    STATE.touch(mode=0o600, exist_ok=True)
    os.chmod(STATE, 0o600)
    STATE.write_text(json.dumps(data))

def command(args, env, cwd, log):
    subprocess.run(args, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, check=True)

def wait_health(port):
    for _ in range(60):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f'Service health timeout on port {port}; inspect private runtime logs')

def start():
    if STATE.exists():
        raise SystemExit('Runtime already exists. Inspect status or stop it first.')
    for port in [13000, 13001, 13002, 13003, 13004, 13006, 13007, 13100, 15173, 15434, 15674]:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    RUNTIME.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(RUNTIME, 0o700)
    checkout = RUNTIME / 'backend'
    env = os.environ.copy()
    for line in (ROOT / '.env.example').read_text().splitlines():
        if line and not line.lstrip().startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip().strip('"')
    password, db_password, broker_password = (secrets.token_hex(16) for _ in range(3))
    env.update(NODE_ENV='test', JWT_ACCESS_SECRET=secrets.token_hex(32), JWT_ACCESS_TTL_SECONDS='300',
               SEED_DEMO_PASSWORD=password, BCRYPT_COST='4', IDENTITY_EXPOSE_ACTIVATION_TOKEN='true', API_GATEWAY_PORT='13000', LOGIN_RATE_LIMIT='200',
               GATEWAY_URL='http://127.0.0.1:13000', GATEWAY_PROXY_TARGET='http://127.0.0.1:13000',
               VITE_M1_API_MODE='live', MAINTENANCE_SCHEDULER_ENABLED='false',
               RABBITMQ_URL=f'amqp://pbl6:{broker_password}@127.0.0.1:15674', ASSET_QR_PORTAL_BASE_URL='http://localhost:15173')
    for key in ['IDENTITY', 'ORGANIZATION', 'ASSET', 'SERVICE_REQUEST', 'WORKORDER', 'MAINTENANCE', 'INVENTORY', 'NOTIFICATION']:
        env[key + '_SERVICE_URL'] = 'http://127.0.0.1:' + str(SERVICES.get(key, ('', 1))[1])
    for key, (_, port) in SERVICES.items():
        env[key + '_SERVICE_PORT'] = str(port)
        env[key + '_DATABASE_URL'] = f'postgresql://pbl6:{db_password}@127.0.0.1:15434/{key.lower()}_mobile_n6_test_db'
    containers = [f'pbl6-mobile-n6-{os.getuid()}-postgres', f'pbl6-mobile-n6-{os.getuid()}-rabbitmq']
    data = {'env': env, 'password': password, 'pids': [], 'containers': containers,
            'worktree': str(checkout), 'gateway': env['GATEWAY_URL'], 'web': 'http://127.0.0.1:15173',
            'backendCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()}
    save(data)
    with (RUNTIME / 'setup.log').open('w') as log:
        command(['git', 'worktree', 'add', '--detach', str(checkout), 'HEAD'], env, ROOT, log)
        for folder in ['node_modules', *['apps/' + app + '/node_modules' for app in [v[0] for v in SERVICES.values()] + ['api-gateway', 'web']]]:
            (checkout / folder).symlink_to(ROOT / folder, target_is_directory=True)
        pg_image = subprocess.check_output(['docker', 'inspect', 'pbl6-postgres', '--format', '{{.Config.Image}}'], text=True).strip()
        broker_image = subprocess.check_output(['docker', 'inspect', 'pbl6-rabbitmq', '--format', '{{.Config.Image}}'], text=True).strip()
        command(['docker', 'run', '-d', '--rm', '--name', containers[0], '-p', '127.0.0.1:15434:5432', '-e', 'POSTGRES_USER=pbl6', '-e', 'POSTGRES_PASSWORD=' + db_password, pg_image], env, ROOT, log)
        command(['docker', 'run', '-d', '--rm', '--name', containers[1], '-p', '127.0.0.1:15674:5672', '-e', 'RABBITMQ_DEFAULT_USER=pbl6', '-e', 'RABBITMQ_DEFAULT_PASS=' + broker_password, broker_image], env, ROOT, log)
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', containers[0], 'pg_isready', '-h', '127.0.0.1', '-U', 'pbl6'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Isolated Postgres not ready')
        for key, (app, _) in SERVICES.items():
            command(['docker', 'exec', containers[0], 'createdb', '-U', 'pbl6', key.lower() + '_mobile_n6_test_db'], env, ROOT, log)
            command(['node', str(ROOT / 'apps' / app / 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, checkout / 'apps' / app, log)
        print('N6 isolated service databases migrated.', flush=True)
        for app in [v[0] for v in SERVICES.values()] + ['api-gateway']:
            command(['node', str(ROOT / 'apps' / app / 'node_modules/prisma/build/index.js'), 'generate', '--no-hints'], env, checkout / 'apps' / app, log) if app != 'api-gateway' else None
            command(['node', str(ROOT / 'apps' / app / 'node_modules/@nestjs/cli/bin/nest.js'), 'build'], env, checkout / 'apps' / app, log)
        command(['node', 'node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts', '--dev'], env, checkout / 'apps/identity-service', log)
        def launch(app, args):
            with (RUNTIME / (app + '.log')).open('w') as out:
                process = subprocess.Popen(args, cwd=checkout / 'apps' / app, env=env, stdin=subprocess.DEVNULL,
                                           stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
            data['pids'].append(process.pid)
            save(data)
        launch('identity-service', ['node', 'dist/main.js'])
        wait_health(13001)
        command(['node', 'node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], env, checkout / 'apps/organization-service', log)
        command(['node', 'prisma/seed.mjs'], env, checkout / 'apps/asset-service', log)
        for app, port in SERVICES.values():
            if app != 'identity-service':
                launch(app, ['node', 'dist/main.js'])
                wait_health(port)
        launch('api-gateway', ['node', 'dist/main.js'])
        wait_health(13000)
        command(['node', 'scripts/seed-dev.cjs'], env, checkout / 'apps/workorder-service', log)
        launch('web', ['node', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort'])
        launch('mobile', [sys.executable, str(ROOT / 'apps/mobile/tool/n6_fault_proxy.py')])
    print('N6 isolated Gateway, six services, PostgreSQL/RabbitMQ and live web ready.', flush=True)
    print('Private runtime: ' + str(STATE), flush=True)

def stop():
    if not STATE.exists():
        print('No N6 runtime to stop.')
        return
    data = json.loads(STATE.read_text())
    checkout = Path(data['worktree'])
    for pid in data['pids']:
        try:
            cwd = Path(f'/proc/{pid}/cwd').resolve()
            if str(cwd).startswith(str(checkout) + '/'):
                os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    for container in data['containers']:
        subprocess.run(['docker', 'stop', '--timeout', '5', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['git', 'worktree', 'remove', '--force', str(checkout)], cwd=ROOT, check=True)
    STATE.unlink()
    print('N6 processes, disposable containers/worktree and runtime credentials removed; logs retained.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'status'])
    action = parser.parse_args().action
    if action == 'start':
        start()
    elif action == 'stop':
        stop()
    else:
        print('Runtime present' if STATE.exists() else 'No runtime')
