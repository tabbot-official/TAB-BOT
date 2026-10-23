import importlib.util, io, pathlib, tarfile, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('bootstrap',ROOT/'start.py');app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)
class BootstrapTest(unittest.TestCase):
    def test_preserves_env_and_state(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'.env').write_text('private');(p/'.env.example').write_text('default');app.setup_environment(p);app.setup_environment(p);self.assertEqual((p/'.env').read_text(),'private');self.assertTrue((p/'auth').is_dir())
    def test_new_env_private(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'.env.example').write_text('default');app.setup_environment(p);self.assertEqual((p/'.env').stat().st_mode&0o777,0o600)
    def test_bad_node_rejected(self):
        self.assertFalse(app.valid_node('/not/a/node'))
    def test_path_and_link_escape_rejected(self):
        for name,link in [('../escape',None),('safe','../../../escape')]:
            with tempfile.TemporaryDirectory() as d:
                p=pathlib.Path(d);a=p/'a.tar.gz'
                with tarfile.open(a,'w:gz') as t:
                    i=tarfile.TarInfo(name)
                    if link:i.type=tarfile.SYMTYPE;i.linkname=link;t.addfile(i)
                    else:i.size=1;t.addfile(i,io.BytesIO(b'x'))
                with self.assertRaises(RuntimeError):app.safe_extract(a,p/'out')
    def test_safe_npm_symlink_allowed(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);a=p/'a.tar.gz';out=p/'out';out.mkdir()
            with tarfile.open(a,'w:gz') as t:
                i=tarfile.TarInfo('node/lib/npm.js');i.size=1;t.addfile(i,io.BytesIO(b'x'));i=tarfile.TarInfo('node/bin/npm');i.type=tarfile.SYMTYPE;i.linkname='../lib/npm.js';t.addfile(i)
            app.safe_extract(a,out);self.assertEqual((out/'node/bin/npm').read_text(),'x')
    def test_env_only_sets_safe_default(self):
        self.assertEqual(app.runtime_env('/usr/bin/node')['GROUP_STORAGE'],'json')
if __name__=='__main__':unittest.main()
