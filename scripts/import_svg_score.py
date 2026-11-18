import xml.etree.ElementTree as ET, json
from collections import Counter
ns='{http://www.w3.org/2000/svg}'
root=ET.parse('reference/sheet.svg').getroot()
def a(e): return {k.split('}')[-1]:v for k,v in e.attrib.items()}
parent={c:p for p in root.iter() for c in p}
def in_defs(e):
    p=parent.get(e)
    while p is not None:
        if p.tag==ns+'defs': return True
        p=parent.get(p)
    return False
def f(x, default=0.0):
    try: return float(x)
    except: return default
uses=[e for e in root.iter() if e.tag==ns+'use' and not in_defs(e)]
texts=[e for e in root.iter() if e.tag==ns+'text' and not in_defs(e)]
lines=[e for e in root.iter() if e.tag==ns+'line' and not in_defs(e)]
notes=[]; bars=[]; dots=[]; highs=[]; lows=[]; yans=[]; rests=[]
for e in uses:
    at=a(e); h=at.get('href',''); x=f(at.get('x')); y=f(at.get('y'))
    if h.startswith('#yinfu_') and h not in ('#yinfu_yan','#yinfu_0'):
        notes.append({'degree':int(h.replace('#yinfu_','')),'x':x,'y':y,'id':at.get('id')})
    elif h=='#yinfu_yan': yans.append({'x':x,'y':y})
    elif h=='#yinfu_0': rests.append({'x':x,'y':y,'id':at.get('id')})
    elif h=='#xiaojiexian': bars.append({'x':x,'y':y})
    elif h=='#fudian': dots.append({'x':x,'y':y})
    elif h=='#yingao_gao': highs.append({'x':x,'y':y})
    elif h=='#yingao_di': lows.append({'x':x,'y':y})
beams=[]
for e in lines:
    at=a(e)
    if at.get('stroke')!='#475569': continue
    x1=f(at.get('x1')); x2=f(at.get('x2')); y1=f(at.get('y1')); y2=f(at.get('y2'))
    if abs(y1-y2)<0.2 and abs(x2-x1)>1:
        beams.append({'x1':min(x1,x2),'x2':max(x1,x2),'y':y1})
def level_of(o):
    levels=[]
    for b in beams:
        if b['x1']-1 <= o['x'] <= b['x2']+1 and 10 <= b['y']-o['y'] <= 40:
            levels.append(round((b['y']-o['y']-14.95)/5)+1)
    return max(levels) if levels else 0
def dot_of(o):
    return any(abs(d['x']-o['x'])<=2.5 and -2 <= d['y']-o['y'] <= 5 for d in dots)
def octave_of(o):
    hi=sum(1 for d in highs if abs(d['x']-o['x'])<=3 and -35 <= d['y']-o['y'] <= -5)
    lo=sum(1 for d in lows if abs(d['x']-o['x'])<=3 and 5 <= d['y']-o['y'] <= 35)
    return hi-lo
def yan_count(o, items):
    cnt=0
    for y in yans:
        if abs(y['y']-o['y'])>2: continue
        if y['x'] < o['x']-1: continue
        between=[p for p in items if abs(p['y']-o['y'])<=2 and o['x']+1 < p['x'] < y['x']-1]
        if not between: cnt+=1
    return cnt
def lyric_rows(sy):
    cnt=Counter(round(f(a(t).get('y')),1) for t in texts if sy+10 <= f(a(t).get('y')) <= sy+95)
    rows=[y for y,c in cnt.most_common(2) if c>=2]
    rows.sort()
    return rows
def lyric_at(note, row):
    cands=[t for t in texts if abs(f(a(t).get('y'))-row)<=1 and abs(f(a(t).get('x'))-(note['x']-10))<=14 and (t.text or '').strip()]
    if not cands: return ''
    cands.sort(key=lambda t: abs(f(a(t).get('x'))-(note['x']-10)))
    return (cands[0].text or '').strip()
ys=sorted(set(round(n['y'],1) for n in notes))
systems=[]
for sy in ys:
    sys_notes=sorted([n for n in notes if abs(n['y']-sy)<=1], key=lambda n:n['x'])
    sys_rests=sorted([n for n in rests if abs(n['y']-sy)<=1], key=lambda n:n['x'])
    sys_bars=sorted([b for b in bars if abs(b['y']-sy)<=1], key=lambda b:b['x'])
    items=[{'kind':'note',**n} for n in sys_notes]+[{'kind':'rest',**n} for n in sys_rests]
    items.sort(key=lambda o:o['x'])
    bounds=[0.0]+[b['x'] for b in sys_bars]
    if not bounds or bounds[-1] < 960: bounds.append(963.0)
    bounds=sorted(set(round(x,3) for x in bounds))
    measures=[]
    for i in range(len(bounds)-1):
        lo,hi=bounds[i],bounds[i+1]
        mitems=[o for o in items if lo-1 <= o['x'] < hi-1]
        total=0.0
        for o in mitems:
            lvl=level_of(o); base=1.0 if lvl==0 else 0.5**lvl
            d=base*(1.5 if dot_of(o) else 1.0)
            yc=yan_count(o, items); d+=yc
            o['level']=lvl; o['dotted']=dot_of(o); o['yan']=yc; o['duration']=d
            total+=d
        measures.append({'lo':lo,'hi':hi,'items':mitems,'total':total})
    rows=lyric_rows(sy)
    for o in items:
        if o['kind']=='note':
            o['octave']=octave_of(o)
            o['lyrics']=[lyric_at(o,r) for r in rows]
    systems.append({'y':sy,'measures':measures,'rows':rows})
SEMI={1:0,2:2,3:4,4:5,5:7,6:9,7:11}
TONIC_MIDI=12*(4+1)+6
out=[]; measure_index=0; failures=[]; time=0.0
for s in systems:
    for m in s['measures']:
        measure_index+=1
        measure_start=time
        for o in m['items']:
            if o['kind']=='note':
                midi=TONIC_MIDI + SEMI[o['degree']] + 12*o['octave']
                out.append({'id':f'n{len(out)}','onset':round(time,4),'duration':round(o['duration'],4),'midi':midi,'measure':measure_index,'beatInMeasure':round(time-measure_start,4),'lyrics':o['lyrics'],'degree':o['degree'],'octave':o['octave']})
            time += o['duration']
        if abs(m['total']-4.0)>0.01:
            failures.append((measure_index,s['y'],round(m['total'],3),[(o['kind'],o['degree'],round(o['x'],1),o['duration'],o['yan']) for o in m['items']]))
print('systems',len(systems),'measures',measure_index,'notes',len(out))
print('failures',len(failures))
for x in failures[:20]: print('FAIL',x)
print('first',out[:5]); print('last',out[-5:])
json.dump({'title':'起风了','tempo':75,'timeSignature':[4,4],'originalKey':{'tonic':6,'mode':'major'},'composer':'高桥优 作曲','lyricist':'米果 作词','notes':out}, open('public/songs/qifengle.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote public/songs/qifengle.json','total time',round(time,3))
