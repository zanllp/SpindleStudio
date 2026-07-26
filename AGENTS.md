# Agent Notes

## Release Workflow

This project uses a **release branch** model to trigger builds:

- **`main`** — stable development branch. Merges from feature branches.
- **`releases/v*`** — release branches (e.g., `releases/v1.0.1`). Pushing to these branches triggers the GitHub Actions `build-and-release` workflow.

### To cut a new release:

```bash
# 1. Ensure main is up to date
git checkout main
git pull origin main

# 2. Bump version in package.json (e.g., 1.0.1 → 1.0.2)

# 3. Create release branch from main
git checkout -b releases/v1.0.2

# 4. Commit version bump
git add package.json
git commit -m "chore(release): bump version to 1.0.2"

# 5. Push to trigger CI
git push -u origin releases/v1.0.2
```

The workflow will:
- Build on Windows / Linux / macOS
- Upload artifacts to the Actions run
- Create a draft GitHub Release with the version tag

**Important:** Always create release branches **from `main`**, not from previous release branches.
