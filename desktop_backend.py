"""Bundled desktop service entrypoint; keep console output inside selected data."""
from pathlib import Path
import os,sys,traceback
root=Path(os.environ['PERSONAL_WORKBENCH_DATA_DIR'])
logs=root/'logs';logs.mkdir(parents=True,exist_ok=True)
output=(logs/'desktop-server.log').open('a',encoding='utf-8',buffering=1)
sys.stdout=sys.stderr=output
try:
    import server
    server.main()
except Exception:
    traceback.print_exc();raise SystemExit(1)
