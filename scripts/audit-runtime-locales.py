"""Validate the separately versioned runtime schema. Native quality is not certified."""
import collections,json,pathlib,re
root=pathlib.Path(__file__).resolve().parent.parent
folder=root/'src/runtime-locales';eng=json.loads((folder/'eng.json').read_text());reg=json.loads((root/'src/i18n/registry.json').read_text())['languages']
params=lambda s:collections.Counter(re.findall(r'\{[A-Za-z_]+\}',s))
commands=lambda s:collections.Counter(re.findall(r'/setprefix(?![a-z0-9_])|\{prefix\}(?:[a-z][a-z0-9_]*|\{command\})',s))
result={}
for p in sorted(folder.glob('*.json')):
 d=json.loads(p.read_text());assert p.stem in reg,p.stem
 assert set(d)==set(eng),(p.stem,'keys')
 for k,v in d.items():
  assert isinstance(v,str) and v,(p.stem,k)
  assert params(v)==params(eng[k]),(p.stem,k,'placeholders')
  assert commands(v)==commands(eng[k]),(p.stem,k,'commands')
  for chain in re.findall(r'\{prefix\}(?:[a-z][a-z0-9_]*|\{command\}) (?:on|off|reset|confirm|cancel|end|leaderboard)(?![a-z])',eng[k]):assert v.count(chain)==eng[k].count(chain),(p.stem,k,'action')
 result[p.stem]={'authored_keys':len(d),'complete_runtime_schema':True}
report={'schema_keys':len(eng),'runtime_files':len(result),'complete_non_english':len(result)-1,'locales':result}
(root/'src/i18n/runtime-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"PASS runtime_keys={len(eng)} files={len(result)} complete_non_English={len(result)-1}")
