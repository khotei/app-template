# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset worktree dev dev-api dev-worker dev-web debug-api \
  debug-worker debug-web check ids doc-names rule-paths review-rules doc-limits doc-width lint \
  fmt typecheck test test-unit test-e2e bundle-check clean outdated vendor-effect vendor-drizzle \
  migrate migration migration-check api-check api-snapshot

# The local Pulumi project: each tree's file backend under its .data/, named per command, so no
# login is stored; the home (the provider plugins) is the main tree's .pulumi/, shared by every
# worktree and kept by `make reset`. The passphrase is empty: the stack's one secret is the local
# database's password, a constant in deployment/local/settings.ts.
MAIN_TREE := $(shell dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")
PULUMI = PULUMI_HOME=$(MAIN_TREE)/.pulumi PULUMI_BACKEND_URL=file://$(CURDIR)/.data/pulumi \
  PULUMI_CONFIG_PASSPHRASE= pulumi -C deployment/local
PROJECT := $(shell sed -n 's/^name: //p' deployment/local/Pulumi.yaml)
MINISTACK_URN = urn:pulumi:local::$(PROJECT)::docker:index/container:Container::ministack

# A switch of the AWS provider's own test harness that skips its fixed waits; VCR_PATH only has to
# be non-empty, nothing is recorded or replayed. Local stack only: docs/knowledge/aws.md.
FAST_PROVIDER = VCR_MODE=REPLAY_ONLY VCR_PATH=unused

# Why the recipes export .env: docs/knowledge/tooling.md › Environment.
EXPORT_ENV = set -a && . ./.env && set +a
# The pair of the container name in deployment/local/ministack.ts; a stack output would not do,
# since `make reset` deletes the state.
NAME_MINISTACK = ministack=app-template-ministack-$$(echo "$$AWS_ENDPOINT_URL" | sed -E 's/.*:([0-9]+).*/\1/')
# The pair of the identifier in deployment/aws/database.ts, for the same reason.
NAME_DATABASE = database=app-template-$$STAGE-database
DRIZZLE_CONFIG = kernel/data/drizzle.config.ts

help: ## List all targets
	@echo 'App Template: make <target>'
	@grep -E '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-16s %s\n", $$1, $$2 }'

setup: ## Install dependencies and create .env from .env.example if missing
	bun install
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

stack: ## Create the tree's Pulumi file backend and select or create the local stack
	@mkdir -p .data/pulumi
	@$(PULUMI) stack select local 2>/dev/null || $(PULUMI) stack init local

# Refreshes the MiniStack container alone, once it is in the state: docs/knowledge/aws.md.
up: stack ## Start MiniStack, create the database, bucket and queues in it, migrate
	if $(PULUMI) stack export | grep -qF '$(MINISTACK_URN)'; then \
		$(PULUMI) refresh --yes --skip-preview --target '$(MINISTACK_URN)'; fi
	$(EXPORT_ENV) && $(FAST_PROVIDER) $(PULUMI) up --yes --skip-preview
	$(PULUMI) stack output --shell > .env.pulumi
	$(MAKE) migrate

down: ## Stop MiniStack, which stops the database's container; every resource keeps its data
	$(EXPORT_ENV) && $(NAME_MINISTACK) && docker ps -q --filter "name=^$$ministack$$" | xargs -r docker stop

# A killed MiniStack leaves the database's container running; why no destroy runs:
# docs/knowledge/aws.md.
reset: ## Remove MiniStack, the database's container and volume, and .data/ whole
	$(EXPORT_ENV) && $(NAME_MINISTACK) && $(NAME_DATABASE) && \
		docker rm -f "$$ministack" $$(docker ps -aq --filter label=ministack=rds --filter "label=db_id=$$database") && \
		docker volume ls -q --filter "name=instance-$$database-data" | xargs -r docker volume rm
	rm -rf .data .env.pulumi

# Run inside the new worktree; the ports it moves: docs/knowledge/tooling.md › Worktrees.
worktree: ## Name a parallel step's worktree, install it, write its .env: N=<n> NAME=<name>
	@sh .claude/skills/ticket-implement/worktree.sh "$$N" "$$NAME"

migrate: ## Apply the pending migrations to the database in .env.pulumi
	bun --env-file=.env --env-file=.env.pulumi kernel/postgres/migrate.ts

# drizzle-kit is a root devDependency: the isolated linker links a workspace's binary only in that
# workspace. The config's paths resolve against the working directory, the root.
migration: ## Generate a migration from the entities, with no database: NAME=<name>
	@test -n "$(NAME)" || { echo 'usage: make migration NAME=<name>'; exit 1; }
	bunx drizzle-kit generate --config $(DRIZZLE_CONFIG) --name $(NAME)

# Compares folder listings, not git; soft here, strict in CI (docs/knowledge/database.md ›
# Migrations). Closed stdin makes a rename prompt fail the target instead of hanging it.
migration-check: ## Fail when an entity changed without a migration
	@dir=kernel/data/migrations; before=$$(ls $$dir); \
	out=$$(bunx drizzle-kit generate --config $(DRIZZLE_CONFIG) --name unmigrated </dev/null 2>&1) || \
		{ echo "$$out"; exit 1; }; \
	new=$$(ls $$dir | grep -vxF "$$before"); \
	if [ -n "$$new" ]; then \
		cat $$dir/$$new/migration.sql; rm -rf $$dir/$$new; \
		echo; echo "The entities differ from $$dir (above: the missing SQL)."; \
		echo 'Run make migration NAME=<name> and commit the folder.'; \
		exit 1; \
	fi

# The generator writes the file it is given, not stdout, so a log while the modules load stays out
# of the document; the snapshot is replaced only once a generation succeeded.
API_SNAPSHOT = http-api/openapi.json
API_GENERATED = node_modules/.cache/openapi.json

api-check: ## Fail when the OpenAPI document of the HTTP contract differs from its snapshot
	@test -f $(API_SNAPSHOT) || { echo "$(API_SNAPSHOT) is missing: run make api-snapshot."; exit 1; }
	@mkdir -p $(dir $(API_GENERATED))
	@bun apps/api/openapi.ts $(API_GENERATED)
	@diff -u $(API_SNAPSHOT) $(API_GENERATED) || { \
		echo; echo "The HTTP contract differs from $(API_SNAPSHOT) (above: - snapshot, + code)."; \
		echo 'A change on purpose: run make api-snapshot and commit the snapshot with it.'; \
		exit 1; \
	}

api-snapshot: ## Rewrite the HTTP contract's OpenAPI snapshot from the code
	@mkdir -p $(dir $(API_GENERATED))
	bun apps/api/openapi.ts $(API_GENERATED)
	mv $(API_GENERATED) $(API_SNAPSHOT)

dev: migrate ## Run api, worker and web together in dev mode
	bun --filter './apps/*' dev

dev-api: migrate ## Run the api with --hot
	bun --filter @app-template/api dev

dev-worker: migrate ## Run the worker with --watch
	bun --filter @app-template/worker dev

dev-web: ## Run the web dev server with HMR
	bun --filter @app-template/web dev

debug-api: ## Run the api with --inspect and --hot
	bun --filter @app-template/api debug

debug-worker: ## Run the worker with --inspect and --watch
	bun --filter @app-template/worker debug

debug-web: ## Run the web dev server with --inspect
	bun --filter @app-template/web debug

check: ids doc-names rule-paths doc-limits doc-width lint typecheck api-check migration-check test bundle-check ## Run every gate: ids, doc names, rule filters, doc limits, doc width, lint and the Effect style, types, the HTTP contract, migrations, tests, the web bundle

ids: ## Fail on ticket ids in parentheses (D12, R3, Q70) outside docs/tickets
	@if git grep --untracked -nE '\((D|R|Q)[0-9]+[a-z]?\)' -- . ':!docs/tickets' \
		':!.github/PULL_REQUEST_example.md' ':!repos'; then \
		echo 'Ticket ids belong in docs/tickets/ and commit messages, not in code, config or docs.'; \
		exit 1; \
	fi

# The docs whose names doc-names keeps true: every Markdown file but the tickets, the vendored
# repos and the roadmap, which plans files and names not built yet.
DOC_NAMES_IN = '*.md' ':!docs/tickets' ':!repos' ':!docs/knowledge/roadmap.md'
# Named on purpose, absent on purpose: the paths the docs forbid, S3 operations, a naming example,
# a tool of the harness.
DOC_NAMES_ABSENT = docs/adr/ docs/superpowers/ .claude/commands/ CreateMultipartUpload GetObject \
  FundsTransfer SendMessage
# A grep that exits 2 (a pattern it rejects, a file it cannot read) stops the check with 2, so a
# broken pattern never reads as no hit.
DOC_NAMES_FAILED = [ $$? -le 1 ] || { echo 'doc-names: a grep failed' >&2; exit 2; }
PASCAL = [A-Z][a-z0-9]+([A-Z][a-z0-9]*)+
# The instruction files Claude reads, and a source path in one: a span with a `/` that ends in
# .ts, .tsx or .json and holds no placeholder or glob; a package specifier (`@<scope>/…`) passes.
INSTRUCTIONS = (([^:]*/)?CLAUDE[.]md|[.]claude/(rules|skills|agents)/[^:]*)
SOURCE_PATH = `[^`<*?[{]*/[^`<*?[{]*[.](ts|tsx|json)`

# A path is a span that starts at a tracked top-level entry and holds no placeholder, glob or
# space; a name is a PascalCase word of two parts or more, a dotted one checked by its head. The
# code is every file but Markdown, repos/ included, so a library's own names pass. A source path
# in an instruction file fails whether it exists or not: why, docs/knowledge/decisions.md ›
# Instructions name patterns. Its lists are per-run temporary files, so two runs never share them.
doc-names: ## Fail on a backticked path or name the repo lacks, or a source path in an instruction file
	@tmp=$$(mktemp -d) || exit 2; trap 'rm -rf "$$tmp"' EXIT; \
	git grep --untracked -ohwE '$(PASCAL)' -- ':!*.md' > "$$tmp/known"; $(DOC_NAMES_FAILED); \
	printf '%s\n' $(DOC_NAMES_ABSENT) >> "$$tmp/known"; \
	sort -u -o "$$tmp/known" "$$tmp/known" || exit 2; \
	git grep --untracked -noE -e '`[^`]+`' --and --not -e '_Avoid_' -- $(DOC_NAMES_IN) \
		> "$$tmp/spans"; $(DOC_NAMES_FAILED); \
	top=$$(git ls-files | cut -d/ -f1 | sort -u | sed 's/[.]/[.]/g' | paste -sd '|' -); \
	[ -n "$$top" ] || { echo 'doc-names: git ls-files listed nothing' >&2; exit 2; }; \
	sed -E -e 's/`//g' -e 's/ › .*//' -e 's/^([^:]+:[0-9]+:$(PASCAL))[.].*/\1/' "$$tmp/spans" \
		> "$$tmp/heads" || exit 2; \
	grep -E "^[^:]+:[0-9]+:(($$top)(/[A-Za-z0-9._-]+)*/?|$(PASCAL))$$" "$$tmp/heads" \
		> "$$tmp/names"; $(DOC_NAMES_FAILED); \
	missing=$$(while IFS=: read -r file line name; do \
			[ -e "$$name" ] || grep -qxF "$$name" "$$tmp/known" || echo "$$file:$$line: $$name"; \
		done < "$$tmp/names") || exit 2; \
	grep -E '^$(INSTRUCTIONS):[0-9]+:$(SOURCE_PATH)$$' "$$tmp/spans" > "$$tmp/sources"; \
	$(DOC_NAMES_FAILED); \
	sources=$$(sed -E -e '\#:`@[a-z0-9-][a-z0-9-]*/#d' \
		-e 's/`//g; s/^([^:]+:[0-9]+:)(.*)/\1 \2, write the pattern/' "$$tmp/sources") || exit 2; \
	[ -z "$$missing" ] || { echo "$$missing"; \
		echo 'The docs name a path or a code name the repo lacks: fix the name, or cut it.'; }; \
	[ -z "$$sources" ] || { echo "$$sources"; \
		echo 'An instruction file names a source file: write a <placeholder> pattern, the package'; \
		echo 'specifier or the doc that owns the fact.'; }; \
	[ -z "$$missing$$sources" ] || exit 1

# Prints `<rule> <filter>` for each paths: filter of a rule in .claude/rules/, subfolders included,
# as the harness loads them. A filter is read as a list item, an inline list or a scalar; a rule
# without paths: prints nothing, since it loads in every session.
RULE_FILTERS = awk 'FNR == 1 { fm = ($$0 == "---"); inp = 0; next } \
	fm && $$0 == "---" { fm = 0 } !fm { next } \
	/^\#/ { next } \
	/^[^ -]/ { inp = /^paths:/; if (inp) { v = $$0; gsub(/^paths: *|["\047]/, "", v); \
		if (v ~ /^\[/) { gsub(/^\[|\]$$/, "", v); n = split(v, a, / *, */) } else { n = 1; a[1] = v } \
		for (i = 1; i <= n; i++) if (a[i] != "") print FILENAME, a[i] } next } \
	inp && /^ *- / { f = $$0; gsub(/^ *- *|["\047]/, "", f); print FILENAME, f }' \
	$$(find .claude/rules -name '*.md')

# A rule loads only where its paths: filter matches a file, so a filter that matches none loads it
# nowhere. git's glob reads * and ** as the harness does and has no braces, so a brace fails too.
rule-paths: ## Fail on a rule whose paths: filter matches no file in the repo
	@filters=$$($(RULE_FILTERS)) || exit 2; \
	hits=$$(printf '%s\n' "$$filters" | while read -r rule filter; do \
		[ -n "$$filter" ] || continue; \
		files=$$(git ls-files --cached --others --exclude-standard -- ":(glob)$$filter") || exit 2; \
		[ -n "$$files" ] || echo "$$rule: $$filter"; \
	done) || exit 2; \
	[ -z "$$hits" ] || { echo "$$hits"; \
		echo 'A rule filter matches no file: point it at a folder that exists, with * and ** only.'; \
		exit 1; }

# The rules a review of the uncommitted step holds the diff to: each rule without paths:, and each
# whose filter matches a file the diff adds, changes or deletes (both sides of a rename), untracked
# files included. /ticket-implement hands this list to the Standards reviewer.
review-rules: ## List the rules that bind the uncommitted diff: no paths: filter, or one it matches
	@filters=$$($(RULE_FILTERS)) || exit 2; \
	bound=$$(printf '%s\n' "$$filters" | while read -r rule filter; do \
		[ -n "$$filter" ] || continue; \
		files=$$(git diff HEAD --no-renames --name-only -- ":(glob)$$filter" && \
			git ls-files --others --exclude-standard -- ":(glob)$$filter") || exit 2; \
		[ -z "$$files" ] || echo "$$rule"; \
	done) || exit 2; \
	{ for rule in $$(find .claude/rules -name '*.md'); do \
		printf '%s\n' "$$filters" | cut -d' ' -f1 | grep -qxF "$$rule" || echo "$$rule"; \
	done; printf '%s\n' "$$bound"; } | grep . | sort -u

# The limits are numbers in the maintenance rule's limits line, its one author: the line that
# reads as DOC_LIMITS_LINE once its numbers become <n>, so DOC_LIMITS_LINE holds no digit: every
# digit of a candidate line becomes <n> before the match. A reworded line exits 2, naming the
# line it expects. A file deleted but not staged is skipped.
DOC_LIMITS_RULE = .claude/rules/claude-md.md
DOC_LIMITS_LINE = - **Limits, checked by `make doc-limits`:** a `CLAUDE.md` <n> lines, a rule <n>.

doc-limits: ## Fail on a CLAUDE.md or a rule over the limits its maintenance rule states
	@set -- $$(awk -v want='$(DOC_LIMITS_LINE)' '{ line = $$0; gsub(/[0-9]+/, "<n>", line) } \
		line == want { gsub(/[^0-9]+/, " "); print }' $(DOC_LIMITS_RULE)); \
	[ $$# -eq 2 ] || { echo '$(DOC_LIMITS_RULE) needs one line: $(DOC_LIMITS_LINE)' >&2; exit 2; }; \
	hits=$$(git ls-files --cached --others --exclude-standard -- 'CLAUDE.md' '*/CLAUDE.md' \
			'.claude/rules/*.md' ':!repos' | sort -u | while read -r file; do \
		[ -f "$$file" ] || continue; \
		limit=$$2; [ "$${file##*/}" != CLAUDE.md ] || limit=$$1; \
		lines=$$(awk 'END { print NR }' "$$file") || exit 2; \
		[ "$$lines" -le "$$limit" ] || echo "$$file: $$lines lines, over $$limit"; \
	done) || exit 2; \
	[ -z "$$hits" ] || { echo "$$hits"; \
		echo 'Cut the file to its limit: the test in $(DOC_LIMITS_RULE) says which lines go.'; \
		exit 1; }

# A prose line wraps at 100, as Biome's lineWidth does the code. Exempt: the frontmatter, fences,
# tables, headings, quotes, a URL, and a line that is one code span or link with no space to break
# at outside them.
doc-width: ## Fail on a prose line over 100 characters in the docs outside docs/tickets
	@hits=$$(perl -CSD -ne 'LINE: { \
		if ($$. == 1) { $$fence = 0; $$front = /^---$$/; last LINE if $$front } \
		if ($$front) { $$front = 0 if /^---$$/; last LINE } \
		if (/^\s*```/) { $$fence = !$$fence; last LINE } \
		last LINE if $$fence || /^\s*[|#>]/ || m{://}; \
		chomp; last LINE if length() <= 100; \
		(my $$t = $$_) =~ s/`[^`]*`|\[[^\]]*\]\([^)]*\)/X/g; $$t =~ s/^\s*(?:[-*]|\d+\.)?\s*//; \
		print "$$ARGV:$$.: ", length(), "\n" if $$t =~ / /; \
		} close ARGV if eof' \
		$$(git ls-files --cached --others --exclude-standard -- '*.md' ':!docs/tickets' ':!repos' \
			':!.github')) || exit 2; \
	if [ -n "$$hits" ]; then \
		echo "$$hits"; \
		echo 'Wrap the prose at 100 characters.'; \
		exit 1; \
	fi

lint: ## Lint and format-check with Biome
	bun run lint

fmt: ## Apply Biome formatting and safe fixes
	bun run format

# The patched tsc, not bun check: bun check ignores tsconfig plugins, so it misses every Effect
# diagnostic.
typecheck: ## Typecheck every workspace with Effect diagnostics
	bunx tsc -b

test: test-unit test-e2e ## Run the unit and the e2e tests

test-unit: ## Run the unit tests under __tests__/ (no Docker)
	bun --bun vitest run --project unit

test-e2e: ## Run the e2e tests under __e2e__/ and apps/e2e/ on their own containers (Docker running)
	bun --bun vitest run --project e2e

# Greps the service keys, string literals that survive the build however Bun applies
# "sideEffects": docs/knowledge/architecture.md › Boundary guards. A grep that exits 2 (a pattern
# it rejects, a bundle it cannot read) stops the check with 2, so it never reads as a clean bundle.
bundle-check: ## Fail when a service, use case, repository, port or adapter reaches the web bundle
	bun build apps/web/app/main.ts --outdir node_modules/.cache/web-bundle --target browser
	@grep -rE '@app-template/(kernel/|application/(use-cases/|[a-z0-9-]+/(services|infrastructure|domain)/))' \
		node_modules/.cache/web-bundle; case $$? in 1) ;; 0) exit 1 ;; \
		*) echo 'bundle-check: grep failed' >&2; exit 2 ;; esac

clean: ## Remove installed dependencies, build caches and coverage
	find . -name node_modules -type d -prune -exec rm -rf {} +
	rm -rf coverage

outdated: ## List outdated dependencies in every workspace
	bun outdated --recursive

vendor-effect: EFFECT_TAG = effect@$(shell bun pm pkg get catalogs.effect.effect 2>/dev/null | tr -d '"')
vendor-effect: ## Pull Effect-TS/effect at the catalog pin into repos/effect (commits)
	git subtree pull --squash --prefix repos/effect https://github.com/Effect-TS/effect.git \
		$(EFFECT_TAG) -m ':wrench: chore(deps): Vendor effect at $(EFFECT_TAG)'

# The first run adds the subtree, later runs pull it.
vendor-drizzle: DRIZZLE_TAG = v$(shell bun pm pkg get catalogs.drizzle.drizzle-orm 2>/dev/null | tr -d '"')
vendor-drizzle: ## Pull drizzle-team/drizzle-orm at the catalog pin into repos/drizzle (commits)
	git subtree $(if $(wildcard repos/drizzle),pull,add) --squash --prefix repos/drizzle \
		https://github.com/drizzle-team/drizzle-orm.git $(DRIZZLE_TAG) \
		-m ':wrench: chore(deps): Vendor drizzle-orm at $(DRIZZLE_TAG)'
