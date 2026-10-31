// Native replaceChildren/append stringify null/undefined/false into text; drop them like h() does.
for (const name of ["replaceChildren", "append"]) {
  const native = Element.prototype[name];
  Element.prototype[name] = function (...kids) {
    return native.apply(this, kids.flat().filter((k) => k != null && k !== false));
  };
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function toast(text) {
  const t = h("div", { class: "toast" }, text);
  document.getElementById("toast-root").append(t);
  setTimeout(() => t.remove(), 3700);
}

export function openModal(content, { onClose } = {}) {
  const root = document.getElementById("modal-root");
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  const back = h("div", { class: "modal-back", onclick: (e) => e.target === back && close() },
    h("div", { class: "modal", role: "dialog", "aria-modal": "true" },
      h("button", { class: "modal-x", "aria-label": "Закрыть", onclick: close }, "✕"), content));
  document.addEventListener("keydown", onKey);
  root.append(back);
  return { close, el: back };
}

export function countUp(el, to, ms = 900) {
  const from = Number(el.textContent) || 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// FLIP: call before DOM reorder, returns a function to call after it
export function flip(container, selector = "[data-flip]") {
  const first = new Map([...container.querySelectorAll(selector)].map((el) => [el.dataset.flip, el.getBoundingClientRect()]));
  return () => {
    for (const el of container.querySelectorAll(selector)) {
      const a = first.get(el.dataset.flip);
      if (!a) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
  };
}
