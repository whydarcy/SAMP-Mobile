let nextId = 1;
window.gtaUi = { receive(packet) {
  const status = packet.event === 'Client.Status' ? packet.args[0] : packet.replyTo && packet.ok ? packet.result : null;
  if (!status || status.protocol !== 1) return;
  document.getElementById('platform').textContent = status.platform;
  document.getElementById('bridge').textContent = 'Работает · протокол ' + status.protocol;
  document.getElementById('engine').textContent = status.gameAvailable ? 'Подключён' : 'Не подключён';
  document.getElementById('status').textContent = status.gameAvailable ? 'Игровой модуль доступен.' : 'Нативное ядро работает. Для запуска игры требуется iOS-модуль GTA SA.';
}};
window.client.postMessage(JSON.stringify({v:1,id:nextId++,event:'Ui.Ready',args:[{renderer:'ios-diagnostic'}]}));
