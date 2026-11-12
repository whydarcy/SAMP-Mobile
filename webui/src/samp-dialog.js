const escapeHtml = value => String(value ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function mapServerDialog(packet) {
  if (!packet || !Number.isInteger(packet.id) || packet.id < 0 || packet.id > 65534 || !Number.isInteger(packet.token) || packet.token < 1 || !Number.isInteger(packet.style) || packet.style < 0 || packet.style > 5) throw new Error('Некорректный диалог сервера');
  const uiId = 1000000 + packet.token;
  const style = packet.style === 4 ? 2 : packet.style;
  return {
    uiId,
    params: [uiId, style, escapeHtml(packet.title), '', escapeHtml(packet.button1), escapeHtml(packet.button2), false, false, ''],
    body: escapeHtml(packet.body).replace(/\r\n|\r|\n/g, '<n>').replace(/\t/g, '<t>'),
    private: packet.style === 3
  };
}
export function makeDialogReply(packet, accepted, item, text) {
  if (!packet || ![0,1].includes(Number(accepted))) throw new Error('Некорректный ответ диалога');
  const isList = [2,4,5].includes(packet.style);
  return { id: packet.id, token: packet.token, button: Number(accepted), item: accepted && isList ? Number(item) : -1, text: accepted && [1,3].includes(packet.style) ? String(text ?? '') : '' };
}
