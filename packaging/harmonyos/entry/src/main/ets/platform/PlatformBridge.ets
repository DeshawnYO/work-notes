// Implement native local data/file/model APIs here. No Windows or cloud fallback.
export class PlatformBridge {
  isReady(): boolean {
    return false;
  }

  async request(path: string, method: string, body: string): Promise<string> {
    throw new Error('鸿蒙本地数据接口尚未实现，当前工程不可作为正式版使用。');
  }
}
