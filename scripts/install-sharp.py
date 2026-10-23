"""Install only locked, prebuilt Linux-x64 Sharp binaries. No npm scripts/compiler."""
import base64,hashlib,io,json,os,pathlib,shutil,sys,tarfile,tempfile,urllib.request
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parent.parent)
lock=json.loads((root/'package-lock.json').read_text())
for name in ['sharp-linux-x64','sharp-libvips-linux-x64']:
    rel='node_modules/@img/'+name
    package=lock['packages'][rel]
    target=root/rel
    try:
        if json.loads((target/'package.json').read_text())['version']==package['version']:
            continue
    except (OSError,KeyError,ValueError):
        pass
    url=package['resolved']
    if not url.startswith('https://registry.npmjs.org/@img/'):
        raise RuntimeError('Unexpected package registry')
    with urllib.request.urlopen(url,timeout=30) as response:
        data=response.read(12*1048576+1)
    if len(data)>12*1048576:
        raise RuntimeError('Package exceeds download cap')
    integrity=package['integrity'].split('-')
    if integrity[0]!='sha512' or base64.b64encode(hashlib.sha512(data).digest()).decode()!=integrity[1]:
        raise RuntimeError('Package integrity mismatch')
    target.parent.mkdir(parents=True,exist_ok=True)
    stage=pathlib.Path(tempfile.mkdtemp(prefix='.sharp-install-',dir=target.parent))
    try:
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
            members=archive.getmembers()
            if len(members)>50 or sum(m.size for m in members)>24*1048576:
                raise RuntimeError('Package expansion exceeds cap')
            for member in members:
                parts=pathlib.PurePosixPath(member.name).parts
                if not parts or parts[0]!='package' or any(p in ['..',''] for p in parts) or member.issym() or member.islnk() or not(member.isfile()or member.isdir()):
                    raise RuntimeError('Unsafe package entry')
                dest=stage.joinpath(*parts[1:])
                if member.isdir():
                    dest.mkdir(parents=True,exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    with archive.extractfile(member) as source,open(dest,'wb') as output:
                        shutil.copyfileobj(source,output)
                    os.chmod(dest,0o644)
        if json.loads((stage/'package.json').read_text())['version']!=package['version']:
            raise RuntimeError('Package version mismatch')
        if target.exists():
            shutil.rmtree(target)
        os.replace(stage,target)
        print('[sharp] Installed locked '+name+' '+package['version'],flush=True)
    finally:
        if stage.exists():shutil.rmtree(stage)
