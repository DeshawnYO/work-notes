"""Write hashes for the completed installer, without reading private data."""
from pathlib import Path
from datetime import datetime
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0,str(ROOT))
import app_version
folder=ROOT/'releases/windows'/app_version.VERSION
package=folder/('工作笔记-安装包-'+app_version.VERSION+'-Windows-x64.exe')
with package.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
(folder/'SHA256.txt').write_text(digest+'  '+package.name+'\n',encoding='utf-8')
info={'application':'工作笔记','version':app_version.VERSION,'revision':app_version.REVISION,'schema_version':app_version.SCHEMA_VERSION,'source_commit':None,'channel':'V2 试用','created_at':datetime.now().isoformat(timespec='seconds'),
      'package':package.name,'size_bytes':package.stat().st_size,'sha256':digest,
      'platform':'Windows 10 1607+ / Windows 11 x64','private_data_included':False,
      'application_code_signed':False,'offline_webview_installer_bundled':True,
      'clean_pc_without_webview_tested':False,'harmonyos_installer_ready':False}
(folder/'发布信息.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(info,ensure_ascii=False))
