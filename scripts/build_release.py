#!/usr/bin/env python3
"""Build English editions without modifying the Chinese game. Python 3, no packages."""
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'pop-strike'
OUTPUT = ROOT / 'dist'
HAN = re.compile(r'[\u3400-\u9fff]')
RUNTIME = (
    'index.html', 'icon.svg', 'style.css', 'fonts.css', 'game.js', 'world.js',
    'enemy.js', 'death-view.js', 'audio.js', 'physics.js', 'upper-yard.js',
    'navigation.js', 'multiplayer.js', 'weapons.js', 'weapon-models.js',
    'cargo-yard.js', 'palette.js',
)
HOST = ('room.mjs', 'server.mjs', 'websocket.mjs')


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Build hook changed in source: {before!r}')
    return text.replace(before, after)


def translate(text, translations, name):
    # One pass: longer phrases take priority, and translated text is never reprocessed.
    pattern = re.compile('|'.join(re.escape(s) for s in sorted(translations, key=len, reverse=True)))
    text = pattern.sub(lambda match: translations[match[0]], text)
    if HAN.search(text):
        lines = [line for line in text.splitlines() if HAN.search(line)]
        raise ValueError(f'Untranslated text in {name}:\n' + '\n'.join(lines))
    return text


def english_files():
    translations = json.loads((ROOT / 'scripts/release/en.json').read_text())
    files = {}
    for name in (*RUNTIME, *HOST):
        text = translate((SOURCE / name).read_text(), translations, name)
        if name == 'index.html':
            text = replace_once(text, 'lang="zh-CN"', 'lang="en"')
            text = replace_once(text, 'href="./"', 'href="./index.html"')
            text = replace_once(text, '<div><kbd>TAB</kbd>', '<div class="lan-only"><kbd>TAB</kbd>')
        elif name == 'style.css':
            text += '\n' + (ROOT / 'scripts/release/en.css').read_text()
        files[name] = text.encode()
    for folder in ('fonts', 'vendor'):
        for path in sorted((SOURCE / folder).iterdir()):
            if path.is_file():
                files[path.relative_to(SOURCE).as_posix()] = path.read_bytes()
    return files


def browser_files(english):
    files = {name: data for name, data in english.items() if name not in HOST}
    html = files['index.html'].decode()
    html = replace_once(html, 'lang="en"', 'lang="en" data-edition="solo"')
    html = replace_once(html, 'SOLO / LAN BATTLES', 'SOLO SURVIVAL')
    html = replace_once(html, 'Survive solo or battle friends in red-versus-blue LAN matches.',
                        'Survive three waves across a colorful, multi-level battleground.')
    html = replace_once(html, 'LOCAL SESSION', 'SOLO SESSION')
    files['index.html'] = html.encode()
    game = files['game.js'].decode()
    # Keep the DOM used by shared initialization, but disable both network entry points.
    game = replace_once(game, "async function openLan(message=''){", "async function openLan(message=''){\n  return; // LAN hosting is available in the downloadable edition.")
    game = replace_once(game, 'event.preventDefault();if(lan)return;', 'event.preventDefault();return; // Browser edition has no LAN host.\n  if(lan)return;')
    files['game.js'] = game.encode()
    files['README.txt'] = (ROOT / 'scripts/release/browser-readme.txt').read_bytes()
    return files


def lan_files(english):
    files = {'pop-strike/' + name: data for name, data in english.items()}
    files['pop-strike/package.json'] = b'{"name":"pop-strike-en","version":"1.0.0","private":true,"type":"module","scripts":{"start":"node server.mjs"}}\n'
    files['package.json'] = b'{"name":"pop-strike-lan-en","private":true,"scripts":{"start":"node pop-strike/server.mjs","dev":"node pop-strike/server.mjs"}}\n'
    launcher = (ROOT / 'start-lan.sh').read_text()
    launcher = re.sub(r"'未找到[^\n]*'", "'Node.js was not found. Install Node.js 22 or newer, then run bash start-lan.sh again.'", launcher)
    if HAN.search(launcher):
        raise ValueError('Untranslated launcher')
    files['start-lan.sh'] = launcher.encode()
    files['start-lan.bat'] = b'@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>&1\r\nif errorlevel 1 (\r\n  echo Install Node.js 22 or newer, then run this file again.\r\n  pause\r\n  exit /b 1\r\n)\r\nnode pop-strike/server.mjs\r\npause\r\n'
    files['README.txt'] = (ROOT / 'scripts/release/lan-readme.txt').read_bytes()
    return files


def validate(files, browser=False):
    if len(files) > 1000 or sum(map(len, files.values())) > 500 * 1024**2:
        raise ValueError('itch.io archive limit exceeded')
    for name, data in files.items():
        if len(name) > 240 or len(data) > 200 * 1024**2:
            raise ValueError(f'itch.io file limit exceeded: {name}')
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError(f'Unsafe archive path: {name}')
        if name.endswith(('.html', '.js', '.mjs', '.css')):
            text = data.decode()
            if HAN.search(text):
                raise ValueError(f'Non-English runtime source: {name}')
            # Validate static import, CSS/font and HTML references, with exact case.
            refs = re.findall(r'''(?:from\s*|import\s*|(?:src|href)=)["'](\./[^"']+)["']''', text)
            refs += re.findall(r'''url\(["']?(\./[^)"']+)["']?\)''', text)
            for ref in refs:
                target = (Path(name).parent / ref).as_posix()
                if target not in files:
                    raise ValueError(f'Missing dependency: {name} -> {target}')
    if browser and ('index.html' not in files or any(n.endswith('.mjs') for n in files)):
        raise ValueError('Browser archive must have root index.html and no host code')


def write_release(name, files, browser=False):
    validate(files, browser)
    OUTPUT.mkdir(exist_ok=True)
    stage = OUTPUT / name
    archive = OUTPUT / (name + '.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for filename, data in sorted(files.items()):
            path = stage / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            info = zipfile.ZipInfo(filename, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if filename.endswith('.sh') else 0o100644) << 16
            bundle.writestr(info, data, compresslevel=9)
    print(f'{archive.relative_to(ROOT)}: {len(files)} files, {archive.stat().st_size / 1024**2:.2f} MiB')


def main():
    english = english_files()
    write_release('pop-strike-itch-en', browser_files(english), browser=True)
    write_release('pop-strike-lan-en', lan_files(english))


if __name__ == '__main__':
    main()
