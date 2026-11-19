# Contributing

## Rules

1. **One branch per change, from `develop`.** Every feature, fix, bug, chore, etc. starts a new branch from `develop` and opens its PR into `develop`. Never commit directly to `develop` or `main`.
2. **`main` is production.** It only receives PRs from `develop`, opened manually by the owner when a release is due. Feature branches never target `main`.
3. **Branch naming:** `<type>/<kebab-case-description>`
   Types: `feat`, `fix`, `bug`, `hotfix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `build`, `style`.
   Example: `feat/add-login`.
4. **English only.** Commits, PR titles, PR descriptions, issues and code comments are written in English. No Portuguese (pt-BR).
5. **Conventional Commits** for commits and PR titles: `type(scope): short description` (use `!` for breaking changes). A release PR from `develop` into `main` uses a title such as `chore(release): v0.1.0` and gets the `release` label automatically.
6. **Every PR must have** at least one label, a linked Project and the owner as assignee. Labels and assignee are added automatically; the Project is added by the workflow when configured (see below).
7. **Every merge into `main` creates a new Release** (semver, automatic), computed from the release PR and from every commit since the last tag:
   - `breaking` label, `!` in a title or commit subject, or `BREAKING CHANGE` in a commit body -> major
   - `feature` label or any `feat` commit -> minor
   - anything else -> patch

## One-time repository setup

1. **Project token.** Create a fine-grained PAT (or classic PAT with `project` + `repo` scopes) that can write to your GitHub Project. Save it as repository secret `PROJECT_TOKEN`.
2. **Project URL.** Add repository variable `PROJECT_URL` (e.g. `https://github.com/users/<you>/projects/1`).
3. **Assignee (optional).** The assignee defaults to the repository owner. To use another user, set repository variable `PR_ASSIGNEE`.
4. **Branch protection / rulesets on `main` and `develop`.** Settings -> Rules -> Rulesets: require a pull request, require the status check `Validate PR rules`, block direct pushes. Make `develop` the default branch so new PRs target it.
5. **Actions permissions.** Settings -> Actions -> General -> Workflow permissions: "Read and write permissions".
6. Run the **Sync labels** workflow once (Actions tab) to create all labels.

## Files in this folder

| File | Purpose |
| --- | --- |
| `workflows/pr-governance.yml` | Auto-assign, auto-label, add to Project, validate branch/title/commits/labels/project |
| `workflows/release.yml` | Creates a semver Release on every merge into `main` (release PRs from `develop`) |
| `workflows/sync-labels.yml` + `labels.yml` | Keeps the label set consistent across repos |
| `release.yml` | Groups release notes by label |
| `pull_request_template.md` | PR checklist |
| `ISSUE_TEMPLATE/` | Bug and feature templates (English) |
