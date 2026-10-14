// Start screen: tutorial, recipes, examples, recent projects.

import { h, icon } from './dom.js';
import { RECIPES } from './recipes.js';

export async function openWelcome(app) {
  document.querySelector('.welcome')?.remove();
  const bridge = app.host.bridge;
  const [examples, recent] = await Promise.all([bridge.listExamples(), Promise.resolve(bridge.getRecent())]);
  const recentList = (await recent || []).slice(0, 6);

  const close = () => { root.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const act = (fn) => async () => { close(); await fn(); };

  const showAtStart = h('input', { type: 'checkbox', checked: app.prefs.showWelcome !== false });
  showAtStart.addEventListener('change', () => { app.prefs.showWelcome = showAtStart.checked; bridge.setPrefs(app.prefs); });

  const prettyExample = (n) => n.replace(/^\d+[-_ ]*/, '').replace(/[-_]/g, ' ');

  const root = h('div.welcome', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to KamiCreative' },
    h('div.welcome-box', null,
      h('header.welcome-head', null,
        h('img', { src: '../assets/logo.svg', width: 48, height: 48, alt: '' }),
        h('div', null,
          h('h1', null, 'Welcome to KamiCreative'),
          h('p', null, 'Build live visuals by connecting modules, then send them to screens and projectors.')),
        h('button.icon-btn.welcome-close', { title: 'Close (Esc)', onclick: close }, icon('close'))),

      h('div.welcome-grid', null,
        h('section.welcome-main', null,
          h('button.tutorial-card', { onclick: act(() => app.startTutorial()) },
            h('span.tc-badge', null, 'New here?'),
            h('strong', null, 'Take the 5-minute tutorial'),
            h('span', null, 'Build your first visual step by step. The tutorial shows you where to click and waits while you try it.'),
            h('span.tc-go', null, icon('play', 14), 'Start tutorial')),

          h('h2', null, 'Start from a recipe'),
          h('p.welcome-sub', null, 'A ready-made, already-connected setup you can change. Added to a new, empty project.'),
          h('div.recipe-grid', null, ...RECIPES.map((r) => h('button.recipe', {
            title: r.description,
            onclick: act(async () => { if (await app.newProject()) await app.addRecipe(r.id); }),
          }, h('span.recipe-icon', null, icon(r.icon, 18)), h('strong', null, r.name), h('span', null, r.description))))),

        h('aside.welcome-side', null,
          h('div.btn-col', null,
            h('button.btn.wide-left', { onclick: act(() => app.newProject()) }, icon('plus', 14), 'Blank project'),
            h('button.btn.wide-left', { onclick: act(() => app.openProject()) }, icon('folder', 14), 'Open project…')),
          recentList.length ? h('h2', null, 'Recent') : null,
          recentList.length ? h('ul.welcome-list', null, ...recentList.map((p) => h('li', null, h('button', { title: p, onclick: act(() => app.openPath(p)) }, p.split(/[\\/]/).pop().replace(/\.kamic$/, ''))))) : null,
          examples.length ? h('h2', null, 'Examples') : null,
          examples.length ? h('ul.welcome-list', null, ...examples.map((e) => h('li', null, h('button', { onclick: act(() => app.openPath(e.path, { asTemplate: true })) }, prettyExample(e.name))))) : null,
          h('h2', null, 'Help'),
          h('ul.welcome-list', null,
            h('li', null, h('button', { onclick: act(() => app.command('shortcuts')) }, 'Keyboard shortcuts')),
            h('li', null, h('button', { onclick: act(() => app.command('moduleRef')) }, 'What every module does')),
            h('li', null, h('button', { onclick: () => app.command('docs') }, 'User guide (online)'))))),

      h('footer.welcome-foot', null,
        h('label.check-row', null, showAtStart, h('span', null, 'Show this screen when KamiCreative starts')),
        h('span.hint', null, 'Open it again any time from Help → Welcome screen.'))));

  document.body.appendChild(root);
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  setTimeout(() => root.querySelector('.tutorial-card')?.focus(), 0);
  return { close };
}
