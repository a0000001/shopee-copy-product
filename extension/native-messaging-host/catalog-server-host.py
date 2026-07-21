import struct, json, sys, subprocess, os, signal, urllib.request, urllib.error, platform

SERVER_PORT = 9801
SERVER_HEALTH = f'http://localhost:{SERVER_PORT}/health'

server_process = None
PROJECT_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
SERVER_SCRIPT = os.path.join(PROJECT_ROOT, 'scripts', 'local-catalog-server.py')
CATALOG_PATH = os.path.join(PROJECT_ROOT, 'docs', 'data', 'product-catalog-tw.json')


def send_message(msg):
    encoded = json.dumps(msg, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack('I', raw_length)[0]
    raw_msg = sys.stdin.buffer.read(length)
    return json.loads(raw_msg.decode('utf-8'))


def check_health():
    try:
        resp = urllib.request.urlopen(SERVER_HEALTH, timeout=3)
        if resp.getcode() == 200:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('ok') is True
    except Exception:
        pass
    return False


def handle_message(msg):
    global server_process
    msg_type = msg.get('type')

    if msg_type == 'start':
        if check_health():
            send_message({'type': 'status', 'running': True, 'port': SERVER_PORT})
            return

        catalog_path = msg.get('catalog_path', CATALOG_PATH)
        cmd = [sys.executable, SERVER_SCRIPT, '--catalog-path', catalog_path]
        kwargs = dict(
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=PROJECT_ROOT,
        )
        if platform.system() == 'Windows':
            kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs['start_new_session'] = True
        server_process = subprocess.Popen(cmd, **kwargs)

        for _ in range(15):
            import time
            time.sleep(0.5)
            if check_health():
                send_message({'type': 'status', 'running': True, 'port': SERVER_PORT, 'pid': server_process.pid})
                return

        send_message({'type': 'error', 'message': 'Server failed to start within 7.5s'})

    elif msg_type == 'stop':
        if check_health():
            try:
                import urllib.request
                urllib.request.urlopen(f'http://localhost:{SERVER_PORT}/shutdown', timeout=3)
            except Exception:
                pass

        if server_process and server_process.poll() is None:
            server_process.terminate()
            try:
                server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server_process.kill()
            server_process = None

        send_message({'type': 'status', 'running': False})

    elif msg_type == 'status':
        running = check_health()
        send_message({'type': 'status', 'running': running, 'port': SERVER_PORT})


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        handle_message(msg)

    if server_process and server_process.poll() is None:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()


if __name__ == '__main__':
    main()
