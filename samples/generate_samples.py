"""Generates the sample label images + batch.csv used by the demo.
Run:  python3 samples/generate_samples.py   (needs Pillow)
The labels are made up. They are only for testing the app."""
import csv, math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = "/usr/share/fonts/truetype"
def font(name, size):
    for base in (FONT_DIR + "/liberation", FONT_DIR + "/dejavu", "."):
        p = os.path.join(base, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

SANS, SANS_B = "LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"
SERIF_B = "DejaVuSerif-Bold.ttf"

WARNING_HEAD = "GOVERNMENT WARNING:"
WARNING_BODY = ("(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy "
                "because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability "
                "to drive a car or operate machinery, and may cause health problems.")

def centered(d, text, y, f, fill, width):
    w = d.textlength(text, font=f)
    d.text(((width - w) / 2, y), text, font=f, fill=fill)
    return y + f.size * 1.35

def wrapped_runs(d, runs, x, y, max_w, line_h):
    """runs = [(word, font)] drawn left to right with wrapping."""
    cx = x
    for word, f in runs:
        w = d.textlength(word + " ", font=f)
        if cx + w > x + max_w:
            cx, y = x, y + line_h
        d.text((cx, y), word, font=f, fill=(20, 20, 20))
        cx += w
    return y + line_h

def make_label(path, spec, degrade=None):
    W, H = 1200, 1600
    img = Image.new("RGB", (W, H), spec.get("paper", (244, 238, 224)))
    d = ImageDraw.Draw(img)
    ink = spec.get("ink", (40, 28, 20))
    d.rectangle([40, 40, W - 40, H - 40], outline=ink, width=6)
    d.rectangle([64, 64, W - 64, H - 64], outline=ink, width=2)
    y = 170
    for line in spec["brand"].split("|"):
        y = centered(d, line, y, font(SERIF_B, spec.get("brand_size", 96)), ink, W)
    y += 30
    y = centered(d, spec["class"], y, font(SANS_B, 44), ink, W)
    y += 40
    if spec.get("abv"):
        y = centered(d, spec["abv"], y, font(SANS, 46), ink, W)
    y = centered(d, spec["net"], y, font(SANS, 46), ink, W)
    y += 50
    for line in spec["producer"].split("|"):
        y = centered(d, line, y, font(SANS, 34), ink, W)
    for line in spec.get("extra", []):
        y = centered(d, line, y + 6, font(SANS, 34), ink, W)
    # health warning block near the bottom
    ws = spec.get("warn_size", 23)
    head_font = font(SANS_B if spec.get("heading_bold", True) else SANS, ws)
    body_font = font(SANS, ws)
    runs = [(spec.get("heading", WARNING_HEAD), head_font)] + [(w, body_font) for w in spec.get("body", WARNING_BODY).split()]
    wrapped_runs(d, runs, 110, 1230, W - 220, int(ws * 1.5))
    if degrade:
        img = degrade_image(img, **degrade)
    img.save(path)

def degrade_image(img, rotate=0, blur=0, glare=False, noise=0, scale=1.0, jpeg=None):
    bg = img.getpixel((5, 5))
    if rotate:
        img = img.rotate(rotate, resample=Image.BICUBIC, expand=True, fillcolor=(90, 80, 70))
    if glare:
        w, h = img.size
        g = Image.new("L", (w, h), 0)
        gd = ImageDraw.Draw(g)
        cx, cy = int(w * 0.62), int(h * 0.30)
        for r in range(380, 0, -8):
            gd.ellipse([cx - r, cy - r * 0.6, cx + r, cy + r * 0.6], fill=int(190 * (1 - r / 380) ** 1.2))
        img = Image.composite(Image.new("RGB", (w, h), (255, 255, 255)), img, g)
    if scale != 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.BILINEAR)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        random.seed(3)
        px = img.load()
        for _ in range(img.width * img.height // 6):
            x, y = random.randrange(img.width), random.randrange(img.height)
            r, g_, b = px[x, y]
            n = random.randint(-noise, noise)
            px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g_ + n)), max(0, min(255, b + n)))
    return img

# (filename, beverage_type, application fields, label spec, degrade)
SAMPLES = [
    ("old-tom-distillery.png", "spirits",
     dict(brand="Old Tom Distillery", cls="Kentucky Straight Bourbon Whiskey", abv="45% Alc./Vol. (90 Proof)", net="750 mL",
          producer="Distilled and bottled by Old Tom Distillery, Bardstown, Kentucky", country=""),
     dict(brand="OLD TOM|DISTILLERY", **{"class": "Kentucky Straight Bourbon Whiskey"}, abv="45% Alc./Vol. (90 Proof)", net="750 mL",
          producer="Distilled and bottled by|Old Tom Distillery, Bardstown, Kentucky"), None),
    ("stones-throw-ipa.png", "beer",
     dict(brand="Stone's Throw", cls="India Pale Ale", abv="5.5% Alc./Vol.", net="12 fl. oz. (355 mL)",
          producer="Brewed and packaged by Stone's Throw Brewing Co., Asheville, North Carolina", country="",),
     dict(brand="STONE'S THROW", **{"class": "India Pale Ale"}, abv="5.5% Alc./Vol.", net="12 FL OZ (355 mL)",
          producer="Brewed and packaged by|Stone's Throw Brewing Co., Asheville, North Carolina", paper=(226, 236, 226)), None),
    ("harbor-point-cabernet.png", "wine",
     dict(brand="Harbor Point Cellars", cls="Cabernet Sauvignon", abv="13.5% Alc. by Vol.", net="750 mL",
          producer="Produced and bottled by Harbor Point Cellars, Napa, California", country=""),
     dict(brand="Harbor Point|Cellars", **{"class": "Cabernet Sauvignon"}, abv="13.5% Alc. by Vol.", net="750 mL",
          producer="Produced and bottled by|Harbor Point Cellars, Napa, California", extra=["Contains sulfites"], paper=(238, 228, 232)), None),
    ("chateau-belmont.png", "wine",
     dict(brand="Chateau Belmont", cls="Bordeaux Rouge", abv="12.5%", net="750 mL",
          producer="Imported by Vine & Coast Imports, Charleston, South Carolina", country="France"),
     dict(brand="Château|Belmont", **{"class": "Bordeaux Rouge"}, abv="12.5% Alc./Vol.", net="750 mL",
          producer="Imported by Vine & Coast Imports|Charleston, South Carolina", extra=["Product of France", "Contains sulfites"], paper=(236, 236, 226)), None),
    ("silver-creek-rye.png", "spirits",
     dict(brand="Silver Creek Rye", cls="Straight Rye Whiskey", abv="50% Alc./Vol. (100 Proof)", net="750 mL",
          producer="Distilled and bottled by Silver Creek Spirits, Louisville, Kentucky", country=""),
     dict(brand="SILVER CREEK|RYE", **{"class": "Straight Rye Whiskey"}, abv="50% Alc./Vol. (100 Proof)", net="750 mL",
          producer="Distilled and bottled by|Silver Creek Spirits, Louisville, Kentucky",
          heading="Government Warning:", heading_bold=False,
          body=WARNING_BODY.replace("may cause health problems", "can cause health problems")), None),
    ("red-fox-vodka.png", "spirits",
     dict(brand="Red Fox Vodka", cls="Vodka", abv="45% Alc./Vol. (90 Proof)", net="1 L",
          producer="Distilled and bottled by Red Fox Distilling, Portland, Oregon", country=""),
     dict(brand="RED FOX|VODKA", **{"class": "Vodka"}, abv="40% Alc./Vol. (80 Proof)", net="1 L",
          producer="Distilled and bottled by|Red Fox Distilling, Portland, Oregon", paper=(232, 238, 244)), None),
    ("pine-hollow-gin.png", "spirits",
     dict(brand="Pine Hollow Gin", cls="London Dry Gin", abv="47% Alc./Vol.", net="750 mL",
          producer="Distilled and bottled by Pine Hollow Distillers, Austin, Texas", country=""),
     dict(brand="PINE HOLLOW|GIN", **{"class": "London Dry Gin"}, abv="47% Alc./Vol.", net="750 mL",
          producer="Distilled and bottled by|Pine Hollow Distillers, Austin, Texas", heading_bold=False, paper=(228, 238, 232)), None),
    ("maple-ridge-bourbon-photo.png", "spirits",
     dict(brand="Maple Ridge Bourbon", cls="Straight Bourbon Whiskey", abv="43% Alc./Vol. (86 Proof)", net="750 mL",
          producer="Distilled and bottled by Maple Ridge Distillery, Lexington, Kentucky", country=""),
     dict(brand="MAPLE RIDGE|BOURBON", **{"class": "Straight Bourbon Whiskey"}, abv="43% Alc./Vol. (86 Proof)", net="750 mL",
          producer="Distilled and bottled by|Maple Ridge Distillery, Lexington, Kentucky"),
     dict(rotate=3, blur=1.1, glare=True, noise=8, scale=0.8)),
]

def main():
    with open(os.path.join(OUT, "batch.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["filename", "beverage_type", "brand_name", "class_type", "alcohol_content", "net_contents", "bottler", "country_of_origin"])
        for fname, btype, app, spec, deg in SAMPLES:
            make_label(os.path.join(OUT, fname), spec, deg)
            w.writerow([fname, btype, app["brand"], app["cls"], app["abv"], app["net"], app["producer"], app["country"]])
    print("wrote", len(SAMPLES), "labels and batch.csv")

if __name__ == "__main__":
    main()
