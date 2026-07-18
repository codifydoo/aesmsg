import sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

SRC = "material-full.woff2"
OUT = "material-symbols-outlined.woff2"

NAMES = [
    "alternate_email", "arrow_forward", "chat", "check", "chevron_right",
    "code", "code_blocks", "content_copy", "dark_mode", "description",
    "devices", "enhanced_encryption", "face", "fingerprint", "forum",
    "info", "ios_share", "key", "link", "lock", "mail", "schedule",
    "search", "send", "share", "shield_lock", "timer", "timer_off",
    "verified_user", "vpn_key",
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
    names_missing = ["".join(part[0:] and part for part in ["".join(c[0] for c in seq)]) for seq in missing]
    print("ERROR: no ligature found for sequences:", missing, file=sys.stderr)
    sys.exit(1)

font.save("pruned.ttf")

# Now subset by the icon-name text. With GSUB pruned to only our 30 ligatures,
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
import os
print("size bytes:", os.path.getsize(OUT))
