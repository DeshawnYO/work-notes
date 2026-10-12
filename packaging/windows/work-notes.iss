#ifndef AppSource
  #error AppSource must point to the clean application staging directory
#endif
#ifndef OutputPath
  #error OutputPath is required
#endif
#ifndef ProductVersion
  #error ProductVersion must be provided by the versioned build script
#endif
[Setup]
AppId={{A94A4BF6-9308-450E-BBDC-19DDDE7D0D19}
AppName=工作笔记
AppVersion={#ProductVersion}
AppPublisher=工作笔记
DefaultDirName={localappdata}\Programs\WorkNotes
DefaultGroupName=工作笔记
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.14393
OutputDir={#OutputPath}
OutputBaseFilename=工作笔记-安装包-{#ProductVersion}-Windows-x64
SetupIconFile={#AppSource}\work-notes.ico
UninstallDisplayIcon={app}\工作笔记.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardResizable=no
CloseApplications=yes
RestartApplications=no
AppMutex=Local\WorkNotes-Desktop
DisableProgramGroupPage=yes
UninstallDisplayName=工作笔记
InfoBeforeFile={#AppSource}\安装说明.txt

[Languages]
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; Flags: checkedonce

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#WebViewInstaller}"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsWebView2

[Icons]
Name: "{userdesktop}\工作笔记"; Filename: "{app}\工作笔记.exe"; Tasks: desktopicon
Name: "{userprograms}\工作笔记"; Filename: "{app}\工作笔记.exe"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; Flags: waituntilterminated; Check: NeedsWebView2; StatusMsg: "正在安装随包提供的离线窗口运行环境…"
Filename: "{app}\工作笔记.exe"; Description: "打开工作笔记并选择数据存储位置"; Flags: nowait postinstall skipifsilent

[Code]
function NeedsWebView2: Boolean;
var Version: String;
begin
  Result := not (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
  if Result then
    Result := not (RegQueryStringValue(HKLM32, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and NeedsWebView2 then
    MsgBox('离线窗口运行环境尚未成功安装。请检查系统安装权限，再次运行安装包。工作数据不会被清空。', mbError, MB_OK);
end;
