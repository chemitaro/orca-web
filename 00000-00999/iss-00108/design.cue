package spec

design: {
	"D-01": {title: "選び方（`src/orca/open-target.ts`）", text: "定数 `CHAT_AGENT_PREFIX = 'chat:'`。chooseTarget(snapshot, agent) で、agent が CHAT_AGENT_PREFIX で始まるなら、残り T について `snapshot.tabs.find(t => !isTerminal(t) && t.id === T)` を探し、当たれば `{ route: 'tab-activate', tabId: T, reason: 'requested-agent' }` と requestedAgentFound 真。当たらなければ今の後の手順へ（found 偽）。それ以外の agent は今の paneKey の探し方。", satisfies: ["R-01"]}
	"D-02": {title: "埋め込みの見出し（`web/embed/agent-view.js`）", text: "buildDetail の open：terminal-tab で paneKey があれば今のとおり、chat-tab なら `{ worktree, agent: String(agent.id) }`、ほかは `{ worktree }`。", satisfies: ["R-02"]}
}
