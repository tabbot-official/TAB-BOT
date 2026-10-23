"""Import reviewed translation attachments without overwriting complete locales by accident.
Usage: python3 scripts/import-locales.py /downloads/code-hash.json ...
Machine checks do NOT establish fluent/semantic quality. Review sensitive strings first.
"""
import json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parent.parent
eng=json.loads((root/'src/locales/eng.json').read_text());registry=json.loads((root/'src/i18n/registry.json').read_text())['languages'];params=lambda s:set(re.findall(r'\{[A-Za-z_]+\}',s))
validated=[]
for arg in sys.argv[1:]:
    p=pathlib.Path(arg);c=p.name.split('-')[0].split('.')[0]
    assert c in registry,(c,'not a registry code')
    d=json.loads(p.read_text())
    assert set(d)==set(eng),(c,'key mismatch',set(eng)-set(d),set(d)-set(eng))
    assert all(isinstance(v,str) and v and params(v)==params(eng[k]) for k,v in d.items()),(c,'invalid value or placeholder')
    assert d['balance']!=eng['balance'],(c,'English clone')
    target=root/'src/locales'/f'{c}.json'
    if target.exists() and set(json.loads(target.read_text()))==set(eng):
        print(f'SKIP {c}: complete locale already exists');continue
    validated.append((c,target,d))
for c,target,d in validated:
    target.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(f'IMPORTED {c}: {len(d)} keys')
