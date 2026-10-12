"""Stage shared assets into the HarmonyOS starter, without pretending it is a built HAP."""
from pathlib import Path
import shutil,json
ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'packaging/harmonyos'
web=target/'entry/src/main/resources/rawfile/web';web.mkdir(parents=True,exist_ok=True)
for name in ('index.html','app.js','style.css'):
    shutil.copy2(ROOT/'static'/name,web/name)
for base in (target/'AppScope/resources/base/media',target/'entry/src/main/resources/base/media'):
    base.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'assets/brand/work-notes.png',base/'app_icon.png')
(target/'适配状态.json').write_text(json.dumps({'target_device':'HUAWEI MatePad Pro Max 悦享款 (GEM-W40)','os_from_user':'HarmonyOS 7.0.0.109 SP6','native_backend_ready':False,'compiled':False,'signed':False,'device_tested':False,'shared_frontend_staged':True},ensure_ascii=False,indent=2),encoding='utf-8')
print('HarmonyOS starter assets staged; backend, SDK build, signing and device validation remain pending.')
