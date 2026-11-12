"""Package a previously built device app. This does not add an Apple signature."""
from pathlib import Path
import plistlib
import sys
import zipfile

def package(app: Path, output: Path) -> None:
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    if 'iPhoneOS' not in info.get('CFBundleSupportedPlatforms', []):
        raise ValueError('IPA must contain an iPhoneOS device build, never a simulator app')
    executable = app / info['CFBundleExecutable']
    if not executable.is_file():
        raise ValueError('App executable is missing')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(app.rglob('*')):
            if path.is_symlink():
                raise ValueError('Resolve framework symlinks before packaging')
            if path.is_file():
                archive.write(path, str(Path('Payload') / app.name / path.relative_to(app)))
    print(f'Packaged {output}; signing is a separate step')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: package.py path/to/SampIOS.app output.ipa')
    package(Path(sys.argv[1]), Path(sys.argv[2]))
