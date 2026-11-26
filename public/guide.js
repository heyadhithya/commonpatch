import { icon, esc } from './icons.js';

const resources = {
  contributing: 'https://opensource.guide/how-to-contribute/',
  walkthrough: 'https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source',
  suggest: 'https://github.com/heyadhithya/commonpatch/issues/new?template=suggest-project.yml'
};

const firstMessage = 'Hi! I tried the quick-start instructions on a fresh install and got stuck at the configuration step. I’d like to add the missing command and test the instructions again. Is anyone working on this already, and would that change fit here?';

const steps = [
  ['Choose a cause and a starting point',
    'Choose a cause you care about on the Explore board. Try a starter issue when you’re learning a project. A “help wanted” label means maintainers welcome a hand and may expect some familiarity. Documentation, design and testing are all ways to contribute.'],
  ['Check the issue on GitHub',
    'Read the original issue, its latest comments, the assignee and any linked pull requests. Someone may already be working on it. A recent merged change can show you what the project expects from a contribution.'],
  ['Read the project’s instructions',
    'Start with the README for what the project does. Open its contribution guide, often called CONTRIBUTING.md, for setup, tests and review instructions. Follow its code of conduct when you join the conversation.'],
  ['Agree on one small change',
    'In the issue thread, say what you tried, what you propose and how you’ll check it. Ask whether that scope fits before starting substantial work. Keep your first change small enough to explain in a sentence.'],
  ['Share the change and its checks',
    'Use the project’s preferred workflow. For code or docs, that often means making a branch on your own copy and opening a pull request for review. Link the issue, describe the change and name the checks you ran. Keep progress and follow-up questions in the public thread.']
];

const questions = [
  ['How much time should I set aside?', 'A starter label reflects the maintainer’s assessment of the task. Setup, testing and review can take time of their own. Ask what a finished change looks like and whether you can take on one smaller part.'],
  ['What if I’m new to coding?', 'Try following setup instructions, reproducing a reported bug, checking keyboard navigation or improving an example. Pick an issue where the maintainer wants that kind of help, then describe the specific thing you can try.'],
  ['Why has an opportunity changed?', 'The board shows the issue state from its latest update. A maintainer can assign, close or relabel it afterward. The issue on GitHub has the current conversation and status.'],
  ['Who can see my notes or a shared list?', 'Your contribution plan, notes and comment draft stay in this browser. A shared list carries public issue references. People who open it can see those issues. You choose whether to copy a draft and post it on GitHub.']
];

function outside(label, url, className = '') {
  return '<a class="fg-external ' + className + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + icon('external', 15) + '<span class="fg-sr"> (opens in a new tab)</span></a>';
}

function jump(id, text, symbol) {
  return '<button type="button" class="fg-jump" data-guide-jump="' + id + '" aria-controls="' + id + '">' + icon(symbol, 17) + esc(text) + '</button>';
}

export function renderGuide() {
  return '<article class="cp-guide" data-field-guide>' +
    '<header class="fg-intro"><div><p class="fg-eyebrow">' + icon('compass', 18) + 'Field guide</p>' +
    '<h1>Your first contribution</h1><p class="fg-lead">Find a project you care about, figure out what it needs and offer one change you can see through.</p>' +
    '<a class="fg-action fg-primary" href="#explore">' + icon('map', 18) + 'Explore opportunities</a></div>' +
    '<nav class="fg-index" aria-label="On this page"><h2>On this page</h2>' +
    jump('fg-steps', 'Getting started', 'compass') + jump('fg-message', 'Your first message', 'comment') +
    jump('fg-faq', 'Common questions', 'help') + jump('fg-projects', 'How we choose projects', 'layers') + '</nav></header>' +
    '<div class="fg-layout"><section class="fg-steps-panel" aria-labelledby="fg-steps"><h2 id="fg-steps" tabindex="-1">Getting started</h2>' +
    '<ol class="fg-steps">' + steps.map(([heading, body], i) => '<li><span class="fg-number" aria-hidden="true">' + (i + 1) + '</span><div><h3>' + esc(heading) + '</h3><p>' + esc(body) + '</p></div></li>').join('') + '</ol></section>' +
    '<div class="fg-aside"><section class="fg-message-card" aria-labelledby="fg-message"><div class="fg-card-icon">' + icon('comment', 23) + '</div>' +
    '<h2 id="fg-message" tabindex="-1">Your first message</h2><p>This example is for a documentation fix. Replace the details with what you observed and what you’d like to try.</p>' +
    '<label for="fg-draft">Message to the maintainer</label><textarea id="fg-draft" data-guide-draft rows="7" spellcheck="true">' + esc(firstMessage) + '</textarea>' +
    '<div class="fg-copy-row"><button class="fg-action fg-copy" type="button" data-guide-copy>' + icon('comment', 16) + '<span>Copy message</span></button>' +
    '<span class="fg-copy-status" data-guide-status role="status" aria-live="polite"></span></div></section>' +
    '<section class="fg-reading" aria-labelledby="fg-reading"><h2 id="fg-reading">' + icon('book', 19) + 'Further reading</h2><ul>' +
    '<li>' + outside('How to contribute to open source', resources.contributing) + '<span>GitHub Open Source Guides</span></li>' +
    '<li>' + outside('Walk through a first pull request', resources.walkthrough) + '<span>GitHub Docs</span></li></ul></section></div></div>' +
    '<div class="fg-bottom"><section aria-labelledby="fg-faq" class="fg-faq"><h2 id="fg-faq" tabindex="-1">Common questions</h2>' +
    questions.map(([prompt, answer]) => '<details><summary>' + esc(prompt) + icon('chevron', 17) + '</summary><p>' + esc(answer) + '</p></details>').join('') + '</section>' +
    '<section class="fg-projects" aria-labelledby="fg-projects"><div class="fg-card-icon">' + icon('layers', 23) + '</div><h2 id="fg-projects" tabindex="-1">How we choose projects</h2>' +
    '<p>The catalog brings together public GitHub projects in mapping, climate, accessibility, open knowledge and civic tech. We look for a clear public benefit and a way for contributors to get involved.</p>' +
    '<p>The board looks for open, unlocked issues without an assignee that carry a starter or help-wanted label. Project maintainers decide which labels to use.</p>' +
    outside('Suggest a project on GitHub', resources.suggest, 'fg-suggest') + '</section></div></article>';
}

const boundGuides = new WeakSet();

export function bindGuide(root) {
  const guide = root?.matches?.('[data-field-guide]') ? root : root?.querySelector('[data-field-guide]');
  if (!guide || boundGuides.has(guide)) return;
  boundGuides.add(guide);
  const draft = guide.querySelector('[data-guide-draft]');
  const status = guide.querySelector('[data-guide-status]');
  const copy = guide.querySelector('[data-guide-copy]');
  draft.addEventListener('input', () => {
    copy.disabled = !draft.value.trim();
    status.textContent = '';
  });
  guide.addEventListener('click', async event => {
    const link = event.target.closest('[data-guide-jump]');
    if (link) {
      const heading = guide.querySelector('#' + link.dataset.guideJump);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
      return;
    }
    if (!event.target.closest('[data-guide-copy]') || !draft.value.trim()) return;
    try {
      await navigator.clipboard.writeText(draft.value);
      status.textContent = 'Message copied.';
    } catch {
      draft.focus();
      draft.select();
      draft.setSelectionRange(0, draft.value.length);
      status.textContent = 'Message selected. Use your device’s Copy command.';
    }
  });
}
