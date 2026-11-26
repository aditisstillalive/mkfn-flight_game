// The screens around the flying: the title with its mission board and briefing, the pause card
// with the controls, and the debrief that grades a sortie. Plain DOM over the 3D view, driven by
// callbacks so main.js decides what each button does.
import { MISSIONS } from './missions.js';
import { KEY_HELP } from './input.js';
import { UNITS, AIRCRAFT } from './config.js';

const $ = (id) => document.getElementById(id);

const ICONS = {
  rings: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="20" rx="9" ry="15" fill="none" stroke="currentColor" stroke-width="4"/><path d="M2 22h12M26 22h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  ferry: '<svg viewBox="0 0 40 40"><rect x="6" y="11" width="28" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M7 13l13 10 13-10" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  drop: '<svg viewBox="0 0 40 40"><path d="M6 17a14 11 0 0 1 28 0z" fill="currentColor"/><path d="M7 17l11 12M33 17l-11 12" stroke="currentColor" stroke-width="2"/><rect x="15" y="27" width="10" height="9" fill="currentColor"/></svg>',
  free: '<svg viewBox="0 0 40 40"><path d="M20 4l4 12h12l-10 7 4 13-10-8-10 8 4-13L4 16h12z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
};

/** Wires the screens to `handlers` {onFly(mission), onResume, onRestart, onMenu}. */
export function createMenus(handlers) {
  let selected = MISSIONS[0];
  const list = $('mission-list');
  list.innerHTML = '';
  for (const mission of MISSIONS) {
    const card = document.createElement('button');
    card.className = 'mission';
    card.dataset.id = mission.id;
    card.innerHTML = `<span class="icon">${ICONS[mission.id]}</span><span class="text"><b>${mission.title}</b><small>${mission.tagline}</small></span>`;
    card.addEventListener('click', () => select(mission));
    card.addEventListener('dblclick', () => handlers.onFly(mission));
    list.appendChild(card);
  }
  const keys = $('key-help');
  keys.innerHTML = KEY_HELP.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('');
  $('pause-keys').innerHTML = keys.innerHTML;

  function select(mission) {
    selected = mission;
    for (const card of list.children) card.classList.toggle('selected', card.dataset.id === mission.id);
    $('brief-title').textContent = mission.title;
    $('brief-text').textContent = mission.brief;
    const fuel = Math.round(mission.start.fuel);
    const air = mission.start.speed > 0 ? 'Starts airborne' : 'Starts on the runway';
    $('brief-facts').innerHTML = `<span>${air}</span><span>Fuel ${fuel} L of ${AIRCRAFT.fuelCapacity}</span><span>${AIRCRAFT.name}</span>`;
  }
  select(selected);

  $('fly').addEventListener('click', () => handlers.onFly(selected));
  $('resume').addEventListener('click', () => handlers.onResume());
  $('restart').addEventListener('click', () => handlers.onRestart());
  $('to-menu').addEventListener('click', () => handlers.onMenu());
  $('retry').addEventListener('click', () => handlers.onRestart());
  $('debrief-menu').addEventListener('click', () => handlers.onMenu());

  const show = (id) => {
    for (const s of ['menu', 'pause', 'debrief']) $(s).classList.toggle('hidden', s !== id);
    document.body.classList.toggle('flying', id === null);
  };

  return {
    get selected() { return selected; },
    select,
    showMenu() { show('menu'); },
    showPause() { show('pause'); },
    hideAll() { show(null); },
    /** Fills and shows the debrief for a finished run. */
    showDebrief(run, state) {
      const won = run.status === 'won';
      $('debrief-title').textContent = won ? 'Mission complete' : 'Mission failed';
      $('debrief').classList.toggle('lost', !won);
      $('debrief-mission').textContent = run.def.title;
      $('debrief-message').textContent = run.message;
      const stars = won ? Math.max(1, Math.min(3, Math.round(run.score / 1500))) : 0;
      $('debrief-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      const td = run.landing;
      const rows = [
        ['Time', run.clock()],
        ['Score', won ? String(Math.max(0, run.score)) : '—'],
        ['Last touchdown', td ? `${td.grade}, ${Math.round(td.sink * UNITS.fpm)} ft/min` : 'none'],
        ['Fuel left', `${Math.round(state.fuel)} L`],
        ['Airframe', `${Math.round((1 - state.damage) * 100)}%`],
        ['Peak load', `${state.maxG.toFixed(1)} g`],
      ];
      $('debrief-stats').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
      $('debrief-log').innerHTML = run.log.slice(-6).map((l) => `<li>${l}</li>`).join('');
      show('debrief');
    },
  };
}
