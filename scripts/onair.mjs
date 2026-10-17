// The GM's "on air" chip over the map: what is showing, who is seeing it, and one click to take it down.
// Drawn only on GM clients, and only re-drawn when its markup actually changes.
import { t } from "./i18n.mjs";
import { escapeHTML as esc, overlayIsOn } from "./util.mjs";

let el = null, last = "", timer = null, actions = {};

/** actions: { hide(), preview(), panel() } */
export function bind(handlers) { actions = handlers; }

/** info: { state, seeing: [names], waiting: [names], preview } */
export function draw(info) {
  const { state, seeing = [], waiting = [], preview = false } = info ?? {};
  if (!game.user.isGM || !overlayIsOn(state)) {
    el?.remove(); el = null; last = "";
    return;
  }
  const total = seeing.length + waiting.length;
  const place = state.place;
  const cast = state.cast?.length ?? 0;
  const label = place?.label ?? t("OnAir.CastOnly", { count: cast });
  const who = state.users?.length ? t("OnAir.Some") : t("OnAir.Everyone");
  const seenCls = !total ? "none" : waiting.length ? "some" : "all";
  const seenTip = waiting.length ? t("OnAir.Waiting", { names: waiting.join(", ") }) : seeing.join(", ");
  const html = `<span class="pt-onair-dot"></span>
    ${place?.src ? `<img src="${esc(place.src)}" alt="">` : `<i class="fa-solid fa-user"></i>`}
    <span class="pt-onair-label"><b>${esc(t("OnAir.Title"))}</b> ${esc(label)}${place && cast ? ` <small>+${cast}</small>` : ""}
      <small>${esc(who)} · ${esc(t(`Over.Mode.${state.mode === "window" ? "window" : "full"}`))}</small></span>
    <span class="pt-onair-seen ${seenCls}" title="${esc(seenTip)}"><i class="fa-solid fa-eye"></i> ${seeing.length}/${total}</span>
    <button type="button" data-oa="preview" class="${preview ? "on" : ""}" title="${esc(t("OnAir.Preview"))}"><i class="fa-solid fa-display"></i></button>
    <button type="button" data-oa="panel" title="${esc(t("OnAir.Panel"))}"><i class="fa-solid fa-masks-theater"></i></button>
    <button type="button" data-oa="hide" class="pt-onair-x" title="${esc(t("OnAir.HideHint"))}"><i class="fa-solid fa-xmark"></i> ${esc(t("OnAir.Hide"))}</button>`;
  if (!el) {
    el = document.createElement("div");
    el.id = "planar-theater-onair";
    el.className = "pt-onair";
    el.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-oa]");
      if (!btn) return;
      ev.preventDefault();
      actions[btn.dataset.oa]?.();
    });
    document.body.append(el);
  }
  if (html !== last) { el.innerHTML = html; last = html; }
}

/** Re-draw soon (acks arrive in bursts). */
export function drawSoon(getInfo) {
  clearTimeout(timer);
  timer = setTimeout(() => draw(getInfo()), 120);
}
