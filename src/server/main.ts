// 開発用の起動。待ち受けは 127.0.0.1 だけ。常駐と待ち受けの設定は iss-00008 で決める。
import { createAppServer } from './app.ts';

const port = Number(process.env.PORT ?? 8791);
const server = createAppServer();
server.listen(port, '127.0.0.1', () => {
  console.log(`orca-web: http://127.0.0.1:${port}/`);
});
