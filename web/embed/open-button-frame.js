// 「Orca で開く」の iframe の中の処理。開くボタンの部品（open-control.js）を置き、押すと同じオリジンの開く口を呼ぶ。
// トークンは write.js がメモリーにだけ持ち、URL、記録、親の画面に出さない。結果はアイコンと title と読み上げの領域で示す。
import { createWriter } from '../write.js';
import { createOpenControl, runOpen } from './open-control.js';

const params = new URLSearchParams(location.search);
const worktree = params.get('worktree') ?? '';
const agent = params.get('agent') ?? '';
const theme = params.get('theme');
const size = params.get('size') === 'sm' ? 'sm' : 'md';
const label = params.get('label') === 'none' ? 'none' : 'text';
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const writer = createWriter();
const control = createOpenControl(document, { size, label });
document.body.append(control.root);

if (!worktree) {
  control.setState('missing');
} else {
  control.button.addEventListener('click', () => {
    void runOpen(control, () => writer.send('/api/open', 'POST', agent ? { worktree, agent } : { worktree }));
  });
}
