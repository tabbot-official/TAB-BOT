"""Python-panel entrypoint for the Node-based Tab engine. No pip packages needed."""
import argparse
import hashlib
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
VERSION = '22.23.2'
HASHES = {
    'x64': 'b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a',
    'arm64': '013b59cfd2819703a6f4a14ab891fc46fc2a4e3f5bcd92de3fb4929b43e35b30',
}

def valid_node(node):
    try:
        r = subprocess.run([str(node), '--version'], capture_output=True, text=True, timeout=10)
        return r.returncode == 0 and int(r.stdout.strip().lstrip('v').split('.')[0]) >= 20
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return False

def safe_extract(archive, destination):
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        for member in members:
            target = (destination / member.name).resolve()
            if not target.is_relative_to(destination.resolve()) or not (member.isdir() or member.isfile() or member.issym() or member.islnk()):
                raise RuntimeError('Unsafe Node archive member: ' + member.name)
            if member.issym() or member.islnk():
                link = (target.parent / member.linkname if member.issym() else destination / member.linkname).resolve()
                if not link.is_relative_to(destination.resolve()):
                    raise RuntimeError('Unsafe Node archive link: ' + member.name)
        tar.extractall(destination, members=members)

def install_node(root=ROOT):
    if platform.system() != 'Linux' or platform.libc_ver()[0] != 'glibc':
        raise RuntimeError('Automatic Node setup supports Linux glibc only. Install Node20+ and npm using your host tools.')
    arch = {'x86_64': 'x64', 'aarch64': 'arm64'}.get(platform.machine())
    if arch not in HASHES:
        raise RuntimeError('Unsupported CPU. Install Node20+ and npm using your host tools.')
    runtimes = root / '.runtime'
    runtimes.mkdir(exist_ok=True)
    home = runtimes / ('node-v' + VERSION + '-linux-' + arch)
    node = home / 'bin' / 'node'
    if valid_node(node):
        return node
    with tempfile.TemporaryDirectory(dir=runtimes, prefix='stage-') as temp:
        stage = pathlib.Path(temp)
        archive = stage / 'node.tar.gz'
        url = 'https://nodejs.org/dist/v' + VERSION + '/node-v' + VERSION + '-linux-' + arch + '.tar.gz'
        print('[setup] Downloading verified Node ' + VERSION, flush=True)
        request = urllib.request.Request(url, headers={'User-Agent': 'Tab-panel-setup'})
        digest = hashlib.sha256()
        with urllib.request.urlopen(request, timeout=60) as response, archive.open('wb') as output:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise RuntimeError('Node download exceeds setup limit.')
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != HASHES[arch]:
            raise RuntimeError('Node checksum failed. Nothing installed.')
        safe_extract(archive, stage)
        extracted = stage / home.name
        if not valid_node(extracted / 'bin' / 'node'):
            raise RuntimeError('Downloaded Node cannot run on this host.')
        if home.exists():
            raise RuntimeError('Existing invalid runtime. Remove only .runtime manually and retry.')
        extracted.rename(home)
    return node

def runtime_env(node):
    env = dict(os.environ)
    env['PATH'] = str(pathlib.Path(node).resolve().parent) + os.pathsep + env.get('PATH', '')
    env.setdefault('GROUP_STORAGE', 'json')
    return env

def setup_environment(root=ROOT):
    env_file = root / '.env'
    if not env_file.exists():
        with env_file.open('x') as output:
            output.write((root / '.env.example').read_text())
        env_file.chmod(0o600)
        print('[setup] Created .env. Set OWNER_NUMBER/PAIRING_NUMBER before pairing.', flush=True)
    for name in ('auth', 'data', 'downloads', 'temp'):
        (root / name).mkdir(exist_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only runtime check; no download/install/pairing')
    parser.add_argument('--setup-only', action='store_true', help='Set up and check; do not connect WhatsApp')
    args = parser.parse_args()
    os.chdir(ROOT)
    node = shutil.which('node')
    if not node or not valid_node(node):
        candidates = list((ROOT / '.runtime').glob('node-v*/bin/node'))
        node = next((str(p) for p in candidates if valid_node(p)), None)
    if not node:
        if args.check:
            raise RuntimeError('Node20+ not found. Run python3 start.py --setup-only.')
        node = str(install_node())
    env = runtime_env(node)
    npm = shutil.which('npm', path=env['PATH'])
    if not npm:
        raise RuntimeError('npm missing. Install a complete Node20+ distribution.')
    if not args.check:
        setup_environment()
        check = subprocess.run([node, 'scripts/panel-check.js'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        if check.returncode != 0:
            print('[setup] Installing locked dependencies. First boot needs internet and disk space.', flush=True)
            subprocess.run([npm, 'ci', '--no-audit', '--no-fund'], env=env, check=True, timeout=1800)
    subprocess.run([node, 'scripts/panel-check.js'], env=env, check=True, timeout=60)
    if args.check or args.setup_only:
        return
    print('[Tab] Launching Node engine through Python panel. Preserve auth/ and data/.', flush=True)
    os.execve(str(pathlib.Path(node).resolve()), [node, 'scripts/runner.js'], env)

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print('[setup] Stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
