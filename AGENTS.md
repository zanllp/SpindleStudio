# Agent Notes

## UI Component Guidelines

### Components that scale with conversation length must be hand-written

Any component whose instance count grows linearly with the number of messages, images, or conversations (message rows, image cards, per-row action buttons, tooltips, popconfirms) must NOT use antd-vue or other heavy component-library components. Hand-write them with plain HTML/CSS.

- A 200-message conversation would otherwise mount 1000+ Tooltip/Popconfirm instances, each carrying its own reactive state, vnode subtree, and trigger/positioning logic — slowing initial mount and every row re-render.
- antd-vue is reserved for **singleton** UI: modals, forms, settings pages, one-off inputs. Programmatic singletons (e.g. `Modal.confirm`) are fine.

### Scroll experience takes priority over render-skipping optimizations

Do NOT use `content-visibility: auto` or similar render-skipping techniques on the message list. Skipped rows must be synchronously re-rendered during fast scrolling, and the catch-up window shows as a white flash. Off-screen **image bitmap** unloading (unmounting `<img>` elements with sized placeholders) is fine — text and layout must stay fully rendered.

## Release Workflow

This project uses a **release branch** model to trigger builds:

- **`main`** — **always the latest code**. All development happens here. Feature branches merge into main.
- **`releases/v*`** — **temporary CI trigger branches only**. Created from main, pushed to trigger GitHub Actions, then merged back to main immediately.

### Key rule

**`main` is always ahead.** Release branches are short-lived and exist only to trigger the build workflow. After pushing a release branch, merge it back to `main` right away so main never falls behind.

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

# 6. IMMEDIATELY merge back to main so main stays latest
git checkout main
git merge releases/v1.0.2
git push origin main
```

The workflow will:
- Build on Windows / Linux / macOS
- Upload artifacts to the Actions run
- Create a draft GitHub Release with the version tag

**Important:** Never let `main` fall behind a release branch. If it does, merge the release branch back immediately.
