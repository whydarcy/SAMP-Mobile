// One transport, shared by Android WebView and the local browser preview.
export function createBridge(post, { timeout = 5000, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  function packet(event, args, id) {
    if (typeof event !== 'string' || !/^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(event)) throw new Error('Некорректное событие');
    const text = JSON.stringify({ v: 1, id, event, args });
    if (new TextEncoder().encode(text).length > 16384) throw new Error('Слишком большое сообщение');
    return text;
  }
  function on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => { const set = listeners.get(event); set?.delete(listener); if (!set?.size) listeners.delete(event); };
  }
  function receive(raw) {
    let message;
    try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return false; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    if (Number.isSafeInteger(message.replyTo) && typeof message.ok === 'boolean') {
      const task = pending.get(message.replyTo);
      if (!task) return false;
      pending.delete(message.replyTo); cancel(task.timer);
      if (message.ok) task.resolve(message.result);
      else task.reject(new Error(typeof message.error === 'string' ? message.error : 'Ошибка игры'));
      return true;
    }
    if (typeof message.event !== 'string' || !Array.isArray(message.args)) return false;
    for (const listener of [...(listeners.get(message.event) || [])]) listener(...message.args);
    return true;
  }
  function emit(event, ...args) { post(packet(event, args, 0)); }
  function request(event, ...args) {
    const id = nextId++;
    if (nextId > 2147483647) nextId = 1;
    return new Promise((resolve, reject) => {
      let text;
      try { text = packet(event, args, id); } catch (error) { reject(error); return; }
      const timer = schedule(() => { pending.delete(id); reject(new Error('Игра не ответила. Повтори действие.')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      try { post(text); } catch (error) { cancel(timer); pending.delete(id); reject(error); }
    });
  }
  function reset() {
    for (const task of pending.values()) { cancel(task.timer); task.reject(new Error('Окно было закрыто')); }
    pending.clear();
  }
  return { on, receive, emit, request, reset };
}

export function installBridge(host = window) {
  let bridge;
  const native = !!host.client?.postMessage;
  const demoState = { connected: true, playerReady: true, name: 'Alexandr_Suvorov', health: 100, armour: 0, speed: 0, ping: 12, inVehicle: false, position: { x: 1759.02, y: -1898.13, z: 100 } };
  const post = native ? text => host.client.postMessage(text) : text => {
    // Browser preview never connects to a game or sends server commands.
    const message = JSON.parse(text);
    queueMicrotask(() => {
      if (message.event === 'Ui.Ready') bridge.receive({ event: 'State', args: [demoState] });
      if (message.id) bridge.receive({ replyTo: message.id, ok: true, result: message.event === 'Ui.RequestState' ? demoState : { protocol: 1, preview: true } });
    });
  };
  bridge = createBridge(post);
  host.gtaUi = { receive: bridge.receive };
  host.engine = { on: bridge.on, trigger: bridge.emit };
  return { ...bridge, native };
}
