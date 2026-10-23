"""Validate named placeholders and publish honest per-locale key coverage."""
import json,pathlib,re
root=pathlib.Path(__file__).resolve().parent.parent
folder=root/'src/locales';english=json.loads((folder/'eng.json').read_text());registry=json.loads((root/'src/i18n/registry.json').read_text())['languages'];out={}
placeholder=lambda s:set(re.findall(r'\{[A-Za-z_]+\}',s))
for p in sorted(folder.glob('*.json')):
    d=json.loads(p.read_text())
    assert p.stem in registry,p.stem
    assert len(d)>=18,p.stem
    for key,value in d.items():
        assert key in english,(p.stem,key)
        assert isinstance(value,str) and value,(p.stem,key)
        assert placeholder(value)==placeholder(english[key]),(p.stem,key)
    if p.stem!='eng':assert d['balance']!=english['balance'],p.stem
    out[p.stem]={'name':d['name'],'authored_keys':len(d),'fallback_keys':len(set(english)-set(d)),'translated_keys':sum(v!=english.get(k) for k,v in d.items()) if p.stem!='eng' else 0,'complete_core_schema':set(english)<=set(d)}
report={'english_keys':len(english),'locale_files':len(out),'registry_entries':len(registry),'complete_non_english_locales':sum(v['complete_core_schema'] for c,v in out.items() if c!='eng'),'locales':out}
(root/'src/i18n/coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(f"PASS registry={len(registry)} locale_files={len(out)} complete_non_English={report['complete_non_english_locales']} schema_keys={len(english)}")
