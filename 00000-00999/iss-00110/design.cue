package spec

design: {
	"D-01": {title: "plist（`src/service/launchd.ts`）", text: "renderPlist の ThrottleInterval の後に `  <key>ProcessType</key>`・`  <string>Interactive</string>` を足す。定数 `PROCESS_TYPE = 'Interactive'`。注記に理由（低い優先度で Orca の読みが時間切れになる）。", satisfies: ["R-01"]}
}
