# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset dev dev-api dev-worker dev-web debug-api debug-worker \
  debug-web check ids lint fmt typecheck test clean outdated vendor-effect \
  vendor-drizzle migrate migration migration-check

# The local Pulumi project: the file backend under .data/ and the home (plugins, credentials) under
# .pulumi/, both in the repo; the home survives `make reset`. The passphrase is empty: the one
# secret, the local database's password, is a fixed value in deployment/local/settings.ts.
PULUMI = PULUMI_HOME=$(CURDIR)/.pulumi PULUMI_CONFIG_PASSPHRASE= pulumi -C deployment/local
MINISTACK_URN = urn:pulumi:local::app-template-local::docker:index/container:Container::ministack

# A switch of the AWS provider's own test harness (terraform-provider-aws): in replay mode it skips
# the fixed waits around RDS, SQS and S3 lifecycle calls, 86 s down to 7 s on a cold `up`. VCR_PATH
# only has to be non-empty: nothing is recorded or replayed. Without it `up` is slow, never wrong.
# For the local stack only.
FAST_PROVIDER = VCR_MODE=REPLAY_ONLY VCR_PATH=unused

# Exports .env, since Pulumi starts the program itself, and names the MiniStack container after the
# port of AWS_ENDPOINT_URL, as deployment/local/ministack.ts does.
STAND = set -a && . ./.env && set +a && \
	ministack=app-template-ministack-$$(echo "$$AWS_ENDPOINT_URL" | sed -E 's/.*:([0-9]+).*/\1/')

help: ## List all targets
	@echo 'App Template: make <target>'
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-16s %s\n", $$1, $$2 }'

setup: ## Install dependencies and create .env from .env.example if missing
	bun install
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

stack: ## Log Pulumi in to the file backend and select or create the local stack
	@mkdir -p .data/pulumi
	@$(PULUMI) login --non-interactive file://$(CURDIR)/.data/pulumi
	@$(PULUMI) stack select local 2>/dev/null || $(PULUMI) stack init local

# The container alone is refreshed, once it is in the state, so a MiniStack stopped by `make down`
# starts again; a full refresh while it is down would drop the bucket from the state.
up: stack ## Start MiniStack, create the database, bucket and queues in it, migrate
	if $(PULUMI) stack export | grep -qF '$(MINISTACK_URN)'; then \
		$(PULUMI) refresh --yes --skip-preview --target '$(MINISTACK_URN)'; fi
	$(STAND) && $(FAST_PROVIDER) $(PULUMI) up --yes --skip-preview
	$(PULUMI) stack output --shell > .env.pulumi
	$(MAKE) migrate

down: ## Stop MiniStack, which stops the database's container; every resource keeps its data
	$(STAND) && docker ps -q --filter "name=^$$ministack$$" | xargs -r docker stop

# A killed MiniStack leaves the instance's container running, and MiniStack names it and its volume
# after the identifier, app-template-<STAGE>-database; no destroy runs, since .data/ holds the
# Pulumi state.
reset: ## Remove MiniStack, the database's container and volume, and .data/ whole
	$(STAND) && id=app-template-$$STAGE-database && \
		docker rm -f "$$ministack" $$(docker ps -aq --filter label=ministack=rds --filter "label=db_id=$$id") && \
		docker volume ls -q --filter "name=instance-$$id-data" | xargs -r docker volume rm
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

check: ids lint typecheck migration-check test ## Run every gate: ids, lint, types, migrations, tests

ids: ## Fail on ticket ids in parentheses (D12, R3, Q70) outside docs/tickets
	@if git grep --untracked -nE '\((D|R|Q)[0-9]+[a-z]?\)' -- . ':!docs/tickets' \
		':!.github/PULL_REQUEST_example.md' ':!repos'; then \
		echo 'Ticket ids belong in docs/tickets/ and commit messages, not in code, config or docs.'; \
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

test: ## Run all tests with vitest on the Bun runtime
	bun run test

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
