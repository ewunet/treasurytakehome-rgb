# Label Check

**What this is:** a simple tool that looks at a picture of an alcohol label and checks it against
what was typed on the application (brand name, alcohol %, warning text, etc.), the same way a
reviewer does by eye today, but faster

You don't need to know how to code to run this. Just follow the steps below in order.

---

## What it actually does

Thinking of it like a very fast, very literal assistant sitting next to a reviewer:

- You give it a **picture of a label** and **what the paperwork says** (either typed in by hand,
  or as a spreadsheet for a whole stack of labels at once).
- It reads the text off the picture and compares it, field by field.
- For each thing it checks, it tells you one of three things:
  - ✅ **Matches** : good to go
  - ⚠️ **Take a look** : close, but a human should double check (e.g., a possible misspelling)
  - ❌ **Does not match** : a real difference was found

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

## Running it locally

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

---

## Tools used, and why

| Tool                              | What it's for                                    | Why this one                                                                                                                    |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**                       | Lets the app run on your computer or a server    | Free, standard, works everywhere                                                                                                |
| **Tesseract.js**                  | Reads text out of pictures (OCR)                 | Runs entirely in the browser — no cloud service, no internet connection, no per-image cost                                      |
| **Plain HTML/CSS/JavaScript**     | Builds the actual screen you interact with       | Keeps the whole thing simple and dependency-light, so it's easy to read, change, and deploy — no complicated framework required |
| **GitHub Pages / GitHub Actions** | Publishes the app to a public link automatically | Free, and it re-publishes itself every time you update the code                                                                 |

Nothing here needs a paid account, a cloud subscription, or a company API key.

---

## Assumptions we made

- The application's details are either typed in by hand (for one label) or listed in a
  spreadsheet (for a batch) — there's no live connection to any government filing system.
- Each picture shows the whole label in one shot (not separate front/back photos).
- Labels are in English.
- The tool is a helper for a human reviewer, not a replacement, it never finalizes an approval or rejection by itself.

---

# Limitations and trade-offs

**It's only as good as the OCR.** Every check in this app starts from text that Tesseract read off a photo, so if the OCR misreads a word, everything downstream inherits that mistake. I added two image-cleanup passes, one is a a plain contrast stretch, and the other is a background-flattening pass for uneven lighting. The app automatically retries with the second one if the first doesn't produce a clean pass. That helps with lighting problems, but it doesn't fix an actual tilted photo. I never built a de-skew step, so a label photographed at a noticeable angle is likely to OCR poorly no matter which cleanup pass runs.

**English only.** The OCR engine is loaded with just the English language pack. Most of the app's own checks (ABV, net contents, brand name) will still hold up reasonably on imported labels, since those are often numbers or Roman-alphabet brand names, but a label with real body text in another language probably won't OCR cleanly.

- **The tool checks wording and numbers, not legal/design details** — like font size rules,
  where exactly the warning sits on the bottle, or whether a specific class/type name is legally
  valid. Those still need a trained reviewer.

**The number parsing is pattern-based.** ABV and net contents are pulled out with regular expressions looking for specific formats: a percentage, a proof number, a known unit like "fl oz" or "mL." A label that prints these in an unusual way — a range instead of a single number, an abbreviation I didn't anticipate, or the number baked into a logo instead of live text — comes back as "not found," which is a false fail rather than a false pass.

**No persistence.** Everything runs in the browser tab and nothing gets uploaded anywhere. This means there's no history of past runs and no recovery if the tab closes mid-batch-you'd have to re-run the batch and re-export the CSV. Matching a label photo to its application row is also done by exact filename, so a renamed or mistyped filename quietly shows up as "no matching row" instead of getting matched.

**Scale is untested past a few hundred images.** I tested this comfortably at 300 labels. It's all client-side, single-tab, CPU-bound OCR with no server component, so I'd expect it to keep working at higher volumes, just more slowly — but I haven't verified where it actually starts straining browser memory, or how gracefully it'd recover from a crash partway through a much bigger batch.

---

## Ideas for the future

- **Convenient application info for checking one image** Currently user types in application info, next feature would be an option to extract it directly from application
- **Thorough image cleanup passes** matching could be closer to accurate, could consider tilted photos or blurry photos
- **Increase usability** on the "Checking multiple features tab" adding a feature to drag and drop folders of labels, instead of dragging and dropping the images themselves.

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

|                                           | Distilled spirits                                                      | Wine                                                                               | Beer / malt beverage                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Brand, class/type, bottler name & address | required                                                               | required                                                                           | required                                                                                          |
| Alcohol content                           | required (proof optional; if both shown, proof must be 2× the percent) | required (a "table wine"/"light wine" label can replace the number for 7–14% wine) | optional (only required if alcohol comes from added flavors; "ABV" isn't an allowed abbreviation) |
| Net contents                              | metric units                                                           | metric units                                                                       | U.S. units required (fl. oz., pints); metric-only is flagged                                      |
| Country of origin                         | checked only if the application lists one                              | same                                                                               | same                                                                                              |
| Government warning                        | word-for-word, "GOVERNMENT WARNING:" in capitals and bold              | same                                                                               | same                                                                                              |

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
