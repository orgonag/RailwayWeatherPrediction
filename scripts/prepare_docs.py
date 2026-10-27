"""Expose the same source/method notes on the static site, independently of GitHub."""
import shutil
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'public/docs';out.mkdir(parents=True,exist_ok=True)
for name in ['DATA-SOURCES.md','METHODS.md','RESEARCH.md','ROADMAP.md','AI.md']:
    shutil.copy2(root/'docs'/name,out/name)
seen=set();notices=[]
def visit(name):
    if name in seen:return
    seen.add(name);folder=root/'node_modules'/name
    package=json.loads((folder/'package.json').read_text())
    license_file=next((folder/n for n in ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','license','license.md'] if (folder/n).exists()),None)
    if license_file is None:raise RuntimeError(f'Missing runtime dependency licence: {name}')
    notices.append(f"{name} {package['version']}\n{'='*60}\n{license_file.read_text()}\n")
    for dependency in package.get('dependencies',{}):visit(dependency)
for name in json.loads((root/'package.json').read_text())['dependencies']:visit(name)
(root/'public/third-party-licenses.txt').write_text('\n'.join(notices))
