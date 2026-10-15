using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly:System.Reflection.AssemblyTitle("工作笔记")]
[assembly:System.Reflection.AssemblyProduct("工作笔记")]
[assembly:System.Reflection.AssemblyInformationalVersion("__PRODUCT_VERSION__")]
[assembly:System.Reflection.AssemblyVersion("2.0.0.0")]
[assembly:System.Reflection.AssemblyFileVersion("2.0.0.0")]

internal static class Program {
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    internal static string Backend = Path.Combine(Root,"backend");
    internal static string ConfigRoot;
    internal static EventWaitHandle WakeSignal;
    internal static Dictionary<string,string> Flags = new Dictionary<string,string>();
    internal static string Quote(string value) { int tails=value.Length-value.TrimEnd('\\').Length;return "\"" + value.Substring(0,value.Length-tails).Replace("\"","\\\"")+new string('\\',tails*2)+"\""; }
    internal static string Flag(string key,string fallback="") { return Flags.ContainsKey(key)?Flags[key]:fallback; }
    internal static void Trace(string value) {if(Flag("qa")=="")return;Directory.CreateDirectory(ConfigRoot);File.AppendAllText(Path.Combine(ConfigRoot,"qa-lifecycle.log"),DateTime.Now.ToString("O")+" pid="+Process.GetCurrentProcess().Id+" "+value+Environment.NewLine);}
    internal static Icon AppIcon { get { return new Icon(Path.Combine(Root,"work-notes.ico")); } }
    internal static void SaveLocation(string path) {
        Directory.CreateDirectory(ConfigRoot);
        string file=Path.Combine(ConfigRoot,"location.json"), temp=file+".tmp";
        File.WriteAllText(temp,Json.Serialize(new Dictionary<string,string>{{"data_dir",path}}),new UTF8Encoding(false));
        if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);
    }
    internal static string LoadLocation() {
        string path=Path.Combine(ConfigRoot,"location.json");
        if(!File.Exists(path))return null;
        return Json.Deserialize<Dictionary<string,string>>(File.ReadAllText(path))["data_dir"];
    }
    internal static Task<Dictionary<string,object>> Storage(string action,string target,string source=null) {
        return Task.Run(()=>{
            ProcessStartInfo start=new ProcessStartInfo(Path.Combine(Backend,"runtime","python.exe"));
            start.Arguments="-s -E -B -X utf8 "+Quote(Path.Combine(Backend,"data_storage.py"))+" "+action+" --target "+Quote(target)+(source==null?"":" --source "+Quote(source));
            start.WorkingDirectory=Backend;start.UseShellExecute=false;start.CreateNoWindow=true;
            start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.StandardOutputEncoding=Encoding.UTF8;start.StandardErrorEncoding=Encoding.UTF8;
            start.EnvironmentVariables["PERSONAL_WORKBENCH_DATA_DIR"]=target;
            using(Process process=Process.Start(start)) {
                var errors=process.StandardError.ReadToEndAsync();string output=process.StandardOutput.ReadToEnd();process.WaitForExit();
                if(process.ExitCode!=0) {
                    try { var fail=Json.Deserialize<Dictionary<string,object>>(output);throw new ApplicationException(Convert.ToString(fail["error"])); }
                    catch(ArgumentException) { throw new ApplicationException("数据检查未完成："+errors.Result); }
                }
                return Json.Deserialize<Dictionary<string,object>>(output);
            }
        });
    }
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        foreach(string arg in args) { if(!arg.StartsWith("--"))continue;int at=arg.IndexOf('=');Flags[arg.Substring(2,at<0?arg.Length-2:at-2)]=at<0?"1":arg.Substring(at+1); }
        ConfigRoot=Flag("config-dir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkNotes"));
        if(Flag("wait")!="")Thread.Sleep(2000);
        // An installation owns one UI/backend; a second click brings that UI forward.
        string defaultConfig=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkNotes");
        string mutexId=Path.GetFullPath(ConfigRoot).Equals(Path.GetFullPath(defaultConfig),StringComparison.OrdinalIgnoreCase)?"Local\\WorkNotes-Desktop":"Local\\WorkNotes-"+Convert.ToBase64String(Encoding.UTF8.GetBytes(Path.GetFullPath(ConfigRoot).ToLowerInvariant())).Replace('/','_').Replace('+','_');
        bool created;
        using(Mutex mutex=new Mutex(true,mutexId,out created)) {
            Trace("mutex="+mutexId+" created="+created);
            if(!created) { try{using(EventWaitHandle signal=EventWaitHandle.OpenExisting(mutexId+"-Wake")){signal.Set();}}catch(WaitHandleCannotBeOpenedException){Native.PostMessage(Native.HWND_BROADCAST,Native.ShowMessage,IntPtr.Zero,IntPtr.Zero);}return; }
            WakeSignal=new EventWaitHandle(false,EventResetMode.AutoReset,mutexId+"-Wake");
            try {
                if(Flag("qa-wizard")!="") {
                    using(SetupForm setup=new SetupForm()) { setup.Show();Application.DoEvents();using(Bitmap bitmap=new Bitmap(setup.Width,setup.Height)) { setup.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height));bitmap.Save(Flag("qa-wizard")); }setup.Close(); }
                    return;
                }
                string data=Flag("data-dir");
                if(data=="") {
                    try { data=LoadLocation(); }
                    catch(Exception) { MessageBox.Show("保存的数据位置无法读取，请重新选择已有数据目录。","工作笔记"); }
                }
                if(!string.IsNullOrEmpty(data)) {
                    try { Storage("inspect",data).GetAwaiter().GetResult(); }
                    catch(Exception ex) { if(Flag("qa")!="")throw;MessageBox.Show(ex.Message+"\n请重新选择已有数据，原记录不会被清空。","工作笔记");data=null; }
                }
                if(string.IsNullOrEmpty(data)||Flag("setup")!="") {
                    using(SetupForm setup=new SetupForm()) { if(setup.ShowDialog()!=DialogResult.OK)return;data=setup.DataPath; }
                }
                SaveLocation(data);
                Application.Run(new NotebookForm(data));
            } catch(Exception ex) {
                Directory.CreateDirectory(ConfigRoot);File.AppendAllText(Path.Combine(ConfigRoot,"startup-error.log"),DateTime.Now+" "+ex+Environment.NewLine);
                if(Flag("qa")!=""){Environment.ExitCode=1;return;}
                MessageBox.Show("工作笔记未能打开："+ex.Message+"\n可查看："+Path.Combine(ConfigRoot,"startup-error.log"),"工作笔记",MessageBoxButtons.OK,MessageBoxIcon.Error);
            }
        }
    }
}

internal class SetupForm:Form {
    RadioButton create,reuse,migrate;
    TextBox target,source;
    Button confirm;
    Label status,sourceLabel;
    Button sourceBrowse;
    internal string DataPath;bool saving=false;
    internal SetupForm() {
        Text="欢迎使用工作笔记";Icon=Program.AppIcon;ClientSize=new Size(610,465);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(245,247,250);
        Label title=new Label{Text="把工作留在自己的笔记里",Font=new Font(Font.FontFamily,20),Location=new Point(30,24),AutoSize=true};Controls.Add(title);
        Controls.Add(new Label{Text="先选择数据位置。升级和卸载程序后，历史记录仍会保留。",Location=new Point(32,75),Size=new Size(550,25)});
        create=new RadioButton{Text="创建新工作笔记",Location=new Point(32,123),AutoSize=true,Checked=true};
        reuse=new RadioButton{Text="打开已有数据",Location=new Point(224,123),AutoSize=true};
        migrate=new RadioButton{Text="迁移旧工作台数据",Location=new Point(394,123),AutoSize=true};Controls.AddRange(new Control[]{create,reuse,migrate});
        Controls.Add(new Label{Text="数据存储文件夹",Location=new Point(32,179),AutoSize=true});
        target=new TextBox{Location=new Point(32,207),Size=new Size(443,29),Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"工作笔记数据")};
        Button browse=new Button{Text="选择…",Location=new Point(486,205),Size=new Size(89,31)};browse.Click+=(s,e)=>Browse(target);Controls.AddRange(new Control[]{target,browse});
        sourceLabel=new Label{Text="旧工作台的 data 文件夹（包含 workbench.sqlite3）",Location=new Point(32,250),AutoSize=true,Visible=false};
        source=new TextBox{Location=new Point(32,278),Size=new Size(443,29),Visible=false};
        sourceBrowse=new Button{Text="选择…",Location=new Point(486,276),Size=new Size(89,31),Visible=false};sourceBrowse.Click+=(s,e)=>Browse(source);Controls.AddRange(new Control[]{sourceLabel,source,sourceBrowse});
        status=new Label{Location=new Point(32,326),Size=new Size(540,70),ForeColor=Color.FromArgb(100,116,139),Text="记录、草稿、图片与备份保存在数据目录。正式 Word 归档到项目文件夹。"};Controls.Add(status);
        confirm=new Button{Text="开始使用",Location=new Point(434,413),Size=new Size(140,34),BackColor=Color.FromArgb(37,99,235),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};
        Button cancel=new Button{Text="稍后再说",Location=new Point(315,413),Size=new Size(105,34),DialogResult=DialogResult.Cancel};Controls.AddRange(new Control[]{confirm,cancel});CancelButton=cancel;
        create.CheckedChanged+=(s,e)=>Mode();reuse.CheckedChanged+=(s,e)=>Mode();migrate.CheckedChanged+=(s,e)=>Mode();
        confirm.Click+=async(s,e)=>{
            saving=true;confirm.Enabled=false;cancel.Enabled=false;create.Enabled=reuse.Enabled=migrate.Enabled=false;
            try {
                if(string.IsNullOrWhiteSpace(target.Text))throw new ApplicationException("请选择数据存储文件夹");
                if(migrate.Checked&&string.IsNullOrWhiteSpace(source.Text))throw new ApplicationException("请选择旧工作台数据来源");
                status.Text=migrate.Checked?"正在生成快照并迁移，请勿关闭窗口；旧数据和项目原文件保留。":"正在检查数据目录…";
                UseWaitCursor=true;var result=await Program.Storage(migrate.Checked?"migrate":reuse.Checked?"inspect":"create",target.Text.Trim(),migrate.Checked?source.Text.Trim():null);
                DataPath=Convert.ToString(result["data_dir"]);saving=false;DialogResult=DialogResult.OK;Close();
            }catch(Exception ex){status.Text=ex.Message;MessageBox.Show(this,ex.Message,"请选择合适的数据位置",MessageBoxButtons.OK,MessageBoxIcon.Information);}
            finally{saving=false;UseWaitCursor=false;confirm.Enabled=true;cancel.Enabled=true;create.Enabled=reuse.Enabled=migrate.Enabled=true;}
        };
        FormClosing+=(s,e)=>{if(saving)e.Cancel=true;};
    }
    void Mode(){sourceLabel.Visible=source.Visible=sourceBrowse.Visible=migrate.Checked;status.Text=migrate.Checked?"迁移记录、设置和历史备份，保留原项目关联；不会删除旧数据。":reuse.Checked?"打开已有历史数据，不会清空或覆盖。":"只存放记录、目标、报告、设置和备份。项目继续关联原文件夹。";}
    void Browse(TextBox input){using(FolderBrowserDialog picker=new FolderBrowserDialog()){picker.Description="选择工作笔记数据文件夹";if(Directory.Exists(input.Text))picker.SelectedPath=input.Text;if(picker.ShowDialog(this)==DialogResult.OK)input.Text=picker.SelectedPath;}}
}

internal class NotebookForm:Form {
    WebView2 web=new WebView2();NotifyIcon tray;Process backend;string data,url,token;bool exiting=false;System.Windows.Forms.Timer qaTimer;
    RegisteredWaitHandle wakeWait;
    internal NotebookForm(string dataPath) {
        data=dataPath;Text="工作笔记 V"+Application.ProductVersion;Icon=Program.AppIcon;Size=new Size(1420,950);MinimumSize=new Size(820,620);StartPosition=FormStartPosition.CenterScreen;
        if(Program.Flag("qa")!=""){StartPosition=FormStartPosition.Manual;Location=new Point(-20000,-20000);}
        wakeWait=ThreadPool.RegisterWaitForSingleObject(Program.WakeSignal,(s,t)=>{Program.Trace("wake received");if(!IsDisposed&&IsHandleCreated)BeginInvoke((Action)ShowNotebook);},null,-1,false);
        web.Dock=DockStyle.Fill;Controls.Add(web);
        ContextMenuStrip trayMenu=new ContextMenuStrip();trayMenu.Items.Add("打开工作笔记",null,(s,e)=>ShowNotebook());trayMenu.Items.Add("打开数据文件夹",null,(s,e)=>Process.Start(new ProcessStartInfo(data){UseShellExecute=true}));trayMenu.Items.Add("切换数据位置…",null,async(s,e)=>await SwitchData());trayMenu.Items.Add("退出工作笔记",null,async(s,e)=>await ExitNotebook());
        tray=new NotifyIcon{Icon=Icon,Text="工作笔记",ContextMenuStrip=trayMenu,Visible=Program.Flag("qa")==""};tray.DoubleClick+=(s,e)=>ShowNotebook();
        Shown+=async(s,e)=>{bool failed=false;try { await StartNotebook(); }catch(Exception ex){Directory.CreateDirectory(Program.ConfigRoot);File.AppendAllText(Path.Combine(Program.ConfigRoot,"startup-error.log"),ex+Environment.NewLine);if(Program.Flag("qa")=="")MessageBox.Show(this,ex.Message,"打开工作笔记失败",MessageBoxButtons.OK,MessageBoxIcon.Error);Environment.ExitCode=1;failed=true;}if(failed)await ExitNotebook(true);};
        FormClosing+=(s,e)=>{Program.Trace("closing reason="+e.CloseReason+" exiting="+exiting);if(!exiting&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();if(Program.Flag("qa")==""){tray.ShowBalloonTip(2200,"工作笔记在后台运行","双击托盘图标可重新打开，右键可完整退出。",ToolTipIcon.Info);}}};
        FormClosed+=(s,e)=>{if(exiting)return;wakeWait.Unregister(null);tray.Visible=false;tray.Dispose();web.Dispose();if(backend!=null){try{if(!backend.HasExited)backend.Kill();}catch(InvalidOperationException){}finally{backend.Dispose();backend=null;}}};
    }
    protected override void WndProc(ref Message message){if(message.Msg==Native.ShowMessage)ShowNotebook();base.WndProc(ref message);}
    void ShowNotebook(){Program.Trace("show notebook");Show();WindowState=FormWindowState.Normal;Activate();}
    Dictionary<string,object> Get(string path){using(WebClient client=new WebClient()){client.Proxy=null;client.Encoding=Encoding.UTF8;return Program.Json.Deserialize<Dictionary<string,object>>(client.DownloadString(url+path));}}
    async Task StartNotebook() {
        int port;TcpListener listener=new TcpListener(IPAddress.Loopback,0);try{listener.Start();port=((IPEndPoint)listener.LocalEndpoint).Port;}finally{listener.Stop();}
        url="http://127.0.0.1:"+port;Directory.CreateDirectory(Path.Combine(data,"logs"));
        var start=new ProcessStartInfo(Path.Combine(Program.Backend,"runtime","pythonw.exe"));
        start.Arguments="-s -E -B -X utf8 "+Program.Quote(Path.Combine(Program.Backend,"desktop_backend.py"));start.WorkingDirectory=Program.Backend;start.UseShellExecute=false;start.CreateNoWindow=true;
        start.EnvironmentVariables["PERSONAL_WORKBENCH_DATA_DIR"]=data;start.EnvironmentVariables["PERSONAL_WORKBENCH_PORT"]=port.ToString();
        if(Program.Flag("qa")!="")start.EnvironmentVariables["PERSONAL_WORKBENCH_DISABLE_SCHEDULER"]="1";
        backend=Process.Start(start);
        bool ready=false;
        for(int i=0;i<120;i++){try{var health=Get("/api/health");if(Convert.ToString(health["data_dir"])==Path.GetFullPath(data)&&Convert.ToString(health["installation"])==Program.Backend){ready=true;break;}}catch(WebException){}if(backend.HasExited)break;await Task.Delay(150);}
        if(!ready)throw new ApplicationException("本地服务未能启动，请查看数据目录中的 logs\\desktop-server.log。其他工作台不会被关闭。");
        var options=new CoreWebView2EnvironmentOptions();if(Program.Flag("qa")!="")options.AdditionalBrowserArguments="--disable-background-networking --proxy-server=http://127.0.0.1:9 --proxy-bypass-list=127.0.0.1;localhost";
        var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(data,"browser"),options);await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.Settings.AreDevToolsEnabled=Program.Flag("qa")!="";web.CoreWebView2.Settings.IsStatusBarEnabled=false;web.CoreWebView2.Settings.IsZoomControlEnabled=true;
        web.CoreWebView2.NavigationStarting+=(s,e)=>{if(!e.Uri.StartsWith(url+"/",StringComparison.OrdinalIgnoreCase)&&e.Uri!="about:blank"){e.Cancel=true;if(e.Uri.StartsWith("https://")||e.Uri.StartsWith("http://"))Process.Start(new ProcessStartInfo(e.Uri){UseShellExecute=true});}};
        web.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;if(e.Uri.StartsWith("https://")||e.Uri.StartsWith("http://"))Process.Start(new ProcessStartInfo(e.Uri){UseShellExecute=true});};
        web.CoreWebView2.DownloadStarting+=(s,e)=>{string folder=Path.Combine(data,"exports");Directory.CreateDirectory(folder);string name=Path.GetFileName(e.ResultFilePath);string path=Path.Combine(folder,name);if(File.Exists(path))path=Path.Combine(folder,Path.GetFileNameWithoutExtension(name)+"-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+Path.GetExtension(name));e.ResultFilePath=path;};
        web.NavigationCompleted+=async(s,e)=>{
            if(!e.IsSuccess)return;
            token=await web.ExecuteScriptAsync("document.querySelector('meta[name=workbench-token]').content");token=Program.Json.Deserialize<string>(token);
            if(Program.Flag("qa")=="")return;
            string qaPage=Program.Flag("qa-page");
            bool majorQa=qaPage=="major";
            string qaReadyScript=qaPage=="templates"?"Boolean(document.querySelector('#v22-template-body'))":qaPage=="projects"?"Boolean(document.querySelector('.project-detail'))":majorQa?"Boolean(document.querySelector('#major-main') && document.querySelector('#major-side'))":"Boolean(document.querySelector('.day-strip') && document.querySelector('.matrix-head h2')?.textContent==='今日事项')";
            for(int i=0;i<100;i++){if(await web.ExecuteScriptAsync(qaReadyScript)=="true")break;await Task.Delay(100);}
            for(int i=0;i<30;i++){if(await web.ExecuteScriptAsync("document.getAnimations().some(a=>a.playState==='running')")=="false")break;await Task.Delay(100);}
            string proof=await web.ExecuteScriptAsync("JSON.stringify({title:document.title,page:state.page,version:state.data.product_version,days:document.querySelectorAll('.day-btn').length,datePicker:!!document.querySelector('#home-date'),heading:document.querySelector('.matrix-head h2')?.textContent,quadrants:document.querySelectorAll('.quadrant').length,data:state.data.tasks.length,majorEditors:document.querySelectorAll('.major-editors .rte-editor').length,records:document.querySelectorAll('.major-record').length,overflow:document.documentElement.scrollWidth>innerWidth})");
            if(Program.Flag("qa-report")!=""){var qaEvidence=Program.Json.Deserialize<Dictionary<string,object>>(Program.Json.Deserialize<string>(proof));int menuCount=0;foreach(Control c in Controls)if(c is MenuStrip)menuCount++;qaEvidence["native_menu_count"]=menuCount;qaEvidence["native_title"]=Text;File.WriteAllText(Program.Flag("qa-report"),Program.Json.Serialize(qaEvidence),Encoding.UTF8);}
            if(Program.Flag("qa-screenshot")!="")using(var stream=File.Create(Program.Flag("qa-screenshot")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
            if(Program.Flag("qa-download")!=""){web.CoreWebView2.DownloadStarting+=(ds,de)=>{de.DownloadOperation.StateChanged+=(os,oe)=>{if(de.DownloadOperation.State==CoreWebView2DownloadState.Completed)File.WriteAllText(Program.Flag("qa-download"),de.ResultFilePath,Encoding.UTF8);};};await web.ExecuteScriptAsync("(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['# 离线导出验收'],{type:'text/markdown'}));a.download='离线验收.md';a.click()})()");}
            qaTimer=new System.Windows.Forms.Timer{Interval=20000};qaTimer.Tick+=async(ts,te)=>{qaTimer.Stop();await ExitNotebook(true);};qaTimer.Start();
        };
        web.CoreWebView2.Navigate(url+(Program.Flag("qa-page")=="templates"?"/?page=settings&tab=templates":Program.Flag("qa-page")=="projects"?"/?page=projects":Program.Flag("qa-page")=="major"?"/?page=major":"/"));
    }
    async Task<bool> CanExit() {
        if(web.CoreWebView2==null)return true;
        string dirty=await web.ExecuteScriptAsync("Boolean(state.quickDraft||state.homeLogDraft||state.scratchDraft||typeof M!=='undefined'&&(M.dirty||M.wordBusy||M.aiBusy)||state.reportDraft!==null&&state.reportEditing||typeof dossierDirty==='function'&&dossierDirty()||typeof V22!=='undefined'&&(v22TemplateDirty()||V22.reportBusy)||typeof V25!=='undefined'&&(v25SettingsDirty()||V25.busy)||document.querySelector('.daily-task-edit')||document.querySelector('#modal[open]'))");
        if(dirty=="true"&&MessageBox.Show(this,"有尚未保存的输入。请先保存，或选择继续退出并放弃这些输入。","工作笔记",MessageBoxButtons.OKCancel,MessageBoxIcon.Information)!=DialogResult.OK)return false;
        try{if(Convert.ToBoolean(Get("/api/desktop/busy")["busy"])){MessageBox.Show(this,"项目资料正在处理，请等待完成后再退出或切换数据。","工作笔记");return false;}}catch(WebException){if(backend!=null&&!backend.HasExited){MessageBox.Show(this,"本地服务暂时无法响应，请稍后再退出。","工作笔记");return false;}}
        return true;
    }
    async Task StopBackend() {
        if(backend==null)return;
        if(!backend.HasExited&&token!=null){try{using(WebClient client=new WebClient()){client.Proxy=null;client.Headers["X-Workbench-Token"]=token;client.Headers["Content-Type"]="application/json";await client.UploadStringTaskAsync(url+"/api/shutdown","POST","{}");}}catch(WebException){}}
        if(!backend.HasExited&&!backend.WaitForExit(5000))backend.Kill();backend.Dispose();backend=null;
    }
    async Task ExitNotebook(bool force=false) {if(exiting)return;if(!force&&!await CanExit())return;exiting=true;wakeWait.Unregister(null);await StopBackend();tray.Visible=false;tray.Dispose();web.Dispose();Close();}
    async Task SwitchData() {
        if(!await CanExit())return;
        using(SetupForm setup=new SetupForm()){if(setup.ShowDialog(this)!=DialogResult.OK)return;Program.SaveLocation(setup.DataPath);}
        string executable=Application.ExecutablePath;exiting=true;wakeWait.Unregister(null);await StopBackend();tray.Dispose();web.Dispose();Close();
        // The new process waits briefly, so it can acquire the mutex after this one releases it.
        Process.Start(new ProcessStartInfo(executable,"--wait --config-dir="+Program.Quote(Program.ConfigRoot)){UseShellExecute=false,CreateNoWindow=true});
    }
}
internal static class Native {
    internal static IntPtr HWND_BROADCAST=new IntPtr(0xffff);
    [System.Runtime.InteropServices.DllImport("user32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)] static extern uint RegisterWindowMessage(string message);
    internal static int ShowMessage=(int)RegisterWindowMessage("WorkNotes.Show.1");
    [System.Runtime.InteropServices.DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam);
}
