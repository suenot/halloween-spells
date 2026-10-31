// Игровые элементы управления вместо нативных select/input/checkbox.
import { h } from "./dom.js";

/** Плитки выбора. options: [{id, name, icon, color?, hint?}]. nullable: можно снять выбор. */
export function tiles(options, value, onChange, { nullable = false, cols } = {}) {
  const box = h("div", { class: "tiles", role: "radiogroup", style: cols ? { "--cols": cols } : null });
  const paint = (v) => box.replaceChildren(...options.map((o, i) =>
    h("button", { type: "button", role: "radio", "aria-checked": String(o.id === v), class: `tile${o.id === v ? " on" : ""}`, style: { "--c": o.color ?? "var(--purple)", "--i": i },
      title: o.hint ?? o.name, onclick: () => { const nv = nullable && o.id === v ? null : o.id; paint(nv); onChange(nv); } },
      h("span", { class: "ti" }, o.icon ?? "•"), h("span", { class: "tn" }, o.name))));
  paint(value);
  return box;
}

/** Переключатель-тумблер с подписью. */
export function toggle(label, checked, onChange, { hint } = {}) {
  let on = !!checked;
  const el = h("button", { type: "button", role: "switch", "aria-checked": String(on), class: `switch${on ? " on" : ""}`, onclick: () => {
    on = !on; el.classList.toggle("on", on); el.setAttribute("aria-checked", String(on)); onChange(on);
  } }, h("i", { class: "knob" }), h("span", {}, label), hint ? h("small", {}, hint) : null);
  return el;
}

/** Степпер: − значение + и быстрые шаги по ползунку. */
export function stepper({ value, min, max, step = 1, unit = "", big = 5, onChange, label }) {
  let v = value ?? Math.round((min + max) / 2);
  const out = h("output", { class: "sv" });
  const range = h("input", { type: "range", min, max, step, value: v, "aria-label": label, oninput: (e) => set(Number(e.target.value)) });
  const set = (n) => { v = Math.max(min, Math.min(max, n)); out.textContent = `${v}`; range.value = v; unitEl.textContent = unit; onChange(v); };
  const unitEl = h("em", {}, unit);
  const btn = (txt, d) => h("button", { type: "button", class: "sb", onclick: () => set(v + d), "aria-label": `${d > 0 ? "больше" : "меньше"} на ${Math.abs(d)}` }, txt);
  out.textContent = `${v}`;
  return h("div", { class: "stepper" },
    h("div", { class: "sv-row" }, btn("−", -big), btn("‹", -step), h("div", { class: "sv-box" }, out, unitEl), btn("›", step), btn("+", big)),
    range);
}

/** Сетка эмодзи-аватаров. */
export function avatarPicker(list, value, onChange) {
  return tiles(list.map((e) => ({ id: e, name: "", icon: e })), value, onChange, { cols: 8 });
}
