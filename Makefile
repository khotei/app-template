# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup dev dev-api dev-worker dev-web debug-api debug-worker debug-web \
  check lint fmt typecheck test clean outdated

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

check: lint typecheck test ## Run every gate: lint, typecheck and tests

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
