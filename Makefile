# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset dev dev-api dev-worker dev-web debug-api debug-worker \
  debug-web check ids lint fmt typecheck test clean outdated vendor-effect \
  vendor-drizzle migrate migration migration-check

# Both Pulumi projects, `$(call PULUMI,local)` and `$(call PULUMI,aws)`: one file backend under
# .data/ and one home (plugins, credentials) under .pulumi/, both in the repo; the home survives
# `make reset`. The passphrase is empty: the only secret, the database password, is DATABASE_URL's
# in .env.
PULUMI = PULUMI_HOME=$(CURDIR)/.pulumi PULUMI_CONFIG_PASSPHRASE= pulumi -C deployment/$(1)

# The programs read .env through @app-template/config, and Pulumi starts them itself, so a recipe
# exports .env to the shell first.
ENV = set -a && . ./.env && set +a

help: ## List all targets
	@echo 'App Template: make <target>'
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-16s %s\n", $$1, $$2 }'

setup: ## Install dependencies and create .env from .env.example if missing
	bun install
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

stack: ## Log Pulumi in to the file backend and select or create both local stacks
	@mkdir -p .data/pulumi
	@$(call PULUMI,local) login --non-interactive file://$(CURDIR)/.data/pulumi
	@$(call PULUMI,local) stack select local 2>/dev/null || $(call PULUMI,local) stack init local
	@$(call PULUMI,aws) stack select local 2>/dev/null || $(call PULUMI,aws) stack init local

up: stack ## Start MiniStack, create the database instance on it, migrate and provision
	$(ENV) && $(call PULUMI,local) up --yes --skip-preview
	$(ENV) && $(call PULUMI,aws) up --yes --skip-preview
	bun --env-file=.env deployment/local/check-database.ts
	$(MAKE) migrate
	bun --env-file=.env deployment/local/provision.ts

# The instance stays in the aws stack, so its data respawns with MiniStack on the next `up`.
down: stack ## Stop MiniStack; the database keeps its data
	$(call PULUMI,local) destroy --yes --skip-preview

# The aws destroy needs MiniStack, so it runs only while MiniStack answers; the container and the
# volume MiniStack names after the instance go by hand, as do any a killed MiniStack orphaned.
reset: stack ## Remove the database, stop MiniStack, and remove .data/ whole
	$(ENV) && if curl -sf "$$AWS_ENDPOINT_URL/_ministack/health" >/dev/null; then \
		$(call PULUMI,aws) destroy --yes --skip-preview; fi
	$(call PULUMI,local) destroy --yes --skip-preview
	$(ENV) && id="app-template-$$STAGE-database" && \
		docker ps -aq --filter label=ministack=rds --filter "label=db_id=$$id" | xargs -r docker rm -f && \
		docker volume ls -q --filter "name=instance-$$id-data" | xargs -r docker volume rm
	rm -rf .data

migrate: ## Apply the pending migrations to the database in .env
	bun --env-file=.env infrastructure/db/migrate.ts

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
