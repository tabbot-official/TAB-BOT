"""Import semantic-reviewed runtime-only worker files; never overwrite core locales."""
import collections,json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parent.parent;folder=root/'src/runtime-locales'
eng=json.loads((folder/'eng.json').read_text());reg=json.loads((root/'src/i18n/registry.json').read_text())['languages']
params=lambda s:collections.Counter(re.findall(r'\{[A-Za-z_]+\}',s));commands=lambda s:collections.Counter(re.findall(r'/setprefix(?![a-z0-9_])|\{prefix\}(?:[a-z][a-z0-9_]*|\{command\})',s));ready=[]
for arg in sys.argv[1:]:
 p=pathlib.Path(arg);c=p.name.split('-')[0];assert c in reg and c!='eng',c
 d=json.loads(p.read_text());assert set(d)==set(eng),(c,'keys')
 for k,v in d.items():
  assert isinstance(v,str) and v and params(v)==params(eng[k]) and commands(v)==commands(eng[k]),(c,k)
 for k,v in d.items():
  for chain in re.findall(r'\{prefix\}(?:[a-z][a-z0-9_]*|\{command\}) (?:on|off|reset|confirm|cancel|end|leaderboard)(?![a-z])',eng[k]):assert v.count(chain)==eng[k].count(chain),(c,k,'action')
 assert d['reminder_review']!=eng['reminder_review'],(c,'English clone')
 target=folder/(c+'.json');assert not target.exists(),(c,'already exists; review before replacing')
 ready.append((target,d))
for target,d in ready:target.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print('IMPORTED',target.stem,len(d))
