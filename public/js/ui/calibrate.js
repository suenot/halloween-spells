import { h, openModal, toast } from "./dom.js";
import { settings, setSetting } from "../store.js";
import { startCamera } from "../engine/camera.js";
import { sampleColor, findWandTip, matchesColor } from "../engine/wand.js";

// "This is the wand": host clicks the wand in the live picture, we remember its colour.
export function openWandCalibration(onDone) {
  const video = h("video", { class: "cal-video", playsinline: "", muted: "" });
  const mark = h("canvas", { class: "cal-mark" });
  const status = h("p", { class: "muted" }, "Включаю камеру...");
  const saved = settings().wand;
  let calib = saved, cam = null, alive = true;
  const frame = h("div", { class: "cal-frame" }, video, mark);
  const body = h("div", { class: "cal" },
    h("h2", {}, "🪄 Покажи волшебную палочку"),
    h("p", {}, "Держи палочку перед камерой на фоне, который не похож на нее по цвету. Нажми пальцем или мышкой прямо на палочку в картинке: я запомню ее цвет и буду следить за кончиком."),
    frame, status,
    h("div", { class: "row end" },
      h("button", { class: "btn ghost", onclick: () => { setSetting("wand", null); calib = null; status.textContent = "Калибровка сброшена: буду следить за указательным пальцем."; onDone?.(null); } }, "Сбросить"),
      h("button", { class: "btn primary", onclick: () => { if (!calib) return toast("Сначала нажми на палочку"); setSetting("wand", calib); onDone?.(calib); toast("Палочка запомнена! 🪄"); m.close(); } }, "Сохранить")));
  const m = openModal(body, { onClose: () => { alive = false; cam?.stop(); } });

  frame.addEventListener("click", (e) => {
    if (!video.videoWidth) return;
    const r = video.getBoundingClientRect();
    const nx = 1 - (e.clientX - r.left) / r.width; // picture is mirrored on screen
    const ny = (e.clientY - r.top) / r.height;
    calib = sampleColor(video, nx, ny);
    status.textContent = "Цвет запомнен. Помаши палочкой: оранжевый кружок должен прилипнуть к кончику.";
  });

  startCamera(video).then((c) => {
    cam = c;
    status.textContent = "Нажми на палочку в картинке.";
    const ctx = mark.getContext("2d");
    const loop = () => {
      if (!alive) return;
      mark.width = video.clientWidth; mark.height = video.clientHeight;
      ctx.clearRect(0, 0, mark.width, mark.height);
      if (calib) {
        const found = findWandTip(video, calib);
        if (found) {
          ctx.fillStyle = "rgba(255,140,30,.95)"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc((1 - found.tip.x) * mark.width, found.tip.y * mark.height, 14, 0, 6.283); ctx.fill(); ctx.stroke();
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  }).catch((e) => { status.textContent = `Камера недоступна: ${e.message}`; });
}
export { matchesColor };
