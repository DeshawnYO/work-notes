"""Build the served CSS from maintained source styles."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
base = root / 'static/base.css'
theme = root / 'static/notebook.css'
(root / 'static/style.css').write_text(
    base.read_text(encoding='utf-8') + '\n' + theme.read_text(encoding='utf-8') + '\n' + (root / 'static/dossier.css').read_text(encoding='utf-8') + '\n' + (root / 'static/experience.css').read_text(encoding='utf-8') + '\n' + (root / 'static/modern.css').read_text(encoding='utf-8'),
    encoding='utf-8',
)
print('Workbench V2 stylesheet rebuilt.')
