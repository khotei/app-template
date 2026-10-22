# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset dev dev-api dev-worker dev-web debug-api debug-worker \
  debug-web check ids lint fmt typecheck test clean outdated vendor-effect

# The local Pulumi project: the file backend under .data/ and the home (plugins, credentials) under
# .pulumi/, both in the repo; the home survives `make reset`. The passphrase is empty because the
# stack holds no secret.
PULUMI = PULUMI_HOME=$(CURDIR)/.pulumi PULUMI_CONFIG_PASSPHRASE= pulumi -C deployment/local

help: ## List all targets
	@echo 'App Template: make <target>'
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-14s %s\n", $$1, $$2 }'

setup: ## Install dependencies and create .env from .env.example if missing
	bun install
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

stack: ## Log Pulumi in to the file backend and select or create the local stack
	@mkdir -p .data/pulumi
	@$(PULUMI) login --non-interactive file://$(CURDIR)/.data/pulumi
	@$(PULUMI) stack select local 2>/dev/null || $(PULUMI) stack init local

# The program reads AWS_ENDPOINT_URL through AwsConfig, so `up` exports .env to it; `destroy` runs
# no program.
up: stack ## Start MiniStack through Pulumi and provision the inventory on it
	set -a && . ./.env && set +a && $(PULUMI) up --yes --skip-preview
	bun --env-file=.env deployment/local/provision.ts

down: stack ## Stop MiniStack
	$(PULUMI) destroy --yes --skip-preview

reset: down ## Stop MiniStack and remove .data/ whole (its state, the stack, the store)
	rm -rf .data

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

check: ids lint typecheck test ## Run every gate: ticket ids, lint, typecheck, tests

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
