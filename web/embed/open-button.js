// 「Orca で開く」のボタンを置く1行のスクリプト。置き場（SpecDock の画面）で動き、自分の位置に iframe を差し込むだけ。
// トークンを扱わない。親の画面の幅が 390px 以下の間は iframe を隠し、読み込まない。
// iframe の既定の大きさは、形（data-label、"none" ならアイコンだけ）と大きさ（data-size、既定 md）で決める。data-width で幅を上書きできる。
//
//   <script src="http://127.0.0.1:8791/embed/open-button.js" data-worktree="/path/to/worktree"
//           data-agent="<paneKey>" data-theme="dark" data-size="sm" data-label="none"></script>
(() => {
  // [大きさ] → [文字ありの幅, 高さ]。文字ありの幅は、試しの画面で測って中のボタンが切れない最小の整数。アイコンだけは高さの正方形。
  const FRAME = { sm: [72, 24], md: [82, 28] };
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) return;
  const origin = new URL(script.src).origin;
  const data = script.dataset;
  const query = new URLSearchParams();
  if (data.worktree) query.set('worktree', data.worktree);
  if (data.agent) query.set('agent', data.agent);
  if (data.theme === 'light' || data.theme === 'dark') query.set('theme', data.theme);
  if (data.size === 'sm' || data.size === 'md') query.set('size', data.size);
  if (data.label === 'none') query.set('label', 'none');
  const size = data.size === 'sm' ? 'sm' : 'md';
  const [textWidth, height] = FRAME[size];
  const src = `${origin}/embed/open-button?${query.toString()}`;

  const frame = document.createElement('iframe');
  frame.title = 'Orca で開く';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.width = data.width || String(data.label === 'none' ? height : textWidth);
  frame.height = String(height);
  frame.style.border = '0';
  frame.style.verticalAlign = 'middle';
  // iframe の要素と中の文書の color-scheme をそろえる（違うと、ブラウザーが不透明な背景を塗る）。
  frame.style.colorScheme = data.theme === 'light' || data.theme === 'dark' ? data.theme : 'light dark';
  script.after(frame);

  const narrow = window.matchMedia('(max-width: 390px)');
  const apply = () => {
    frame.hidden = narrow.matches;
    frame.style.display = narrow.matches ? 'none' : '';
    if (!narrow.matches && !frame.src) frame.src = src;
  };
  apply();
  narrow.addEventListener('change', apply);
})();
