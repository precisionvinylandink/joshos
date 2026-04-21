const {app,BrowserWindow,ipcMain}=require('electron');
app.name='joshOS';
const path=require('path'),fs=require('fs');
const dataFile=path.join(app.getPath('userData'),'joshos-data.json');
let lastData=null;
const write=d=>{try{fs.writeFileSync(dataFile,JSON.stringify(d,null,2),'utf8');return true;}catch(e){return false;}};
let win=null;
function createWindow(){
  win=new BrowserWindow({width:1400,height:900,minWidth:900,minHeight:600,titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:16},backgroundColor:'#0a0a0a',webPreferences:{nodeIntegration:false,contextIsolation:true,preload:path.join(__dirname,'preload.js')},icon:path.join(__dirname,'assets','icon.icns'),show:false});
  win.loadFile(path.join(__dirname,'src','index.html'));
  win.once('ready-to-show',()=>win.show());
  win.on('close',()=>{if(lastData)write(lastData);});
  if(process.argv.includes('--dev'))win.webContents.openDevTools();
}
ipcMain.handle('load-data',()=>{try{if(fs.existsSync(dataFile)){const d=JSON.parse(fs.readFileSync(dataFile,'utf8'));lastData=d;return d;}}catch(e){}return null;});
ipcMain.handle('save-data',(e,d)=>{lastData=d;return write(d);});
ipcMain.on('save-data-sync',(e,d)=>{lastData=d;write(d);e.returnValue=true;});
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});});
app.on('window-all-closed',()=>{if(lastData)write(lastData);if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{if(lastData)write(lastData);});
