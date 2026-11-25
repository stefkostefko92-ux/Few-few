import json, subprocess, sys
# Сглобява по една висока снимка на продукт и устройство от екраните, заснети от capture.mjs
# (ffmpeg crop + vstack). Пуска се от папката, в която capture.mjs е писал (пътищата са в лога).
for line in open(sys.argv[1], encoding='utf-8'):
    if not line.startswith('SEGS '): continue
    d = json.loads(line[5:]); dpr = d['dpr']; step = d['step']; vh = d['vh']
    ins, filt, labels = [], [], []
    for i, sg in enumerate(d['segs']):
        ins += ['-i', sg['f']]
        off = max(0, sg['off']); hh = min(step, vh - off)
        if hh <= 0: continue
        filt.append(f"[{i}:v]crop=iw:{int(hh*dpr)}:0:{int(off*dpr)}[s{i}]"); labels.append(f"[s{i}]")
    out = f"shots/{d['id']}-{d['kind']}.jpg"
    fc = ';'.join(filt) + ';' + ''.join(labels) + f"vstack=inputs={len(labels)}[t];[t]crop=iw:min(ih\\,{int(d['h']*dpr)}):0:0"
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y'] + ins + ['-filter_complex', fc, '-frames:v', '1', '-q:v', '3', out], check=True)
    print('stitched', out)
