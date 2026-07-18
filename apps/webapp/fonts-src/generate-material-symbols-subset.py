import os
import sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

SRC = "material-full.woff2"
OUT = "material-symbols-outlined.woff2"

# Superset of every Material Symbol used by apps/webapp. Keep this in sync with the
# icons rendered via @aesmsg/ui's MaterialIcon / the .material-symbols-outlined class.
# The first block mirrors apps/web (identity/reader/error screens reuse them); the
# second block adds the app-shell navigation icons the dashboard mockup uses.
NAMES = [
    # shared with apps/web
    "alternate_email", "arrow_forward", "chat", "check", "chevron_right",
    "code", "code_blocks", "content_copy", "dark_mode", "description",
    "devices", "enhanced_encryption", "face", "fingerprint", "forum",
    "info", "ios_share", "key", "link", "lock", "mail", "schedule",
    "search", "send", "share", "shield_lock", "timer", "timer_off",
    "verified_user", "vpn_key",
    # app-shell navigation (dashboard_aesmsg mockup) + mobile menu toggle
    "dashboard", "add_box", "group", "settings", "menu", "close",
]

font = TTFont(SRC)
cmap = font.getBestCmap()


def gname(ch):
    return cmap[ord(ch)]


wanted_seqs = {tuple(gname(c) for c in n) for n in NAMES}

# Prune every GSUB ligature subtable down to only the sequences we want.
kept_output_glyphs = set()
matched_seqs = set()
gsub = font["GSUB"].table
for lookup in gsub.LookupList.Lookup:
    for sub in lookup.SubTable:
        st = sub
        if lookup.LookupType == 7:  # Extension Substitution -> unwrap
            st = sub.ExtSubTable
        ligs = getattr(st, "ligatures", None)
        if ligs is None:
            continue
        new_ligs = {}
        for first, liglist in ligs.items():
            kept = []
            for lig in liglist:
                seq = (first,) + tuple(lig.Component)
                if seq in wanted_seqs:
                    kept.append(lig)
                    kept_output_glyphs.add(lig.LigGlyph)
                    matched_seqs.add(seq)
            if kept:
                new_ligs[first] = kept
        st.ligatures = new_ligs

missing = wanted_seqs - matched_seqs
if missing:
    print("ERROR: no ligature found for sequences:", missing, file=sys.stderr)
    sys.exit(1)

font.save("pruned.ttf")

# Now subset by the icon-name text. With GSUB pruned to only our ligatures,
# closure keeps exactly those ligatures + their letter inputs + outputs.
opts = Options()
opts.flavor = "woff2"
opts.desubroutinize = False
# keep default layout features (includes 'liga'); keep variable axes intact.
subsetter = Subsetter(options=opts)
subsetter.populate(text=" ".join(NAMES))
pruned = TTFont("pruned.ttf")
subsetter.subset(pruned)
pruned.flavor = "woff2"
pruned.save(OUT)

out = TTFont(OUT)
print("matched ligatures:", len(matched_seqs), "/", len(NAMES))
print("numGlyphs:", out["maxp"].numGlyphs)
print("axes:", [a.axisTag for a in out["fvar"].axes])
print("GSUB present:", "GSUB" in out)
print("size bytes:", os.path.getsize(OUT))
