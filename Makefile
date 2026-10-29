# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset dev dev-api dev-worker dev-web debug-api debug-worker \
  debug-web check ids doc-names service-use lint fmt typecheck test test-unit test-e2e bundle-check clean \
  outdated vendor-effect vendor-drizzle migrate migration migration-check

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

migrate: ## Apply the pending migrations to the database in .env.pulumi
	bun --env-file=.env --env-file=.env.pulumi infrastructure/db/migrate.ts

# drizzle-kit runs from infrastructure/: the pinned binary is that workspace's devDependency, and
# the config's paths resolve against the working directory, not the config file.
migration: ## Generate a migration from the entities, with no database: NAME=<name>
	@test -n "$(NAME)" || { echo 'usage: make migration NAME=<name>'; exit 1; }
	cd infrastructure && bunx drizzle-kit generate --name $(NAME)

# Compares folder listings, not git; soft here, strict in CI (docs/knowledge/database.md ›
# Migrations). Closed stdin makes a rename prompt fail the target instead of hanging it.
migration-check: ## Fail when an entity changed without a migration
	@dir=infrastructure/db/migrations; before=$$(ls $$dir); \
	out=$$(cd infrastructure && bunx drizzle-kit generate --name unmigrated </dev/null 2>&1) || \
		{ echo "$$out"; exit 1; }; \
	new=$$(ls $$dir | grep -vxF "$$before"); \
	if [ -n "$$new" ]; then \
		cat $$dir/$$new/migration.sql; rm -rf $$dir/$$new; \
		echo; echo "The entities differ from $$dir (above: the missing SQL)."; \
		echo 'Run make migration NAME=<name> and commit the folder.'; \
		exit 1; \
	fi

dev: ## Run api, worker and web together in dev mode
	bun --filter './apps/*' dev

dev-api: ## Run the api with --hot
	bun --filter @app-template/api dev

dev-worker: ## Run the worker with --watch
	bun --filter @app-template/worker dev

dev-web: ## Run the web dev server with HMR
	bun --filter @app-template/web dev

debug-api: ## Run the api with --inspect and --hot
	bun --filter @app-template/api debug

debug-worker: ## Run the worker with --inspect and --watch
	bun --filter @app-template/worker debug

debug-web: ## Run the web dev server with --inspect
	bun --filter @app-template/web debug

check: ids doc-names service-use lint typecheck migration-check test bundle-check ## Run every gate: ids, doc names, service use, lint, types, migrations, tests, the web bundle

ids: ## Fail on ticket ids in parentheses (D12, R3, Q70) outside docs/tickets
	@if git grep --untracked -nE '\((D|R|Q)[0-9]+[a-z]?\)' -- . ':!docs/tickets' \
		':!.github/PULL_REQUEST_example.md' ':!repos'; then \
		echo 'Ticket ids belong in docs/tickets/ and commit messages, not in code, config or docs.'; \
		exit 1; \
	fi

# The docs whose names doc-names keeps true; the roadmap plans files and names not built yet.
DOC_NAMES_IN = CLAUDE.md '*/CLAUDE.md' '.claude/rules/*.md' 'docs/knowledge/*.md' ':!repos' \
  ':!docs/knowledge/roadmap.md'
# Named on purpose, absent on purpose: the paths the docs forbid, S3 operations, a naming example.
DOC_NAMES_ABSENT = docs/adr/ docs/superpowers/ .claude/commands/ CreateMultipartUpload GetObject \
  FundsTransfer
# Scratch lists, rewritten on every run.
DOC_NAMES_KNOWN = node_modules/.cache/doc-names/known
DOC_NAMES_SPANS = node_modules/.cache/doc-names/spans
PASCAL = [A-Z][a-z0-9]+([A-Z][a-z0-9]*)+

# A path is a span that starts at a tracked top-level entry and holds no placeholder, glob or
# space; a name is a PascalCase word of two parts or more, a dotted one checked by its head. The
# code is every file but Markdown, repos/ included, so a library's own names pass.
doc-names: ## Fail on a backticked path or PascalCase name in the docs that the repo lacks
	@mkdir -p $(dir $(DOC_NAMES_KNOWN))
	@{ git grep --untracked -ohwE '$(PASCAL)' -- ':!*.md'; printf '%s\n' $(DOC_NAMES_ABSENT); } \
		| sort -u > $(DOC_NAMES_KNOWN)
	@git grep --untracked -noE -e '`[^`]+`' --and --not -e '_Avoid_' -- $(DOC_NAMES_IN) \
		> $(DOC_NAMES_SPANS); [ $$? -le 1 ] || { echo 'doc-names: git grep failed' >&2; exit 2; }
	@top=$$(git ls-files | cut -d/ -f1 | sort -u | sed 's/[.]/[.]/g' | paste -sd '|' -); \
	if tr -d '`' < $(DOC_NAMES_SPANS) | sed -E -e 's/ › .*//' -e 's/^([^:]+:[0-9]+:$(PASCAL))[.].*/\1/' \
		| grep -E "^[^:]+:[0-9]+:(($$top)(/[A-Za-z0-9._-]+)*/?|$(PASCAL))$$" \
		| while IFS=: read -r file line name; do \
			[ -e "$$name" ] || grep -qxF "$$name" $(DOC_NAMES_KNOWN) || echo "$$file:$$line: $$name"; \
		done | grep .; then \
		echo 'The docs name a path or a code name the repo lacks: fix the name, or cut it.'; \
		exit 1; \
	fi

# Reads each file whole, so a call Biome wraps across lines is caught too; any second argument
# counts, a point-free `Ref.get` included (.claude/rules/effect-style.md › Composition).
service-use: ## Fail on Effect.flatMap or Effect.map over a service, which Service.use spells
	@if perl -0777 -ne 'while (/Effect\.(flatMap|map)\(\s*[A-Z][A-Za-z0-9_.]*\s*,/g) { \
		print "$$ARGV:", 1 + (substr($$_, 0, $$-[0]) =~ tr/\n//), "\n" }' \
		$$(git ls-files --cached --others --exclude-standard -- '*.ts' ':!repos') | grep .; then \
		echo 'Reach a service by Service.use, or Service.useSync for a plain value.'; \
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

test-unit: ## Run the unit tests under tests/ (no Docker)
	bun --bun vitest run --project unit

test-e2e: ## Run the e2e tests under e2e/ on their own containers (Docker running)
	bun --bun vitest run --project e2e

# Greps the service keys, string literals that survive the build however Bun applies
# "sideEffects": docs/knowledge/architecture.md › Boundary guards.
bundle-check: ## Fail when a domain service, port or adapter reaches the web bundle
	bun build apps/web/app/main.ts --outdir node_modules/.cache/web-bundle --target browser
	! grep -rE '@app-template/(domain|infrastructure)/[a-z-]+/[A-Za-z]*(Service|Repository|Bucket|Assistant)' \
		node_modules/.cache/web-bundle

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
