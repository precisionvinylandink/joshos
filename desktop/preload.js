const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('electronAPI',{
  loadData:()=>ipcRenderer.invoke('load-data'),
  saveData:d=>ipcRenderer.invoke('save-data',d),
  saveDataSync:d=>ipcRenderer.sendSync('save-data-sync',d),
});
