// Journal buttons for prep notes, GM only:
//   @Place[Jex's workshop]                         show a place over the map (searched in every Theater scene)
//   @Place[Jex's workshop | to=Nanouk | mode=window | fx=iris | scene=Mortuary]{Jex's door}
//   @Place[off]{Back to the map}                   take everything down
//   @Cast[Jex]                                     bring an NPC card in, or send it out
// Players see the label as plain text.
import { t } from "./i18n.mjs";
import { escapeHTML as esc, parseShowArgs } from "./util.mjs";
import * as overlay from "./overlay.mjs";

const PATTERN = /@(Place|Cast)\[([^\]]+)\](?:\{([^}]+)\})?/g;

function enrich(match) {
  const [, kind, args, label] = match;
  const opts = parseShowArgs(args);
  const off = kind === "Place" && /^off$/i.test(opts.name);
  const text = label || (off ? t("Enricher.Off") : opts.name);
  if (!game.user.isGM) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }
  const a = document.createElement("a");
  a.className = "pt-show";
  a.dataset.kind = kind.toLowerCase();
  a.dataset.args = args;
  a.title = t(off ? "Enricher.OffHint" : kind === "Place" ? "Enricher.PlaceHint" : "Enricher.CastHint");
  const icon = off ? "fa-eye-slash" : kind === "Place" ? "fa-masks-theater" : "fa-user";
  a.innerHTML = `<i class="fa-solid ${icon}"></i> ${esc(text)}`;
  return a;
}

async function onClick(ev) {
  const a = ev.target.closest?.("a.pt-show");
  if (!a || !game.user.isGM) return;
  ev.preventDefault();
  ev.stopPropagation();
  const opts = parseShowArgs(a.dataset.args);
  const common = { scene: opts.scene, mode: opts.mode, transition: opts.transition, ...(opts.to ? { users: opts.to } : {}) };
  a.classList.add("busy");
  try {
    if (a.dataset.kind === "cast") await overlay.showNpc(opts.name, common);
    else if (/^off$/i.test(opts.name)) await overlay.hide();
    else await overlay.showPlace(opts.name, common);
  } finally { a.classList.remove("busy"); }
}

/** init: register the enricher. */
export function registerEnrichers() {
  CONFIG.TextEditor?.enrichers?.push({ pattern: PATTERN, enricher: enrich });
}

/** ready (GM): one delegated click listener for every button in every journal. */
export function listenForClicks() {
  if (game.user.isGM) document.body.addEventListener("click", onClick, true);
}
