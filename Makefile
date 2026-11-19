# Thin wrapper over the npm scripts in package.json, which hold the real logic
# so that hooks, CI and Windows shells all run the same commands.

.PHONY: setup check-fast check-full dev build

# Installs dependencies and points git at the committed hooks in scripts/hooks.
setup:
	npm install
	git config core.hooksPath scripts/hooks

check-fast:
	npm run check:fast

check-full:
	npm run check:full

dev:
	npm run dev

build:
	npm run build
