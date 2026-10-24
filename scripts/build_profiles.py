"""
Builds src/data/fbs/profiles.ts from the team research in docs/research/profiles_*.json, after
validating it, and prints the per-team research tables for docs/ROSTERS.md to stdout.
Run from the repo root:  python scripts/build_profiles.py > /tmp/tables.md
"""
import json, glob, os, re, sys
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.join(REPO, 'docs', 'research')
ARCH = {
    'QB': ['pocket', 'dual', 'scrambler'], 'HB': ['power', 'elusive', 'receiving'], 'FB': ['blocking'],
    'WR': ['deep', 'possession', 'slot'], 'TE': ['blocking', 'receiving'], 'OT': ['pass', 'run'], 'OG': ['pass', 'run'],
    'C': ['pass', 'run'], 'DE': ['speed', 'power'], 'DT': ['power', 'quick'], 'OLB': ['rusher', 'coverage', 'run'],
    'MLB': ['run', 'coverage'], 'CB': ['man', 'zone'], 'FS': ['coverage', 'hybrid', 'box'], 'SS': ['coverage', 'hybrid', 'box'],
    'K': ['accurate', 'power'], 'P': ['power', 'accurate'],
}
CONF_ORDER = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'American', 'Mountain West', 'Sun Belt', 'MAC', 'C-USA', 'Independent']
geo = open(os.path.join(REPO, 'src/data/fbs/geo.ts'), encoding='utf-8').read()
states = set(re.findall(r"(\w+): '[A-Z]{2}'", geo.split('export const REGION')[0]))

teams = []
for f in sorted(glob.glob(os.path.join(SP, 'profiles_*.json'))):
    teams += json.load(open(f, encoding='utf-8'))
ids = [t['id'] for t in teams]
assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
abbrs = [t['abbr'] for t in teams]
dup = {a for a in abbrs if abbrs.count(a) > 1}
problems = []
for t in teams:
    assert re.fullmatch(r'[a-z0-9]+', t['id']), t['id']
    assert t['conference'] in CONF_ORDER, (t['id'], t['conference'])
    if t['id'] not in states: problems.append('no state: ' + t['id'])
    for c in t['colors'].values(): assert re.fullmatch(r'#[0-9A-Fa-f]{6}', c), (t['id'], c)
    assert t['offense']['qbStyle'] in ('pocket', 'dual', 'runner'), t['id']
    assert t['offense']['scheme'] in ('air-raid', 'spread', 'pro', 'option', 'power-run'), t['id']
    for k, v in t['units'].items(): assert k in ('QB','RB','WR','TE','OL','DL','LB','CB','S','K','P') and -2 <= v <= 2, (t['id'], k, v)
    for s in t['standouts']:
        assert s['pos'] in ARCH, (t['id'], s)
        if s['archetype'] not in ARCH[s['pos']]:
            problems.append(f"{t['id']} {s['name']} {s['pos']} archetype {s['archetype']} -> {ARCH[s['pos']][0]}")
            s['archetype'] = ARCH[s['pos']][0]
        assert s['year'] in ('FR', 'SO', 'JR', 'SR') and s['tier'] in ('elite', 'star', 'good'), (t['id'], s)
    for k in ('off', 'def', 'st'): assert 50 <= t['target'][k] <= 97, (t['id'], k)
if dup: problems.append('duplicate abbr: ' + ', '.join(sorted(dup)))
if problems: print('\n'.join(problems), file=sys.stderr)
print(len(teams), 'teams', file=sys.stderr)

teams.sort(key=lambda t: (CONF_ORDER.index(t['conference']), t['school']))

def js(v):
    return json.dumps(v, ensure_ascii=False)

out = ["// Generated from the team research (see docs/ROSTERS.md). Edit the research, not this file by hand,",
       "// or keep hand edits small and note them in ROSTERS.md.",
       "import type { TeamProfile } from './profile';", "",
       "export const PROFILES: TeamProfile[] = ["]
for t in teams:
    so = []
    for s in t['standouts']:
        so.append("      { name: %s, pos: '%s', year: '%s', redshirt: %s, archetype: '%s', tier: '%s', note: %s }," % (
            js(s['name']), s['pos'], s['year'], 'true' if s.get('redshirt') else 'false', s['archetype'], s['tier'], js(s.get('note', ''))))
    units = ', '.join(f"{k}: {v}" for k, v in t['units'].items())
    out.append("  {")
    out.append(f"    id: '{t['id']}', school: {js(t['school'])}, mascot: {js(t['mascot'])}, abbr: {js(t['abbr'])}, conference: '{t['conference']}',")
    out.append(f"    colors: {{ primary: '{t['colors']['primary']}', secondary: '{t['colors']['secondary']}' }},")
    out.append(f"    tier: {t['tier']}, prestige: {t['prestige']}, record: {js(t.get('record2026', ''))},")
    out.append(f"    target: {{ off: {t['target']['off']}, def: {t['target']['def']}, st: {t['target']['st']} }},")
    out.append(f"    offense: {{ qbStyle: '{t['offense']['qbStyle']}', scheme: '{t['offense']['scheme']}' }},")
    out.append(f"    units: {{ {units} }},")
    out.append("    standouts: [" + ("" if not so else ""))
    out += so
    out.append("    ],")
    out.append("  },")
out.append("];")
open(os.path.join(REPO, 'src/data/fbs/profiles.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')

# Sources and basis for the docs
md = []
for conf in CONF_ORDER:
    ts = [t for t in teams if t['conference'] == conf]
    if not ts: continue
    md.append(f"### {conf} ({len(ts)})\n")
    md.append("| Team | Record | Tier | Off / Def / ST | Basis | Sources |")
    md.append("| --- | --- | --- | --- | --- | --- |")
    for t in ts:
        src = ' '.join(f"[{i+1}]({u})" for i, u in enumerate(t.get('sources', [])))
        basis = t.get('basis', '').replace('|', '/')
        md.append(f"| {t['school']} | {t.get('record2026','')} | {t['tier']} | {t['target']['off']} / {t['target']['def']} / {t['target']['st']} | {basis} | {src} |")
    md.append("")
sys.stdout.reconfigure(encoding='utf-8')
print('\n'.join(md))
