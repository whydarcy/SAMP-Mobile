<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { installBridge } from './bridge.js';
const bridge = installBridge();
const state = reactive({ paused: false, connected: false, playerReady: false, name: '', health: 0, armour: 0, speed: 0, ping: 0, inVehicle: false, position: { x: 0, y: 0, z: 0 } });
const windows = ref([]);
const activeGame = ref(false);
const current = computed(() => windows.value.at(-1) || '');
const launcher = ref(null), input = ref(null), text = ref(''), vehicle = ref('411');
const busy = ref(false), toast = ref(''), keyboard = ref(false), language = ref('ru'), caps = ref(false);
const keyboardMode = ref(localStorage.getItem('gta.keyboard') === 'android' ? 'android' : 'game');
const history = ref([]);
let toastTimer, observer, heartbeatTimer;
let lastState = 0;
const cleanups = [];
const position = computed(() => ['x', 'y', 'z'].map(k => Number(state.position?.[k] || 0).toFixed(1)).join(' · '));
const rows = computed(() => language.value === 'ru'
  ? ['1234567890', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю.,']
  : ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm.,']);
function notify(message) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 4000); }
function open(name) { if (!['menu', 'chat', 'settings'].includes(name)) return; if (current.value !== name) windows.value.push(name); }
function hideKeyboard() { keyboard.value = false; bridge.emit('Ui.Keyboard', { native: false }); input.value?.blur(); }
function close() { hideKeyboard(); windows.value.pop(); }
function closeAll() { hideKeyboard(); windows.value = []; }
function back() { if (keyboard.value) hideKeyboard(); else close(); }
function hitRegions() {
  if (!launcher.value) return;
  const r = launcher.value.getBoundingClientRect();
  bridge.emit('Ui.HitRegions', { regions: [{ left: Math.max(0, r.left / innerWidth), top: Math.max(0, r.top / innerHeight), right: Math.min(1, r.right / innerWidth), bottom: Math.min(1, r.bottom / innerHeight) }] });
}
watch(current, async () => {
  bridge.emit('Ui.Focus', { active: !!current.value });
  await nextTick(); hitRegions();
});
watch(keyboardMode, value => {
  localStorage.setItem('gta.keyboard', value);
  hideKeyboard();
});
function focusInput() {
  if (!current.value) return;
  keyboard.value = keyboardMode.value === 'game';
  bridge.emit('Ui.Keyboard', { native: keyboardMode.value === 'android' });
}
async function showInput() { await nextTick(); input.value?.focus({ preventScroll: true }); focusInput(); }
function typeKey(value) {
  const element = input.value;
  if (!element) return;
  const start = element.selectionStart ?? text.value.length;
  const end = element.selectionEnd ?? start;
  if (value === 'backspace') {
    const before = text.value.slice(0, start); const chars = Array.from(before); chars.pop();
    const at = start === end ? chars.join('').length : start;
    text.value = text.value.slice(0, at) + text.value.slice(end);
    nextTick(() => { element.focus({ preventScroll: true }); element.setSelectionRange(at, at); });
  } else {
    const character = caps.value ? value.toUpperCase() : value;
    if (text.value.length - (end - start) + character.length > 144) return;
    text.value = text.value.slice(0, start) + character + text.value.slice(end);
    nextTick(() => { const at = start + character.length; element.focus({ preventScroll: true }); element.setSelectionRange(at, at); });
  }
}
async function command(value) {
  if (busy.value) return;
  busy.value = true;
  try { await bridge.request('Client.Command', { text: value }); notify(bridge.native ? 'Команда отправлена' : 'Предпросмотр: команда не отправляется'); }
  catch (error) { notify(error.message); }
  finally { busy.value = false; }
}
function createVehicle() {
  const model = Number(vehicle.value);
  if (!Number.isInteger(model) || model < 400 || model > 611) { notify('Укажи модель от 400 до 611'); return; }
  command(`/veh ${model}`);
}
async function send() {
  const value = text.value.trim();
  if (!value || busy.value) return;
  busy.value = true;
  try {
    await bridge.request(value.startsWith('/') ? 'Client.Command' : 'Client.Chat', { text: value });
    history.value = [value, ...history.value.filter(item => item !== value)].slice(0, 8);
    text.value = ''; notify(bridge.native ? 'Отправлено' : 'Предпросмотр: сообщение не отправляется');
  } catch (error) { notify(error.message); }
  finally { busy.value = false; }
}
function onKey(event) { if (!bridge.native && event.key === 'Escape') { event.preventDefault(); back(); } }
onMounted(async () => {
  cleanups.push(bridge.on('State', value => { if (value && typeof value === 'object') { Object.assign(state, value); lastState = Date.now(); activeGame.value = !value.paused; } }));
  cleanups.push(bridge.on('Ui.Open', data => open(data?.name || 'menu')));
  cleanups.push(bridge.on('Ui.Back', back));
  cleanups.push(bridge.on('Ui.Reset', () => { activeGame.value = false; lastState = 0; bridge.reset(); closeAll(); }));
  heartbeatTimer = setInterval(() => { if (Date.now() - lastState > 1500) { activeGame.value = false; if (current.value) closeAll(); } }, 500);
  window.addEventListener('resize', hitRegions); window.addEventListener('keydown', onKey);
  observer = new ResizeObserver(hitRegions); observer.observe(launcher.value);
  // Readiness is fire-and-forget: GTA can still be loading when HTML is ready.
  bridge.emit('Ui.Ready', { protocol: 1 });
  await nextTick(); hitRegions();
});
onUnmounted(() => {
  hideKeyboard(); bridge.emit('Ui.Focus', { active: false }); bridge.reset();
  observer?.disconnect(); clearInterval(heartbeatTimer); clearTimeout(toastTimer); cleanups.forEach(off => off());
  window.removeEventListener('resize', hitRegions); window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <button ref="launcher" v-show="activeGame || current" class="launcher" aria-label="Открыть меню" @click="current ? closeAll() : open('menu')">
    <span class="menu-mark"><i></i><i></i><i></i></span><span>МЕНЮ</span>
    <span class="connection-dot" :class="{ connected: state.connected }"></span>
  </button>
  <div v-if="current" class="scrim" @click.self="closeAll()">
    <section class="panel" :class="{ 'chat-panel': current === 'chat', 'with-keyboard': keyboard && current === 'chat' }" role="dialog" aria-modal="true" :aria-label="current === 'menu' ? 'Игровое меню' : current === 'chat' ? 'Чат и команды' : 'Настройки'">
      <header class="panel-header">
        <div class="brand"><span class="brand-mark">R</span><div><strong>RADMIR</strong><small>MOBILE</small></div></div>
        <div class="server-status"><span class="connection-dot" :class="{ connected: state.connected }"></span>{{ state.connected ? 'В игре' : 'Подключение…' }}<span v-if="!bridge.native" class="preview">Предпросмотр</span></div>
        <button class="icon-button close-button" aria-label="Закрыть окно" @click="close">×</button>
      </header>
      <template v-if="current === 'menu'">
        <div class="panel-body">
          <div class="intro"><div><p class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</p><h1>{{ state.name?.replaceAll('_', ' ') || 'Игрок' }}</h1><p class="muted">Город начинается с тебя</p></div><span class="player-id">{{ state.ping || 0 }} <small>мс</small></span></div>
          <div class="stats"><div><span class="stat-label">Здоровье</span><strong>{{ Math.round(state.health) }}<small> / 100</small></strong><div class="meter"><i :style="{ width: Math.min(100, Math.max(0, state.health)) + '%' }"></i></div></div><div><span class="stat-label">Броня</span><strong>{{ Math.round(state.armour) }}<small> / 100</small></strong><div class="meter armour"><i :style="{ width: Math.min(100, Math.max(0, state.armour)) + '%' }"></i></div></div><div><span class="stat-label">Скорость</span><strong>{{ Math.round(state.speed) }}<small> км/ч</small></strong><span class="stat-note">{{ state.inVehicle ? 'За рулём' : 'Пешком' }}</span></div></div>
          <div class="section-label">БЫСТРЫЕ ДЕЙСТВИЯ</div>
          <div class="actions"><button :disabled="busy || !state.connected" @click="command('/spawn')"><span class="action-icon">⌂</span><strong>На спавн</strong><small>Вернуться в город</small></button><button :disabled="busy || !state.connected" @click="command('/respawn')"><span class="action-icon">↻</span><strong>Возродиться</strong><small>Начать заново</small></button><button :disabled="busy || !state.connected" @click="command('/tp')"><span class="action-icon">⌖</span><strong>К метке</strong><small>Выбери точку на карте</small></button></div>
          <div class="vehicle-row"><div><strong>Личный транспорт</strong><span class="muted">Создать автомобиль по ID модели</span></div><input v-model="vehicle" type="number" inputmode="numeric" min="400" max="611" aria-label="ID модели автомобиля"><button class="primary" :disabled="busy || !state.connected" @click="createVehicle">Создать</button></div>
          <div class="nav-row"><button @click="open('chat')"><span>Чат и команды</span><b>↗</b></button><button @click="open('settings')"><span>Настройки ввода</span><b>↗</b></button></div>
        </div>
        <footer><span class="connection-dot" :class="{ connected: state.playerReady }"></span><span>{{ state.playerReady ? 'Персонаж активен' : 'Ожидание персонажа' }}</span><span class="coordinates">{{ position }}</span></footer>
      </template>
      <template v-else-if="current === 'settings'">
        <div class="panel-body settings-body"><p class="eyebrow">УПРАВЛЕНИЕ</p><h1>Клавиатура</h1><p class="muted">Выбери, как вводить текст в новом окне чата.</p><div class="keyboard-options"><button :class="{ selected: keyboardMode === 'game' }" @click="keyboardMode = 'game'"><strong>Игровая</strong><span>Крупные клавиши, русский и английский</span><b>{{ keyboardMode === 'game' ? '✓' : '○' }}</b></button><button :class="{ selected: keyboardMode === 'android' }" @click="keyboardMode = 'android'"><strong>Android</strong><span>Системная клавиатура устройства</span><b>{{ keyboardMode === 'android' ? '✓' : '○' }}</b></button></div><p class="settings-note">Меню блокирует управление персонажем. После закрытия управление возвращается в игру.</p><button class="primary" @click="close">Готово</button></div>
      </template>
      <template v-else-if="current === 'chat'">
        <div class="panel-body chat-body"><div class="chat-heading"><div><p class="eyebrow">ОБЩЕНИЕ</p><h1>Чат и команды</h1></div><button class="text-button" @click="open('settings')">{{ keyboardMode === 'game' ? 'Игровая клавиатура' : 'Клавиатура Android' }} ↗</button></div><p class="muted chat-help">Сообщения сервера видны в игровом чате. Здесь можно отправить сообщение или команду.</p><div class="history"><button v-for="item in history" :key="item" @click="text = item; showInput()"><span>{{ item }}</span><small>Повторить ↗</small></button><div v-if="!history.length" class="empty-history"><span>⌨</span><p>Начни с команды</p><div class="chips"><button @click="text = '/spawn'; showInput()">/spawn</button><button @click="text = '/tp'; showInput()">/tp</button><button @click="text = '/veh 411'; showInput()">/veh 411</button></div></div></div><form class="input-row" @submit.prevent="send"><input ref="input" v-model="text" type="text" :inputmode="keyboardMode === 'game' ? 'none' : 'text'" autocomplete="off" autocapitalize="off" :spellcheck="false" maxlength="144" placeholder="Сообщение или /команда" aria-label="Сообщение или команда" @focus="focusInput"><button type="submit" class="primary" :disabled="busy || !state.connected || !text.trim()">Отправить ↗</button></form></div>
        <div v-if="keyboard" class="game-keyboard" @pointerdown.prevent>
          <div class="keyboard-top"><span>{{ language === 'ru' ? 'РУССКИЙ' : 'ENGLISH' }}</span><span>{{ text.length }}/144</span><button @click="hideKeyboard">Скрыть ⌄</button></div>
          <div v-for="(row, index) in rows" :key="index" class="key-row"><button v-for="character in row" :key="character" class="key" @click="typeKey(character)">{{ caps ? character.toUpperCase() : character }}</button></div>
          <div class="key-row"><button class="key utility" :class="{ active: caps }" @click="caps = !caps">⇧</button><button class="key utility" @click="language = language === 'ru' ? 'en' : 'ru'">{{ language === 'ru' ? 'EN' : 'RU' }}</button><button class="key" @click="typeKey('/')">/</button><button class="key space" @click="typeKey(' ')">Пробел</button><button class="key utility" aria-label="Удалить символ" @click="typeKey('backspace')">⌫</button><button class="key utility enter" :disabled="busy || !state.connected" @click="send">↵</button></div>
        </div>
      </template>
    </section>
  </div>
  <Transition name="toast"><div v-if="toast" class="toast" role="status">{{ toast }}</div></Transition>
</template>
