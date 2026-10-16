# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup dev dev-api dev-worker dev-web debug-api debug-worker debug-web \
  check ids lint fmt typecheck test clean outdated vendor-effect

help: ## List all targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-14s %s\n", $$1, $$2 }'

setup: ## Install dependencies and create .env from .env.example if missing
	bun install
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

dev: ## Run api, worker and web together in dev mode
	bun --filter './apps/*' dev

dev-api: ## Run the api with --hot
	bun --filter @oblik/api dev

dev-worker: ## Run the worker with --watch
	bun --filter @oblik/worker dev

dev-web: ## Run the web dev server with HMR
	bun --filter @oblik/web dev

debug-api: ## Run the api with --inspect and --hot
	bun --filter @oblik/api debug

debug-worker: ## Run the worker with --inspect and --watch
	bun --filter @oblik/worker debug

debug-web: ## Run the web dev server with --inspect
	bun --filter @oblik/web debug

check: ids lint typecheck test ## Run every gate: ticket ids, lint, typecheck and tests

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

typecheck: ## Typecheck every workspace with bun check
	bun check

test: ## Run all tests with bun test
	bun test

clean: ## Remove installed dependencies, build caches and coverage
	find . -name node_modules -type d -prune -exec rm -rf {} +
	rm -rf coverage

outdated: ## List outdated dependencies in every workspace
	bun outdated --recursive

vendor-effect: EFFECT_TAG = effect@$(shell bun pm pkg get catalogs.effect.effect 2>/dev/null | tr -d '"')
vendor-effect: ## Pull Effect-TS/effect at the catalog pin into repos/effect (commits)
	git subtree pull --squash --prefix repos/effect https://github.com/Effect-TS/effect.git \
		$(EFFECT_TAG) -m ':wrench: chore(deps): Vendor effect at $(EFFECT_TAG)'
