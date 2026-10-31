// Boot + main loop + screen state (menu / play / over). Wires Game, UI, Input, Renderer together.
import { Game } from './game.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Renderer } from './render/renderer.js';
import { writeSave, readSave, clearSave, getBest, setBest } from './save.js';

const $ = id => document.getElementById(id);
let state = 'menu';

const ui = new UI({ onOver: () => gameOver() });
const renderer = new Renderer($('cv'));
const input = new Input({
  canvas: $('cv'), joy: $('joy'), knob: $('knob'), actBtn: $('actBtn'),
  canMove: () => state === 'play' && !ui.sheet,
  onFirstMove: () => { $('hint').hidden = true; },
  onKey: k => {
    if (state !== 'play') return false;
    if (k === 'b' || k === 'c') { const tab = k === 'b' ? 'inv' : 'craft'; ui.sheet === 'bag' && ui.tab === tab ? ui.close() : ui.open('bag', false, tab); return true; }
    if (k === 'escape') { ui.close(); return true; }
    return false;
  },
});
ui.input = input;

let G = new Game(ui);
G.newGame(20261031);           // menu backdrop island
ui.attach(G);

function showHud(on) { for (const id of ['hud', 'controls']) $(id).hidden = !on; $('hint').hidden = !on; }
function start(game) {
  G = game; G.best = getBest(); ui.attach(G);
  state = 'play'; $('menu').hidden = true; $('end').hidden = true; showHud(true);
  writeSave(G);
}
function gameOver() {
  state = 'over'; setBest(G.S.day); clearSave(); input.release(); showHud(false);
  const best = getBest();
  $('endText').textContent = `${G.S.day}. günde güçlerin tükendi. Rekorun: ${best} gün. Yiyecek, su ve geceleri ateşi unutma.`;
  $('end').hidden = false;
}

$('newBtn').onclick = () => { clearSave(); const g = new Game(ui); g.newGame(); start(g); ui.toast('Yerdeki dal ve çakılları topla'); };
$('contBtn').onclick = () => { const d = readSave(); start(d ? Game.fromSave(d, ui) : (() => { const g = new Game(ui); g.newGame(); return g; })()); };
$('againBtn').onclick = () => { const g = new Game(ui); g.newGame(); start(g); };
$('contBtn').hidden = !readSave();
$('menuBest').textContent = getBest() ? `Rekorun: ${getBest()} gün` : '';
showHud(false);

function persist() { if (state === 'play' && !G.dead) { writeSave(G); setBest(G.S.day); } }
setInterval(persist, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
window.addEventListener('resize', () => renderer.resize());

let last = 0;
function frame(ts) {
  const dt = Math.min(.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (state === 'play' && !ui.paused && !G.dead) G.update(dt, input); else G.idle(dt, state === 'menu');
  renderer.draw(G, state !== 'menu');
  ui.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });

// debug hook for tests: open with ?debug
if (location.search.includes('debug')) window.__G = () => ({ G, ui, start, Game });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
