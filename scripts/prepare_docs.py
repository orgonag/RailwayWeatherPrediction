"""Expose the same source/method notes on the static site, independently of GitHub."""
import shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'public/docs';out.mkdir(parents=True,exist_ok=True)
for name in ['DATA-SOURCES.md','METHODS.md','RESEARCH.md','ROADMAP.md','AI.md']:
    shutil.copy2(root/'docs'/name,out/name)
