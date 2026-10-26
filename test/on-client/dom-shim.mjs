// 시험용 아주 작은 DOM 모형: createElement·setAttribute·append·textContent·addEventListener·select.value 만 흉내 냅니다.
// 브라우저 동작을 대신 인증하지 않습니다. 실제 화면 확인은 npm run demo 로 따로 합니다.
export class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this._text = ''; this.handlers = {}; this._value = undefined; this.disabled = false; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'disabled') this.disabled = true; }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  dispatch(type) { for (const fn of this.handlers[type] ?? []) fn({ target: this }); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  get value() { if (this._value !== undefined) return this._value; const first = this.children.find(c => c.tag === 'option'); return first ? first.attrs.value : ''; }
  set value(v) { this._value = v; }
  find(predicate, out = []) { if (predicate(this)) out.push(this); this.children.forEach(c => c.find(predicate, out)); return out; }
  byAttr(name, value) { return this.find(n => n.attrs[name] === value); }
  byName(name) { return this.find(n => n.attrs['aria-label'] === name); }
}
export function installDom() { globalThis.document = { createElement: tag => new FakeNode(tag) }; }
