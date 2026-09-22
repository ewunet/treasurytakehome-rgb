# Label Check

**What this is:** a simple tool that looks at a picture of an alcohol label and checks it against
what was typed on the application (brand name, alcohol %, warning text, etc.), the same way a
reviewer does by eye today — but faster, and without the boring "does this number match that
number" part.

You don't need to know how to code to run this. Just follow the steps below in order.

---

## What it actually does

Think of it like a very fast, very literal assistant sitting next to a reviewer:

- You give it a **picture of a label** and **what the paperwork says** (either typed in by hand,
  or as a spreadsheet for a whole stack of labels at once).
- It reads the text off the picture and compares it, field by field.
- For each thing it checks, it tells you one of three things:
  - ✅ **Matches** — good to go
  - ⚠️ **Take a look** — close, but a human should double check (e.g., a possible misspelling)
  - ❌ **Does not match** — a real difference was found

It never auto-approves or auto-rejects anything on its own. It's a helper, not a decision-maker.

**Two ways to use it:**
1. **Check one label** — upload one picture, type in the application details, get an instant answer.
2. **Check many labels** — upload a whole folder of label pictures plus one spreadsheet listing
   the application details for each, and it works through all of them for you, with a results
   table you can filter and download.

---

## Setup (one-time)

You only need to do this once per computer.

1. **Install Node.js.** This is the free program that lets the app run. Go to
   [nodejs.org](https://nodejs.org), download the version marked **LTS**, and install it like any
   normal program (click through the installer).
2. **Get the project folder onto your computer.** Unzip the project folder you were given
   (or `git clone` it if you're using GitHub — see below).
3. **Open a terminal in that folder.**
   - In VS Code: open the folder (**File → Open Folder...**), then open the built-in terminal
     (**Terminal → New Terminal**).
   - Or on Mac/Windows, open Terminal/Command Prompt and `cd` into the folder.
4. **Install what the app needs** by typing:
   ```bash
   npm install
   ```
   This downloads the "reading" engine (it reads text out of pictures) and takes a minute or two.
   You only need to do this once, unless you delete the folder and start over.

---

## Running it

Every time you want to use the app:

```bash
npm start
```

Wait a few seconds — it'll print something like:
```
Label Check is running at http://localhost:8080
```

Copy that link into your web browser (or hold Cmd/Ctrl and click it in the terminal). The app
opens in your browser. That's it — you're running it locally on your own computer.

To stop it later, click back into the terminal and press `Ctrl+C`.

**First time using it?** Click the **"Load an example"** dropdown (single-label mode) or
**"Try the sample batch"** button (many-labels mode) to see it work instantly with made-up test
labels — no need to find your own files first.

---

## Getting a link you can share (a "deployed" version)

Running it on your own computer only works for you. If you need a public web link others can
open (for example, to submit for review), you need to publish it online. The easiest free way:

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a **new, empty repository** there (click **New repository**, give it a name, don't
   add a README, click **Create**).
3. Back in your terminal, inside the project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Label Check prototype"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
   (Replace `<your-username>` and `<your-repo-name>` with your actual GitHub username and the
   name you picked.)
4. On GitHub, go to your repository's **Settings → Pages**, and under "Build and deployment,"
   set **Source** to **GitHub Actions**. This project already includes the automation needed to
   build and publish itself — you don't need to write anything.
5. Wait a couple of minutes (check the **Actions** tab on GitHub to watch it work), then your
   app is live at:
   ```
   https://<your-username>.github.io/<your-repo-name>/
   ```
   That's the link you can share.

**Heads up:** this kind of link contains your GitHub username, and your repository will be
public. If you'd rather not reveal your GitHub account, services like Netlify or Vercel can
publish the same project under a link that doesn't include your username — ask if you'd like
help setting that up instead.

---

## Our approach, in plain terms

The problem: a human reviewer currently looks at a label picture and an application side by
side, and manually checks that a handful of things match — brand name, alcohol percentage,
bottle size, the government warning text, and so on. It's tedious, repetitive work, and when
someone gets a stack of 200+ labels at once, it's slow going one at a time.

**What we built instead:**

1. **The picture gets cleaned up first.** Photos aren't always perfect — bad lighting, glare,
   a slight tilt. Before reading the text, the app automatically brightens/adjusts the image to
   make the text easier to pick out, similar to how you might squint or adjust your phone's
   brightness to read something blurry.
2. **A "reading" engine turns the picture into text.** This part (called OCR — optical
   character recognition) is what looks at the picture and figures out what words are on it.
3. **The text is compared to what's on the application**, field by field. Because photos and
   OCR aren't perfect, the comparison isn't just "identical or not" — it understands things like:
   - `STONE'S THROW` and `Stone's Throw` are the same brand, just different capitalization —
     that's a match, not an error.
   - `45%` and `90 Proof` mean the same alcohol content — the tool does that math for you.
   - A single misread letter (common on a blurry photo) gets flagged as "take a look" rather
     than an automatic rejection, since it's more likely the camera's fault than a real mismatch.
   - The **government warning** is the one place we're strict: it must be word-for-word, in all
     capital letters, and appear bold. Any real difference there is flagged as a mismatch.
4. **If a photo is hard to read**, the app automatically tries again with different image
   adjustments before giving up and asking a human to look.
5. **For a whole batch of labels**, the app works through multiple images at the same time (like
   having several reviewers working in parallel) so it doesn't slow to a crawl on a big batch.

**Why it runs entirely on your computer, with no internet connection required:** the tool was
built to work even behind strict company firewalls that block outside connections (a real
problem with a previous vendor's tool, which broke because their servers got blocked).
Everything — reading the picture, checking it, comparing — happens right there in your browser.
Nothing gets uploaded anywhere.

---

## Tools used, and why

| Tool | What it's for | Why this one |
|---|---|---|
| **Node.js** | Lets the app run on your computer or a server | Free, standard, works everywhere |
| **Tesseract.js** | Reads text out of pictures (OCR) | Runs entirely in the browser — no cloud service, no internet connection, no per-image cost |
| **Plain HTML/CSS/JavaScript** | Builds the actual screen you interact with | Keeps the whole thing simple and dependency-light, so it's easy to read, change, and deploy — no complicated framework required |
| **GitHub Pages / GitHub Actions** | Publishes the app to a public link automatically | Free, and it re-publishes itself every time you update the code |

Nothing here needs a paid account, a cloud subscription, or a company API key.

---

## Assumptions we made

- The application's details are either typed in by hand (for one label) or listed in a
  spreadsheet (for a batch) — there's no live connection to any government filing system.
- Each picture shows the whole label in one shot (not separate front/back photos).
- Labels are in English.
- The tool is a **helper for a human reviewer**, not a replacement — it never finalizes an
  approval or rejection by itself.

---

## Known limitations (things to keep in mind)

- **Speed depends on your computer.** A typical label is checked in a few seconds; a harder,
  blurrier photo can take a bit longer since it gets a second attempt.
- **Very blurry, tilted, or oddly-lit photos** may still get flagged as "take a look" instead of
  a clean answer — this is intentional (better to ask a human than guess wrong), but it means
  quality photos give the best results.
- **The tool checks wording and numbers, not legal/design details** — like font size rules,
  where exactly the warning sits on the bottle, or whether a specific class/type name is legally
  valid. Those still need a trained reviewer.
- **Large batches (a few hundred labels)** run right there in your browser tab — keep the tab
  open while it works. There's a **Stop** button if you need to pause partway through, and a
  **Download results** button so you don't lose your place.

---

## If something's not working

- **"The reading engine files are missing"** → run `npm install`, then `npm start` again.
- **The page looks stuck on "Getting ready"** → open your browser's developer tools (press F12),
  check the Console tab for red error text, and check that you ran `npm install` successfully.
- **Don't double-click `index.html` to open it.** Always start it with `npm start` and open the
  `localhost` link it gives you — browsers block part of the app from working if you just open
  the file directly.
- **Nothing updating after you change a file?** Try a hard refresh in your browser
  (`Ctrl+Shift+R` on Windows/Linux, `Cmd+Shift+R` on Mac) — browsers sometimes hang onto an old
  cached copy of the page.

---

## For the more technically curious

<details>
<summary>Click to expand: what's checked per type of drink, and how the code is organized</summary>

### What's checked, by type of drink

Requirements differ slightly by drink type (following U.S. TTB rules, 27 CFR Parts 4, 5, 7, 16):

| | Distilled spirits | Wine | Beer / malt beverage |
|---|---|---|---|
| Brand, class/type, bottler name & address | required | required | required |
| Alcohol content | required (proof optional; if both shown, proof must be 2× the percent) | required (a "table wine"/"light wine" label can replace the number for 7–14% wine) | optional (only required if alcohol comes from added flavors; "ABV" isn't an allowed abbreviation) |
| Net contents | metric units | metric units | U.S. units required (fl. oz., pints); metric-only is flagged |
| Country of origin | checked only if the application lists one | same | same |
| Government warning | word-for-word, "GOVERNMENT WARNING:" in capitals and bold | same | same |

### Project layout

```
src/index.html, src/css/styles.css   the page you see
src/js/app.js       the two screens (one label / many labels) and results view
src/js/engine.js    runs the OCR reading, retries on hard photos
src/js/prep.js      image clean-up before reading
src/js/checks.js    the actual field-by-field comparison logic
src/js/rules.js     TTB rules per drink type, and the required warning text
src/js/stroke.js    detects whether the warning heading looks bold
src/js/text.js      fuzzy text-matching helpers (handles typos, capitalization, etc.)
src/js/csv.js       spreadsheet reading for batch mode
samples/            made-up test labels + the script that generated them
tests/              automated tests, checked against real OCR output
scripts/            build script and a small local server
```

### Testing with your own labels

`samples/generate_samples.py` shows how the sample test labels were made (using Python).
AI image generators also work well for creating extra test labels if you want more variety.

For batch mode, your spreadsheet needs a `filename` column matching each picture's file name.
Other accepted column names: `brand_name`, `class_type`, `alcohol_content`, `net_contents`,
`bottler`, `country_of_origin`, `beverage_type` (spirits, wine, or beer).

Other useful commands:
- `npm test` — runs the automated test suite
- `npm run build` — builds the `dist` folder (what actually gets deployed)

</details>
