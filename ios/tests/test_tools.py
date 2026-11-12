import importlib.util
import plistlib
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

game = load('inspect_game', 'inspect-game.py')
package = load('package_app', 'package.py')

def binary(encrypted=0):
    header = struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 2, 1, 24, 0, 0)
    return header + struct.pack('<6I', 0x2c, 24, 0, 0, encrypted, 0)

class PortToolsTests(unittest.TestCase):
    def test_identifies_protected_game(self):
        self.assertTrue(game.macho(binary(1))['encrypted'])
        self.assertFalse(game.macho(binary(0))['encrypted'])

    def test_rejects_android_and_truncated_macho(self):
        for data in (b'\x7fELF' + b'\0' * 64, binary()[:40], binary()[:8]):
            with self.assertRaises(ValueError):
                game.macho(data)

    def test_reads_arm64_universal_slice(self):
        part = binary()
        universal = struct.pack('>7I', 0xcafebabe, 1, 0x100000c, 0, 28, len(part), 0) + part
        self.assertEqual(game.macho(universal)['cpu'], 'arm64')

    def test_packages_device_app_and_inspects_without_extracting(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / 'SampIOS.app'
            app.mkdir()
            info = {'CFBundleExecutable': 'SampIOS', 'CFBundleIdentifier': 'games.samp.test',
                    'CFBundleSupportedPlatforms': ['iPhoneOS']}
            (app / 'Info.plist').write_bytes(plistlib.dumps(info))
            (app / 'SampIOS').write_bytes(binary())
            output = Path(folder) / 'app.ipa'
            package.package(app, output)
            with zipfile.ZipFile(output) as archive:
                self.assertIn('Payload/SampIOS.app/SampIOS', archive.namelist())
            result = game.inspect(output)
            self.assertEqual(result['bundleId'], 'games.samp.test')
            self.assertFalse(result['integrationReady'])

    def test_simulator_is_not_packaged_as_iphone_ipa(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / 'SampIOS.app'
            app.mkdir()
            (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleSupportedPlatforms': ['iPhoneSimulator']}))
            with self.assertRaises(ValueError):
                package.package(app, Path(folder) / 'invalid.ipa')

if __name__ == '__main__':
    unittest.main()
