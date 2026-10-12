import { webview } from '@kit.ArkWeb';
import { PlatformBridge } from '../platform/PlatformBridge';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: PlatformBridge = new PlatformBridge();

  build() {
    Column({ space: 18 }) {
      if (this.bridge.isReady()) {
        Web({ src: $rawfile('web/index.html'), controller: this.controller })
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .width('100%')
          .height('100%')
      } else {
        Image($r('app.media.app_icon')).width(88).height(88)
        Text('工作笔记').fontSize(30).fontColor('#285044')
        Text('鸿蒙适配开发工程').fontSize(17)
        Text('本地数据、项目文件访问及模型接口仍需适配。当前不具备完整工作台功能，不能作为正式版分发。')
          .fontSize(14).fontColor('#62675D').textAlign(TextAlign.Center).width('75%')
        Text('目标：MatePad Pro Max · 平板桌面与电脑桌面').fontSize(12).fontColor('#62675D')
      }
    }.justifyContent(FlexAlign.Center).width('100%').height('100%').backgroundColor('#F7F2E5')
  }
}
