# Human interface for the monorepo. Recipes stay GNU Make 3.81 compatible (the macOS default).

.DEFAULT_GOAL := help

.PHONY: help setup stack up down reset worktree numbers dev dev-api dev-worker dev-web debug-api \
  debug-worker debug-web check doc-lint sh-lint link-check review-rules lint \
  fmt typecheck test test-unit test-e2e bundle-check outdated vendor-effect vendor-drizzle \
  migrate migration migration-check api-snapshot api-client-check

# The local Pulumi project: each tree's file backend under its .data/, named per command, so no
# login is stored; the home (the provider plugins) is the main tree's .pulumi/, shared by every
# worktree and kept by `make reset`. The passphrase is empty: the stack's one secret is the local
# database's password, a constant in deployment/local/settings.ts.
MAIN_TREE := $(shell dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")
PULUMI = PULUMI_HOME=$(MAIN_TREE)/.pulumi PULUMI_BACKEND_URL=file://$(CURDIR)/.data/pulumi \
  PULUMI_CONFIG_PASSPHRASE= pulumi -C deployment/local
PROJECT := $(shell sed -n 's/^name: //p' deployment/local/Pulumi.yaml)
CONTAINER_URNS = urn:pulumi:local::$(PROJECT)::docker:index/container:Container::*

# A switch of the AWS provider's own test harness that skips its fixed waits; VCR_PATH only has to
# be non-empty, nothing is recorded or replayed. Local stack only: docs/knowledge/aws.md.
FAST_PROVIDER = VCR_MODE=REPLAY_ONLY VCR_PATH=unused

# Why the recipes export .env: docs/knowledge/tooling.md › Environment.
EXPORT_ENV = set -a && . ./.env && set +a
# Every container and volume of the tree's stand holds the kernel's name prefix of its stage,
# the database's container and volume, which MiniStack names, included.
STAND = name=app-template-$$STAGE-
DRIZZLE_CONFIG = kernel/data/drizzle.config.ts

help: ## List all targets
	@echo 'App Template: make <target>'
	@grep -E '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " } { printf "  %-16s %s\n", $$1, $$2 }'

# Claude Code fetches a plugin from an outside source only when user settings enable it, so setup
# installs mattpocock-skills, whose skills /lab calls; a machine without claude skips it.
setup: ## Install dependencies and the Claude Code plugins, create .env from .env.example if missing
	bun install
	@if command -v claude >/dev/null; then \
		claude plugin install mattpocock-skills@claude-plugins-official --scope project; fi
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

stack: ## Create the tree's Pulumi file backend and select or create the local stack
	@mkdir -p .data/pulumi
	@$(PULUMI) stack select --create local

# Refreshes the containers alone: docs/knowledge/aws.md. A wildcard target, unlike a full URN,
# passes on a stack that holds none yet.
up: stack ## Start MiniStack and the telemetry backend, create the database, bucket and queues, migrate
	$(PULUMI) refresh --yes --skip-preview --target '$(CONTAINER_URNS)'
	$(EXPORT_ENV) && $(FAST_PROVIDER) $(PULUMI) up --yes --skip-preview
	$(PULUMI) stack output --shell > .env.pulumi
	$(MAKE) migrate
	@$(EXPORT_ENV) && echo "Grafana: http://localhost:$$GRAFANA_PORT (admin/admin)"

down: ## Stop MiniStack, which stops the database's container, and the telemetry backend; every resource keeps its data
	$(EXPORT_ENV) && docker ps -q --filter "$(STAND)ministack" --filter "$(STAND)telemetry" | xargs -r docker stop

# A killed MiniStack leaves the database's container running; why no destroy runs:
# docs/knowledge/aws.md.
reset: ## Remove MiniStack, the database's container and volume, the telemetry backend, the tree's MCP containers, .data/
	$(EXPORT_ENV) && { docker ps -aq --filter "$(STAND)"; docker ps -aq --filter "label=app-template.mcp-tree=$(CURDIR)"; } | \
		xargs -r docker rm -fv && docker volume ls -q --filter "$(STAND)" | xargs -r docker volume rm
	rm -rf .data .env.pulumi

# Run inside the new worktree; the ports it moves: docs/knowledge/tooling.md › Worktrees.
worktree: ## Name a worktree, install it, write its .env: N=<n> NAME=<name> [KEEP=1, the branch stays]
	@sh .claude/skills/lab/worktree.sh "$$N" "$$NAME" "$$KEEP"

numbers: ## A lab's Numbers from git: [SLUG=<slug>] [RANGE=main..HEAD]
	@sh .claude/skills/lab/numbers.sh "$$SLUG" "$${RANGE:-main..HEAD}"

migrate: ## Apply the pending migrations to the database in .env.pulumi
	bun --env-file=.env --env-file=.env.pulumi kernel/postgres/migrate.ts

# drizzle-kit is a root devDependency: the isolated linker links a workspace's binary only in that
# workspace. The config's paths resolve against the working directory, the root.
migration: ## Generate a migration from the entities, with no database: NAME=<name>
	@test -n "$(NAME)" || { echo 'usage: make migration NAME=<name>'; exit 1; }
	bunx drizzle-kit generate --config $(DRIZZLE_CONFIG) --name $(NAME)

# drizzle-kit's dry run: the JSON status decides, the text run shows the SQL, its stdin closed so a
# rename is reported, not asked. Soft here, strict in CI: docs/knowledge/database.md › Migrations.
migration-check: ## Fail when an entity changed without a migration
	@bunx drizzle-kit generate --config $(DRIZZLE_CONFIG) --explain --output json 2>/dev/null | grep -q '"status":"no_changes"' || { \
		bunx drizzle-kit generate --config $(DRIZZLE_CONFIG) --explain </dev/null; \
		echo; echo 'The entities differ from kernel/data/migrations (above). Regenerate the one init:'; \
		echo 'delete that folder and run make migration NAME=init (docs/knowledge/database.md › Migrations).'; \
		exit 1; \
	}

# The web's client, as @effect/openapi-generator's installed command writes it from the api's
# snapshot; --no-install stops bunx from fetching a registry package of that name instead.
API_CLIENT = cd apps/web && bunx --no-install --bun openapigen -s ../api/openapi.json -n Api -f httpapi

api-snapshot: ## Rewrite the api's OpenAPI snapshot from its code, then the web's client from it
	bun --bun vitest run --project unit apps/api/__tests__/openapi.test.ts -u
	$(API_CLIENT) > shared/api.generated.ts

api-client-check: ## Fail when the web's client differs from what the api's snapshot generates
	@$(API_CLIENT) | cmp -s - shared/api.generated.ts || \
		{ echo 'The web client is stale: run make api-snapshot and commit it' >&2; exit 1; }

dev: migrate ## Run api, worker and web together in dev mode
	bun --filter './apps/*' dev

dev-api: migrate ## Run the api
	bun --filter @app-template/api dev

dev-worker: migrate ## Run the worker
	bun --filter @app-template/worker dev

dev-web: ## Run the web dev server
	bun --filter @app-template/web dev

debug-api: ## Run the api with the inspector
	bun --filter @app-template/api debug

debug-worker: ## Run the worker with the inspector
	bun --filter @app-template/worker debug

debug-web: ## Run the web dev server with the inspector
	bun --filter @app-template/web debug

check: api-client-check typecheck bundle-check link-check migration-check sh-lint doc-lint lint test ## Run every gate, the cheapest first

# Its scope and rules are .misc/lint/markdownlint-cli2.mjs; a reworded limits line stops it with 2.
doc-lint: ## Lint the Markdown outside docs/tickets: width, paths, rule filters, file limits
	@bunx markdownlint-cli2 --config .misc/lint/markdownlint-cli2.mjs

# Each image by version and by the digest of its multi-arch index, so a moved tag changes nothing.
SHELLCHECK_IMAGE = koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d
LYCHEE_IMAGE = lycheeverse/lychee:0.24.2@sha256:eaff3e0a13603c9a701accfcc84f44158bb77bf36ecfa4622b626056c3463892

sh-lint: ## Lint the shell scripts outside repos/ and docs/tickets/ with ShellCheck (Docker running)
	@git ls-files -z -co --exclude-standard -- '*.sh' ':!:repos/' ':!:docs/tickets/' | xargs -0 -r \
		docker run --rm -v "$(CURDIR):/mnt" -w /mnt $(SHELLCHECK_IMAGE) --rcfile .misc/lint/shellcheckrc

link-check: ## Check the relative links of README.md, docs/ and .claude/ with lychee (Docker running)
	@docker run --rm -v "$(CURDIR):/input:ro" -w /input $(LYCHEE_IMAGE) --offline --no-progress \
		--exclude-path '^\.claude/worktrees/' README.md 'docs/**/*.md' '.claude/**/*.md'

# /lab passes the parent of the step's first round as BASE and hands the list to the Rules
# reviewer.
BASE = HEAD

review-rules: ## List the rules that bind the diff from BASE (default HEAD): no paths: filter, or one it matches
	@bun .misc/lint/rule-filters.mjs '$(BASE)'

# A plugin that errors on a file is skipped there with a notice, `  i <plugin> errored: <reason>`,
# and Biome still exits 0: that line stops the run with 2. The pattern is anchored, as the output
# also quotes source lines. CI runs `make -k check BIOME=ci`.
BIOME = check

lint: ## Lint and format-check with Biome and its plugins, failing on a plugin that errored
	@out=$$(bunx biome $(BIOME) --colors=off --error-on-warnings 2>&1); status=$$?; \
	printf '%s\n' "$$out"; \
	if printf '%s\n' "$$out" | grep -qE '^  i [^ ]+ errored: '; then \
		echo 'lint: a Biome plugin errored and checked nothing in that file: fix the plugin.' >&2; \
		exit 2; \
	fi; \
	exit $$status

fmt: ## Apply Biome formatting and safe fixes
	bunx biome check --write

# The Effect compiler by its own path, so the gate holds on an install whose prepare did not patch
# tsc; not bun check, which ignores tsconfig plugins and so misses every Effect diagnostic.
typecheck: ## Typecheck every workspace with Effect diagnostics
	"$$(bunx effect-tsgo get-exe-path)" -b

test: test-unit test-e2e ## Run the unit and the e2e tests

test-unit: ## Run the unit tests under __tests__/ (no Docker)
	bun --bun vitest run --project unit

test-e2e: ## Run the e2e tests under __e2e__/ and apps/e2e/ on their own containers (Docker running)
	bun --bun vitest run --project e2e

# Reads the build's metafile, so it sees what the bundle holds however Bun applies "sideEffects":
# docs/knowledge/architecture.md › Boundary guards. A metafile or manifest the script cannot read
# stops the check with 2, so it never reads as a clean bundle.
WEB_BUNDLE = node_modules/.cache/web-bundle

bundle-check: ## Fail when the web bundle holds a package outside browserPackages in apps/web/package.json, naming its import chain
	bun build apps/web/app/main.ts --outdir $(WEB_BUNDLE) --target browser --metafile=$(WEB_BUNDLE)/meta.json
	@bun .misc/lint/bundle-check.mjs $(WEB_BUNDLE)/meta.json

outdated: ## List outdated dependencies in every workspace
	bun outdated --recursive

# A vendored library is a slice of its repository at the catalog pin: its guides, sources, examples
# and agent skills, not its tests, changelogs or tooling. $(call vendor,<url>,<tag>,<folder>,<paths>)
# fetches the tag at depth 1 into a throwaway bare repository, empties the folder and exports the
# paths into it; commit the result with the catalog bump.
define vendor
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && git init -q --bare "$$tmp" && \
	git -C "$$tmp" fetch -q --depth 1 --no-tags $(1) tag $(2) && \
	git -C "$$tmp" archive -o "$$tmp/slice.tar" $(2) -- $(4) && \
	rm -rf $(3) && mkdir -p $(3) && tar -x -f "$$tmp/slice.tar" -C $(3) && \
	echo "$(3): $$(find $(3) -type f | wc -l | tr -d ' ') files of $(2)"
endef

EFFECT_SLICE = LLMS.md MIGRATION.md ':(glob)migration/*.md' ai-docs .agents \
  ':(glob)packages/**/src/**' ':(glob)packages/**/*.md' ':(exclude,glob)**/CHANGELOG.md'
DRIZZLE_SLICE = ':(glob)*.md' docs drizzle-orm/src drizzle-kit/src drizzle-kit/skills \
  ':(glob)drizzle-kit/*.md'

vendor-effect: ## Export Effect-TS/effect's slice at the catalog pin into repos/effect
	$(call vendor,https://github.com/Effect-TS/effect.git,effect@$(shell bun pm pkg get catalogs.effect.effect | tr -d '"'),repos/effect,$(EFFECT_SLICE))

vendor-drizzle: ## Export drizzle-team/drizzle-orm's slice at the catalog pin into repos/drizzle
	$(call vendor,https://github.com/drizzle-team/drizzle-orm.git,v$(shell bun pm pkg get catalogs.drizzle.drizzle-orm | tr -d '"'),repos/drizzle,$(DRIZZLE_SLICE))
