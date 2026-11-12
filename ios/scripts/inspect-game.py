"""Inspect a user-supplied iOS app/IPA without running it or modifying its protection."""
import argparse
import hashlib
import json
import plistlib
import struct
import zipfile
from pathlib import Path

def macho(data):
    if len(data) < 32:
        raise ValueError('Truncated executable')
    magic = data[:4]
    if magic in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        count, = struct.unpack_from('>I', data, 4)
        stride = 32 if magic[-1] == 0xbf else 20
        if count > 64 or len(data) < 8 + count * stride:
            raise ValueError('Invalid universal binary header')
        for index in range(count):
            start = 8 + index * stride
            cpu, = struct.unpack_from('>I', data, start)
            if cpu == 0x100000c:
                offset, size = struct.unpack_from('>QQ' if stride == 32 else '>II', data, start + 8)
                if offset + size > len(data):
                    raise ValueError('Invalid arm64 slice bounds')
                return macho(data[offset:offset + size])
        raise ValueError('No arm64 slice')
    if magic != b'\xcf\xfa\xed\xfe':
        raise ValueError('Expected a 64-bit Mach-O executable; Android ELF is unsupported')
    _, cpu, subtype, filetype, count, sizecmds, flags, reserved = struct.unpack_from('<8I', data)
    if cpu != 0x100000c or filetype != 2 or sizecmds > len(data) - 32:
        raise ValueError('Expected an arm64 Mach-O executable')
    position, encrypted, uuid = 32, False, None
    for _ in range(count):
        if position + 8 > 32 + sizecmds:
            raise ValueError('Truncated load command')
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > 32 + sizecmds:
            raise ValueError('Invalid load command bounds')
        if command in (0x21, 0x2c):
            if size < 20:
                raise ValueError('Truncated encryption command')
            encrypted |= bool(struct.unpack_from('<I', data, position + 16)[0])
        if command == 0x1b:
            if size < 24:
                raise ValueError('Truncated UUID command')
            uuid = data[position + 8:position + 24].hex()
        position += size
    return {'cpu': 'arm64', 'subtype': subtype, 'uuid': uuid, 'encrypted': encrypted,
            'sliceSha256': hashlib.sha256(data).hexdigest()}

def inspect(source):
    if source.is_dir():
        app = source
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        name = info.get('CFBundleExecutable', '')
        if not name or Path(name).name != name or '/' in name or '\\' in name:
            raise ValueError('Invalid bundle executable name')
        binary = (app / name).read_bytes()
    else:
        with zipfile.ZipFile(source) as archive:
            infos = [p for p in archive.namelist() if p.startswith('Payload/') and p.count('/') == 2
                     and p.endswith('.app/Info.plist')]
            if len(infos) != 1:
                raise ValueError('Expected exactly one root app in Payload')
            info = plistlib.loads(archive.read(infos[0]))
            name = info.get('CFBundleExecutable', '')
            if not name or Path(name).name != name or '/' in name or '\\' in name:
                raise ValueError('Invalid bundle executable name')
            binary = archive.read(infos[0].rsplit('/', 1)[0] + '/' + name)
    result = {'bundleId': info.get('CFBundleIdentifier'), 'version': info.get('CFBundleShortVersionString'),
              'build': info.get('CFBundleVersion'), 'executable': name, **macho(binary)}
    result['integrationReady'] = False
    result['nextStep'] = ('Executable is protected; this tool does not remove protection.' if result['encrypted']
                          else 'Verify game version, map iOS engine functions and implement GameBackend; no supported profile yet.')
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    text = json.dumps(inspect(args.source), ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + '\n', encoding='utf-8')
    print(text)
