# Logic Puzzles

Four classic logic puzzles as an installable web app that works offline:

- **💡 Lights Out:** tap a light to flip it and its four neighbors, and turn every light off. Easy 4×4, Medium 5×5, Hard 6×6. Shows the fewest taps possible.
- **🔢 Sliding Tiles:** slide the numbers into order. Easy 3×3, Medium 4×4, Hard 5×5. Easy shows the fewest moves possible and offers hints.
- **💣 Minesweeper:** clear the field. Easy 8×8 with 10 mines, Medium 9×12 with 20, Hard 10×14 with 30. Every board starts with an open area and **can be solved by logic alone, with no guessing**.
- **👑 Queens:** place one queen in every row, column and colored region, with no two queens touching. Easy 6×6, Medium 7×7, Hard 8×8. Tap once for ✕, twice for a queen; queens that break a rule turn red. Every puzzle has exactly one answer, reachable by logic alone.

There's also a **daily set**: one of each puzzle at Medium, the same for everyone that day. Finishing all four keeps a streak going (a streak from before Queens was added isn't broken by it). The app saves best times and moves on the device, resumes an unfinished puzzle after it closes, and pauses the clock while it's in the background. A hint is available when you're stuck, but a puzzle solved with a hint doesn't set a best time.

## How it's built

- Plain HTML, CSS and JavaScript (ES modules), with no framework.
- **`src/puzzles/`** holds the puzzle logic as pure functions:
  - Puzzle generation is seeded, so a seed always produces the same puzzle. That's how the daily puzzles match on every device, and how a game in progress is restored.
  - **Lights Out** is solved exactly with linear algebra over GF(2), for the hint and the fewest taps.
  - **Sliding Tiles** only produces solvable shuffles. The 3×3 board is solved with IDA\*.
  - **Minesweeper** boards are redrawn until a solver using safe deductions alone (single-number rules, comparing overlapping numbers, and the mine count) can finish them.
  - **Queens** boards grow one region around each queen of a planned answer, then move squares between regions until no other answer exists. A step-by-step solver that reasons like a player then checks the board can be finished by logic, and that Medium and Hard need the harder kinds of reasoning (regions boxed into the same rows or columns, and one-step "what if" checks). Hints come from the same solver.
- **`src/main.js`** runs the screens, the clock, saving, the result pop-ups and the phone's Back gesture.
- **`npm run build`** bundles everything into `dist/` with esbuild and writes a service worker that caches every file for offline play. A new version installs in the background and is offered with an Update button, so a puzzle in progress is never interrupted. The app also looks for a new version whenever it comes back on screen and every hour while open, since phones often resume an installed app instead of reopening it.
- **Installing:** Home shows an Install card when the browser can install the app (Android, desktop Chrome and Edge). On iPhone and iPad it shows the Add to Home Screen steps instead. It hides once installed or after "Not now", and Settings keeps an Install button.

## Development

```sh
npm install
npm start          # play the source at http://localhost:8080
npm test           # unit tests, then build and run the browser tests
npm run preview    # build and serve dist/ at http://localhost:8080
```

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/deploy.yml`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The Fredoka font (SIL Open Font License) and canvas-confetti (ISC license) are bundled in `vendor/`.
