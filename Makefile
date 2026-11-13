# エージェントの編集時のフック（~/.agents/libexec/lint-quick-hook）が `make -s lint-quick FILES="…"` を呼ぶ。
# FILES は git のルートからの相対パス（空白区切り）。検査だけをし、書き換えない。

BIOME := node_modules/.bin/biome
LINT_FILES := $(filter %.ts %.js %.mjs %.json %.css %.html,$(FILES))

.PHONY: lint lint-quick test build

lint:
	npm run lint

lint-quick:
	@if [ -n "$(LINT_FILES)" ] && [ -x "$(BIOME)" ]; then \
		$(BIOME) check --no-errors-on-unmatched --files-ignore-unknown=true $(LINT_FILES); \
	fi

test:
	npm test

build:
	npm run build
