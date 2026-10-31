# Browser simulations

These tests open the real pages in Chromium and replace Web Bluetooth with a simulated OBDLink CX adapter and simulated vehicle modules. No vehicle and no adapter are necessary.

## Run the tests

Requirements: Node.js 26 (the version in `tests/.nvmrc`) and npm 11 or later.

```sh
cd tests
nvm use            # optional: selects the Node.js version from .nvmrc
npm ci
npx playwright install chromium
npm test
```

`npm ci` installs the exact Playwright version from `package-lock.json`. To use a Chromium that is already installed instead of the downloaded one, set `CHROMIUM_EXECUTABLE` to its path.

Options for `node run.js`:

| Option | Function |
|---|---|
| `--grep <regex>` | Run only the scenarios whose name matches. |
| `--jobs <n>` | Number of scenarios that run at the same time (default 4). |
| `--update-golden` | Write new golden snapshots. Use this only for an intended change. |

GitHub Actions runs all simulations for each pull request and for each push to `main` (`.github/workflows/ci.yml`).

## Dependencies

The site itself has no dependencies. The tests use one: Playwright, at an exact version with a lock file.

- The workflow pins each GitHub Action to a full commit SHA.
- Dependabot (`.github/dependabot.yml`) proposes updates for the GitHub Actions and for the test dependencies once a week. Before it proposes a new release, it waits 7 days.
- CI uses the Node.js version in `tests/.nvmrc`: the current Active LTS.

## Golden snapshots

For each scenario, `tests/golden/` contains a snapshot of:

- every command line that the page sent to the adapter;
- every page timer of 500 ms or more (delay, and the number of commands sent at that moment);
- the log (text and class of each line), the status bar, the status dot and the step results;
- the button labels, states and classes, and the form fields;
- the texts of the confirmation and alert dialogs;
- the browser storage (for example the saved original configuration record);
- for a scenario that reloads the page, the same data from before the reload.

Before the snapshot, the harness waits until the page has no pending timers shorter than 30 s and no new activity for 1 s. A page that does not become idle, or that has a script error, fails the scenario.

The simulated adapter and modules also apply hardware rules: a Bluetooth write of more than 20 bytes fails, and a module does not reply for 1.5 s after a reset.

A test fails if a scenario passes its own assertions but its snapshot differs from the golden snapshot. This shows a change in the commands, timers, log, step results, buttons, dialogs or storage, also when no assertion checks it. A full run also fails if a golden snapshot has no scenario.

If a change in behaviour is intended:

1. Run `npm run test:update-golden`.
2. Read the changes in `tests/golden/` in the diff.
3. Commit the new snapshots together with the change.

## Layout

| Path | Contents |
|---|---|
| `run.js` | Test runner and golden comparison. |
| `sim/serve.js` | Serves the repository files to the browser. |
| `sim/harness.js` | Runs one scenario in an isolated browser context and records the snapshot. |
| `sim/timers.js` | Records the page timers and the pending timers (loaded before the page). |
| `sim/coder-mock.js` | Simulated adapter and modules for the heated grip & seat coder. |
| `coder/scenarios.js` | Scenarios for the heated grip & seat coder. |
| `golden/coder/` | Golden snapshots for these scenarios. |
