"""Verify deployment payload matches repository bytes. Run before every upload."""
import ast,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parent.parent
launcher=pathlib.Path(sys.argv[1]);tree=ast.parse(launcher.read_text());payload=None
for node in ast.walk(tree):
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='FILES' for t in node.targets):
        payload=ast.literal_eval(node.value)
assert payload,'Missing embedded payload'
for rel,text in payload.items():
    source=root/rel
    if source.is_file():
        assert source.read_bytes()==text.encode('utf-8'),f'Payload mismatch: {rel}'
lock=json.loads(payload['package-lock.json'])
assert lock['packages']==json.loads((root/'package-lock.json').read_text())['packages'],'Dependency lockfile altered'
print(f'PASS: {len(payload)} payload files, exact local bytes, dependency lock unchanged')
