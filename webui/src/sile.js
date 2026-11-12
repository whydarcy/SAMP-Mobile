import { createPushToTalk } from './push-to-talk.js';
import { createSileRadar } from './sile-radar.js';
import { parseUiCommands, executeUiOperations, uiGlobalNames, summarizeUiCommand } from './sile-protocol.js';
import { createBridge } from './bridge.js';
import './sile.css';
import { mapServerDialog, makeDialogReply } from './samp-dialog.js';
const bridge = createBridge(text => window.client.postMessage(text));
window.gtaUi = { receive: bridge.receive };
const tools = document.getElementById('gta-tools');
const owners = new Map();
const sounds = new Map();
let state = {}, lastState = 0, active = false, lastFocus = false, toastTimer;
const MAIN = 910001, VEHICLE = 910002, KEYBOARD = 910003, DEMO = 910004, PLAYERS = 910005, GRAPHICS = 910006;
let serverDialog = null;
let sileSession=0,serverHudVisible=true,serverUiChain=Promise.resolve();
const serverWindows=new Set();
let cefRadar=null;
let pushToTalk=null;
const protocolStats={received:0,applied:0,errors:[],lastTypes:[]};
function hasServerModal(){return [...serverWindows].some(name=>window.getInterfaceStatus?.(name)&&window.component(name)?.show!==false&&!window.component(name)?.options?.hud);}
function resetServerUi(session){
  if(session===sileSession)return;
  for(const name of serverWindows)if(window.getInterfaceStatus?.(name))window.closeInterface(name);
  serverWindows.clear();sileSession=session;serverHudVisible=true;
  hideKeyboard();syncFocus();
}
async function waitForInterface(name,session=sileSession){
  if(!/^[A-Za-z][\w]*$/.test(name)||!window.component(name))throw Error('Unavailable interface '+name);
  const start=Date.now();
  while(!window.interface(name)){
    if(session!==sileSession)throw Error('Stale UI session');
    if(Date.now()-start>5000)throw Error('Interface load timeout '+name);
    await new Promise(resolve=>setTimeout(resolve,16));
  }
  return window.interface(name);
}
async function openServerInterface(name,params,strings=[]){
  if(!/^[A-Za-z][\w]*$/.test(name)||!window.component(name))throw Error('Unavailable interface '+name);
  setPanelExpanded(false);chat()?.close();
  await window.openInterface(name,params,strings);
  if(!['Hud','ScreenNotification','ToastNotifications'].includes(name))serverWindows.add(name);
  await waitForInterface(name);syncFocus();
}
function closeServerInterface(name){
  if(!/^[A-Za-z][\w]*$/.test(name))throw Error('Invalid interface name');
  if(window.getInterfaceStatus(name))window.closeInterface(name);serverWindows.delete(name);hideKeyboard();syncFocus();
}
function uiApi(session){
  const globals=Object.fromEntries(uiGlobalNames.filter(name=>typeof window[name]==='function').map(name=>[name,window[name].bind(window)]));
  globals.openInterface=openServerInterface;globals.closeInterface=closeServerInterface;
  const client={setHudStatus(value){serverHudVisible=!!value;if(hud())hud().info.show=serverHudVisible&&!!state.playerReady;},setChatStatus(value){if(chat())chat().show=!!value;},setCursorStatus(value){owners.set('server',!!value);syncFocus();}};
  return {globals,client,getServerName:()=>window.getServerName(),metadata:(name,args)=>{if(!['EndedInitializeMobile','EndedInitializeBrowser'].includes(name))throw Error('Unsupported metadata callback');sendServerUi(name,args);},exists:name=>!!window.getInterfaceStatus(name)&&!!window.interface(name),constants:{gm:window.gm,window:Object.fromEntries(Object.entries(window).filter(([key,v])=>key.startsWith('KEY_CODE_')&&typeof v==='number'))},active:()=>session===sileSession&&session>0,interface:name=>waitForInterface(name,session)};
}
function receiveServerUi(packet){
  if(packet.reset){resetServerUi(Number(packet.session)||0);return;}
  if(!Number.isInteger(packet.session)||packet.session<1||!Array.isArray(packet.args))return;
  if(packet.session!==sileSession)resetServerUi(packet.session);
  const session=packet.session;protocolStats.received++;
  protocolStats.lastTypes.push({type:packet.type,strings:packet.args.length,shape:packet.type===2?summarizeUiCommand(packet.args[0]||''):packet.args.map(arg=>typeof window[arg]==='function'||window.component(arg)?arg:'<data>').join(',')});if(protocolStats.lastTypes.length>20)protocolStats.lastTypes.shift();
  serverUiChain=serverUiChain.then(async()=>{
    if(session!==sileSession)return;
    if(packet.type===4){const [name,params,...strings]=packet.args;await openServerInterface(name,params,strings);}
    else if(packet.type===5){closeServerInterface(packet.args[0]);}
    else if(packet.type===2){for(const command of packet.args)await executeUiOperations(parseUiCommands(command),uiApi(session));}
    else throw Error('Unsupported UI packet type '+packet.type);
    protocolStats.applied++;syncFocus();
  }).catch(error=>{
    protocolStats.errors.push((String(error.message)+' [type '+packet.type+'; '+(packet.type===2?summarizeUiCommand(packet.args[0]||''):packet.args.map(arg=>typeof window[arg]==='function'||window.component(arg)?arg:'<data>').join(','))+']').slice(0,220));if(protocolStats.errors.length>20)protocolStats.errors.shift();
    console.warn('[Sile UI]',String(error.message).slice(0,160));syncFocus();
  });
}
function sendServerUi(name,values){
  if(!sileSession||!state.connected)return;
  bridge.request('Client.SileEvent',{session:sileSession,name,values:values.map(value=>value&&typeof value==='object'?JSON.stringify(value):value)}).catch(error=>toast(error.message));
}

const shortcuts = document.getElementById("gta-shortcuts");
let keyboardMode = localStorage.getItem('gta.keyboard') === 'android' ? 'android' : 'game';
const hud = () => window.interface?.('Hud');
const chat = () => hud()?.$refs?.chat;
const escape = value => String(value).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function toast(value) {
  const node = document.getElementById('gta-toast'); node.textContent = value; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 3500);
}
function syncFocus() {
  if (hud()) hud().isShowControllers = false;
  const focus = active && (hasServerModal() || [...owners.values()].some(Boolean) || !!window.App?.dialogsQueue.length || !!window.App?.showKeyboard || !!chat()?.isOpen || !!window.getInterfaceStatus?.("MainMenu"));
  document.body.classList.toggle("gta-modal",focus);
  if(focus)pushToTalk?.stop();
  if (focus !== lastFocus) { lastFocus = focus; bridge.emit('Ui.Focus', { active: focus }); requestAnimationFrame(hitRegions); }
}
function hitRegions() {
  for(const button of document.querySelectorAll('.mobile-button'))button.dataset.gtaHit='';
  const regions = active ? [...document.querySelectorAll('[data-gta-hit] button')].filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden').map(button => {
    const r=button.getBoundingClientRect();
    return {left:Math.max(0,r.left/innerWidth),top:Math.max(0,r.top/innerHeight),right:Math.min(1,r.right/innerWidth),bottom:Math.min(1,r.bottom/innerHeight)};
  }).filter(r=>r.right>r.left&&r.bottom>r.top) : [];
  bridge.emit('Ui.HitRegions',{regions});
}
function setPanelExpanded(value) {
  document.getElementById('gta-shortcuts-panel').hidden=!value;
  document.getElementById('gta-shortcuts-toggle').hidden=value;
  document.getElementById('gta-shortcuts-toggle').setAttribute('aria-expanded',String(value));
  requestAnimationFrame(hitRegions);
}
function closeDialogs() {
  for(let i=0;window.App?.dialogsQueue.length && i<32;i++)window.closeLastDialog();
}
function hideKeyboard() { window.hideKeyboard?.(); bridge.emit('Ui.Keyboard', {native:false}); }
function closeAll() {
  for(const sound of sounds.values())sound.pause();sounds.clear();
  setPanelExpanded(false);hideKeyboard(); chat()?.close(); if(window.getInterfaceStatus?.("MainMenu"))window.closeInterface("MainMenu");closeDialogs();
  owners.clear(); document.activeElement?.blur(); syncFocus();
}
function setActive(value) {
  if (active === value) return;
  active = value; document.body.classList.toggle('gta-active', active);
  if (!active){pushToTalk?.stop();closeAll();}
  hitRegions();
  if(active&&serverDialog)queueMicrotask(()=>presentServerDialog(serverDialog));
}
function openDialog(id,type,title,body,prefill='') {
  if (!active) return;
  if(serverDialog){toast('Сначала ответь на диалог сервера');return;}
  setPanelExpanded(false);chat()?.close(); hideKeyboard();
  window.addDialogInQueue(JSON.stringify([id,type,title,'',type===2?'Выбрать':'Готово','Назад',false,false,prefill]),body);
  syncFocus();
}
function menu() { openDialog(MAIN,2,'Меню GTA',['На спавн','Возродиться','К метке','Создать транспорт','Клавиатура','Графика','Пример диалога'].join('<n>')); }
async function command(text) {
  try { await bridge.request('Client.Command',{text}); toast('Команда отправлена'); }
  catch(error) { toast(error.message); }
}
function response(id, accepted, index, text) {
  if(serverDialog && id===mapServerDialog(serverDialog).uiId) {
    const packet=serverDialog;serverDialog=null;hideKeyboard();
    bridge.request('Client.DialogResponse',makeDialogReply(packet,Number(accepted),index,text)).catch(error=>toast(error.message));
    queueMicrotask(syncFocus);return;
  }
  if (!accepted) return;
  if (id===MAIN) {
    if(index<3 && index>=0) command(['/spawn','/respawn','/tp'][index]);
    else if(index===3) queueMicrotask(()=>openDialog(VEHICLE,1,'Создать транспорт','ID модели от 400 до 19000','411'));
    else if(index===4) queueMicrotask(()=>openDialog(KEYBOARD,2,'Клавиатура',['Игровая Sile','Системная клавиатура'].join('<n>')));
    else if(index===5)queueMicrotask(()=>openDialog(GRAPHICS,2,'Графика — после перезапуска',['Производительность — 67%','Баланс — 75%','Качество — 100%'].join('<n>')));
    else if(index===6)queueMicrotask(demoDialog);
  } else if(id===VEHICLE) {
    const model=Number(text);
    if(Number.isInteger(model)&&model>=400&&model<=19000) command(`/veh ${model}`);
    else toast('Укажи модель от 400 до 19000');
  } else if(id===GRAPHICS) {
    const percent=[67,75,100][index];if(percent)bridge.request('Client.Graphics',{percent}).then(()=>toast('Профиль '+percent+'% сохранён. Перезапусти игру.')).catch(error=>toast(error.message));
  } else if(id===KEYBOARD) {
    keyboardMode=index===1?'android':'game';localStorage.setItem('gta.keyboard',keyboardMode);
    window.setUseNativeKeyboard(keyboardMode==='android');toast(keyboardMode==='android'?'Системная клавиатура':'Игровая клавиатура Sile');
  }
}
function demoDialog() {
  openDialog(DEMO,0,'Добро пожаловать',`Интерфейсы Sile подключены к GTA.<n><n>{F4BF19}Диалоги, список игроков и быстрые клавиши<n>{FFFFFF}работают в одном стиле.<n><n>Сервер: ${escape(state.address||'s1.sile.games')}:${state.port||7777}`);
}
function presentServerDialog(packet) {
  const mapped=mapServerDialog(packet);serverDialog=packet;
  if(!active)return;
  setPanelExpanded(false);hideKeyboard();chat()?.close();
  if(window.getInterfaceStatus('MainMenu'))window.closeInterface('MainMenu');
  closeDialogs();
  window.addDialogInQueue(JSON.stringify(mapped.params),mapped.body);
  syncFocus();
}
async function panelAction(action) {
  try {
    if(action==='MAP'){setPanelExpanded(false);window.openMainMenuFromUI('map');syncFocus();return;}
    if(action==='CHAT'){setPanelExpanded(false);chat()?.open();syncFocus();return;}
    if(action==='I'){sendServerUi('OnInventoryDisplayChange',[]);return;}
    const serverKeys={P:80,M:77,Z:90};
    if(serverKeys[action]){sendServerUi('OnPlayerClientSideKey',[serverKeys[action]]);return;}
    if(action==='TAB') {
      const data=await bridge.request('Client.Players');
      const rows=['ID<t>Игрок<t>Счёт<t>Пинг',...data.players.map(p=>[p.id,escape(p.name),p.score,p.ping].join('<t>'))];
      openDialog(PLAYERS,5,escape(data.server||'Игроки'),rows.join('<n>'));
    } else await bridge.request('Client.Control',{action});
  }catch(error){toast(error.message);}
}
function playLocalSound(id,path,volume,loop) {
  const file=String(path).replace(/^uiresources\/sounds\//,'').replace(/^sounds\//,'');
  if(!file || file.split('/').includes('..') || /^(?:https?:|file:|data:)/i.test(file))return;
  sounds.get(id)?.pause();
  if(sounds.size>=32){const first=sounds.keys().next().value;sounds.get(first).pause();sounds.delete(first);}
  const sound=new Audio('/assets/sile-cache/sounds/'+file);sound.volume=Math.min(1,Math.max(0,Number(volume)||0));sound.loop=!!loop;
  sound.onended=()=>{sounds.delete(id);window.engine._trigger('OnSoundEnded',id);};
  sounds.set(id,sound);sound.play().catch(()=>sounds.delete(id));
}
function nativeEvent(name,...args) {
  switch(name) {
    case 'SetChatInputStatus':if(!args[0])hideKeyboard();
    case 'SetCursorStatus':case 'SetInputFocus':
      owners.set(name,!!args[0]);syncFocus();return;
    case 'Sound_Create2D':playLocalSound(args[0],args[1],args[2],args[4]);return;
    case 'Sound_Destroy':sounds.get(args[0])?.pause();sounds.delete(args[0]);return;
    case 'Sound_Pause':sounds.get(args[0])?.pause();return;
    case 'OpenKeyboard':bridge.emit('Ui.Keyboard',{native:true});return;
    case 'SendChatInput': {
      const text=String(args[0]??'').trim();if(!text)return;
      bridge.request(text.startsWith('/')?'Client.Command':'Client.Chat',{text}).catch(error=>toast(error.message));return;
    }
    case 'SendClientEvent': {
      try {
        const packet=JSON.parse(args[0]);if(packet.event!==0||!Array.isArray(packet.args)||typeof packet.args[0]!=='string')return;
        const [name,...values]=packet.args;
        if(name==='OnDialogResponse'&&([MAIN,VEHICLE,KEYBOARD,DEMO,PLAYERS,GRAPHICS].includes(values[0])||(serverDialog&&values[0]===mapServerDialog(serverDialog).uiId)))response(...values);
        else if(name==='GPS_OnPlayerSetPoint'){const x=Number(values[1]),y=Number(values[0]);if(Number.isFinite(x)&&Number.isFinite(y))bridge.request('Client.MapMark',{x,y,clear:x===0&&y===0}).catch(error=>toast(error.message));sendServerUi(name,values);}
        else sendServerUi(name,values);
      }catch{}return;
    }
    default:return;
  }
}
function applyState(value) {
  if(Number.isInteger(value.sileSession)&&value.sileSession!==sileSession)resetServerUi(value.sileSession);
  state=value;lastState=Date.now();setActive(!value.paused);document.body.classList.toggle("gta-in-vehicle",!!value.inVehicle);
  const h=hud();if(!h)return;
  h.radar.show=serverHudVisible&&!!value.playerReady;h.isShowControllers=false;h.isShowRadar=serverHudVisible&&!!value.playerReady;h.isShowRadarButtons=serverHudVisible&&!!value.playerReady;h.isHudControls=true;h.voiceChat.show=false;h.time.show=false;
  Object.assign(h.info,{show:serverHudVisible&&!!value.playerReady,health:value.health||0,armour:value.armour||0,money:value.money||0,weapon:value.weapon||0,ammoInClip:value.ammoInClip||0,totalAmmo:value.totalAmmo||0,id:value.playerId||0,online:value.online||0});
  h.speedometer.show=!!value.inVehicle;h.setSpeed(value.speed||0);
  h.speedometer.controls.state=0;
  const voice=document.getElementById('gta-voice');voice.disabled=!value.connected||!value.playerReady||!value.voiceEnabled;if(voice.disabled)pushToTalk?.stop();
  document.getElementById('gta-key-h').textContent=value.inVehicle?'D/B':'H';
  document.getElementById('gta-server-address').textContent=(value.address||'s1.sile.games')+':'+(value.port||7777);
  for(const button of document.querySelectorAll('[data-control]'))button.disabled=!value.connected||!value.playerReady;
  if(window.App)window.App.buildDateStatus=false;
  cefRadar?.update(value);
  if(value.position)window.engine._trigger('UpdatePlayerPosition',value.position.x,value.position.y,value.position.z,value.heading||0,value.interior||0);
  window.setPlayerConnectedStatus?.(!!value.connected);window.setPlayerNickName?.(value.name||'');window.setPlayerMoney?.(value.money||0);
  syncFocus();
}
function onChat(value) {if(chat())window.onChatMessage(escape(value.text),'0x'+value.color);}
function onBack() {
  if(window.App.showKeyboard){hideKeyboard();document.activeElement?.blur();owners.set('SetInputFocus',false);}
  else if(serverDialog){const packet=serverDialog;serverDialog=null;closeDialogs();bridge.request('Client.DialogResponse',makeDialogReply(packet,0,-1,'')).catch(error=>toast(error.message));}
  else if(window.App.dialogsQueue.length)window.closeLastDialog();
  else if(hasServerModal()){hideKeyboard();document.activeElement?.blur();}
  else if(window.getInterfaceStatus?.("MainMenu"))window.closeInterface("MainMenu");
  else chat()?.close();
  queueMicrotask(syncFocus);
}
async function boot() {
  // The cache includes its own Vue runtime and Cohtml-compatible engine event bus.
  await import(/* @vite-ignore */ '/assets/sile-cache/assets/index.js');
  window.engine.TriggerEvent=nativeEvent;

  window.App.platform=window.client?.platform==='iOS'?'iOS':'Android';window.App.engine='gta';window.App.deviceModel='GTA Mobile';
  window.App.deviceScreen={width:innerWidth,height:innerHeight,safeArea:{left:0,top:0,right:innerWidth,bottom:innerHeight}};
  window.App.onResize();window.setUseNativeKeyboard(keyboardMode==='android');
  await window.App.$nextTick();
  const started=Date.now();
  while(!hud()?.$refs?.chat){if(Date.now()-started>10000)throw Error('Cached Sile HUD not initialized');await new Promise(resolve=>setTimeout(resolve,30));}
  window.confirmBrowserInitialize();
  // Cache entries are [index,priority]; its original delete uses the whole tuple.
  // Remove the component by index as well, so repeated dialogs do not accumulate.
  const closeCachedDialog=window.App.closeLastDialog.bind(window.App);
  window.App.closeLastDialog=()=>{
    const entry=window.App.dialogsQueue[0];if(!entry)return;
    closeCachedDialog();delete window.App.components['Window'+entry[0]];window.App.$forceUpdate();
  };
  window.App.clearAllDialogs=closeDialogs;

  cefRadar=createSileRadar({bridge,refreshHitRegions:hitRegions,openMap:()=>{window.openMainMenuFromUI('map');syncFocus();}});
  bridge.on('State',applyState);bridge.on('Chat.Message',onChat);bridge.on('Ui.Back',onBack);
  bridge.on('Server.Sile',receiveServerUi);
  bridge.on('Server.Dialog',presentServerDialog);
  bridge.on('Server.DialogClosed',data=>{if(serverDialog&&serverDialog.token===data.token){serverDialog=null;hideKeyboard();closeDialogs();document.activeElement?.blur();owners.set('SetInputFocus',false);syncFocus();}});
  bridge.on('Ui.Reset',()=>{bridge.reset();setActive(false);closeAll();});
  bridge.on('Ui.KeyboardHidden',()=>{if(window.App.showKeyboard==='native'){hideKeyboard();document.activeElement?.blur();owners.set('SetInputFocus',false);syncFocus();}});
  bridge.on('Ui.Open',data=>{if(data?.name==='chat'){chat()?.open();syncFocus();}else menu();});
  document.addEventListener('focusin',event=>{
    const target=event.target;if(!target.matches('input,textarea'))return;
    window.currentKeyboardInput=target;target.maxLength=serverDialog?255:144;
    let privateInput=serverDialog?.style===3||target.type==='password';
    for(let component=target.__vueParentComponent,depth=0;component&&depth<8;component=component.parent,depth++)if(component.props?.private===true||component.props?.data?.type==='password')privateInput=true;
    if(privateInput){target.type='password';target.autocomplete='off';}
    if(window.getInterfaceStatus?.('Authorization'))target.maxLength=64;
    target.inputMode=keyboardMode==='android'?'text':'none';
    if(!window.App.showKeyboard)window.showKeyboard(keyboardMode==='android'?'native':'game');
    syncFocus();
  },true);
  document.addEventListener('focusout',()=>queueMicrotask(syncFocus),true);
  const showKeyboard=window.showKeyboard;
  window.showKeyboard=(mode)=>{showKeyboard(mode);syncFocus();};
  const oldHide=window.hideKeyboard;
  window.hideKeyboard=()=>{oldHide();bridge.emit('Ui.Keyboard',{native:false});queueMicrotask(syncFocus);};
  document.getElementById('gta-shortcuts-toggle').onclick=event=>{event.stopPropagation();setPanelExpanded(true);};
  document.getElementById('gta-shortcuts-close').onclick=event=>{event.stopPropagation();setPanelExpanded(false);};
  document.getElementById('gta-demo-dialog').onclick=event=>{event.stopPropagation();menu();};
  for(const button of document.querySelectorAll('[data-control]'))button.onclick=event=>{event.stopPropagation();panelAction(button.dataset.control);};
  document.getElementById('gta-chat').onclick=event=>{event.stopPropagation();chat().open();syncFocus();};
  document.getElementById('gta-menu').onclick=event=>{event.stopPropagation();window.openMainMenuFromUI('map');syncFocus();};
  const voice=document.getElementById('gta-voice');
  pushToTalk=createPushToTalk(value=>bridge.request('Client.Voice',{active:value}),value=>{voice.classList.toggle('recording',value);voice.setAttribute('aria-pressed',String(value));});
  voice.onpointerdown=event=>{if(voice.disabled)return;event.preventDefault();voice.setPointerCapture(event.pointerId);pushToTalk.start();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])voice.addEventListener(name,()=>pushToTalk.stop());
  window.addEventListener('blur',()=>pushToTalk.stop());document.addEventListener('visibilitychange',()=>{if(document.hidden)pushToTalk.stop();});
  document.getElementById('gta-commands').onclick=event=>{event.stopPropagation();menu();};
  window.addEventListener('resize',()=>{window.App.onResize();hitRegions();});
  const resizeObserver=new ResizeObserver(hitRegions);resizeObserver.observe(tools);resizeObserver.observe(shortcuts);
  setInterval(()=>{if(Date.now()-lastState>1500)setActive(false);syncFocus();},250);
  window.gtaSile={getRadarState:()=>cefRadar?.getState(),getProtocolState:()=>({session:sileSession,received:protocolStats.received,applied:protocolStats.applied,errors:[...protocolStats.errors],lastTypes:[...protocolStats.lastTypes],openWindows:[...serverWindows].filter(name=>window.getInterfaceStatus(name))}),getState:()=>state,getKeyboardMode:()=>keyboardMode,demoDialog,openMainMenu:()=>{window.openMainMenuFromUI('map');syncFocus();}};
  bridge.emit('Ui.Ready',{protocol:1,renderer:'sile-cache'});
}
boot().catch(()=>{console.error('Cached Sile UI initialization failed');bridge.emit('Ui.Fallback');});
