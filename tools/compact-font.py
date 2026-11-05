"""Strict, self-contained conversion and controls for the retained font packet."""
import pathlib, json, hashlib, re, sys
here = pathlib.Path(__file__).resolve().parent.parent / 'format/tec-compact'
expected = '5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8'
sha = lambda b: hashlib.sha256(b).hexdigest()

def original(text):
    glyphs = {}
    code = None
    for line in text.splitlines():
        if not line.strip() or (line.startswith('#') and not re.fullmatch('[.#]{5}', line)):
            continue
        head = re.fullmatch('= ([0-9A-F]{2})', line)
        if head:
            code = int(head[1], 16)
            assert 32 <= code <= 127 and code not in glyphs, 'codepoint or duplicate'
            glyphs[code] = []
        else:
            assert code is not None and re.fullmatch('[.#]{5}', line), 'bad original row'
            glyphs[code].append(sum(128 >> x for x, c in enumerate(line) if c == '#'))
    encode(glyphs)
    return glyphs

def bdf(text):
    ascent = next(int(l.split()[1]) for l in text.splitlines() if l.startswith('FONT_ASCENT '))
    result = {}
    for section in text.split('STARTCHAR ')[1:]:
        lines = section.splitlines()
        code = next(int(l.split()[1]) for l in lines if l.startswith('ENCODING '))
        if not 32 <= code <= 126:
            continue
        assert code not in result, 'duplicate BDF glyph'
        w, h, ox, oy = next(tuple(map(int, l.split()[1:])) for l in lines if l.startswith('BBX '))
        start = lines.index('BITMAP') + 1
        source = lines[start:start+h]
        assert len(source) == h and all(re.fullmatch('[0-9A-Fa-f]+', row) for row in source), 'BDF rows'
        rows = [0] * 8
        for y, row in enumerate(source):
            for x in range(w):
                if int(row, 16) & (1 << (len(row)*4 - 1 - x)):
                    px, py = ox+x, ascent-1-(oy+h-1-y)
                    assert 0 <= px < 5 and 0 <= py < 8, 'selected pixel would be clipped'
                    rows[py] |= 128 >> px
        result[code] = rows
    assert set(result) == set(range(32,127)), 'missing BDF glyph'
    return result

def encode(glyphs):
    assert set(glyphs) == set(range(32,128)), '96 exact slots required'
    assert all(len(rows) == 8 for rows in glyphs.values()), 'eight rows required'
    assert all(isinstance(v, int) and 0 <= v <= 255 and not v & 7 for rows in glyphs.values() for v in rows), 'five-cell encoding'
    return bytes(v for c in range(32,128) for v in glyphs[c])

def compare(raw):
    assert len(raw) == 768 and sha(raw) == expected, 'selected pixel/order/hash differs'

def notices(text):
    for value in ['Share and enjoy.', 'Frederic Cambus', 'Redistribution and use', 'DISCLAIMER', 'original']:
        assert value.lower() in text.lower(), 'missing required notice or provenance limit'

def main(out):
    inputs = here
    manifest = json.loads((here/'input-hashes.json').read_text())
    for name, digest in manifest['fontFiles'].items():
        assert sha((inputs/name).read_bytes()) == digest, name
    old = original((inputs/'export/original-font5x7.txt').read_text())
    x11 = bdf((inputs/'preview/x11.bdf').read_text())
    spleen = bdf((inputs/'preview/spleen.bdf').read_text())
    assert all(rows[7] == 0 for rows in x11.values())
    chosen = {c:[0]+rows[:7] for c, rows in x11.items()}
    for ch in '0123456789{}Oabcdefghijklmnopqrstuvwxyz':
        chosen[ord(ch)] = spleen[ord(ch)].copy()
    for ch in 'it':
        chosen[ord(ch)] = old[ord(ch)].copy()
    for ch,x,y in [('e',3,2),('r',3,2),('t',4,5)]:
        assert chosen[ord(ch)][y] & (128 >> x)
        chosen[ord(ch)][y] &= ~(128 >> x)
    chosen[127] = old[127].copy()
    raw, previous = encode(chosen), encode(old)
    compare(raw)
    assert raw == (inputs/'export/tec-compact.bin').read_bytes()
    assert previous == (inputs/'export/original-font.bin').read_bytes()
    assert sum(a != b for a,b in zip(raw,previous)) == 427
    assert sum(chosen[c] != old[c] for c in range(32,127)) == 91
    assert all(chosen[c] == old[c] for c in [32,46,105,107,127])
    notice = (inputs/'export/NOTICES.txt').read_text()
    notices(notice)
    killed = []
    def reject(name, operation):
        try: operation()
        except (AssertionError, ValueError): killed.append(name)
        else: raise AssertionError(name + ' survived')
    reject('duplicate source slot', lambda: original((inputs/'export/original-font5x7.txt').read_text()+'\n= 20\n'+('.....\n'*8)))
    reject('missing slot', lambda: encode({c:r for c,r in chosen.items() if c!=65}))
    reject('wrong row count', lambda: encode({**chosen,65:chosen[65][:-1]}))
    reject('clipped selected pixel', lambda: encode({**chosen,65:[chosen[65][0]|4]+chosen[65][1:]}))
    reject('wrong codepoint', lambda: encode({**{c:r for c,r in chosen.items() if c!=65},128:chosen[65]}))
    reject('row orientation', lambda: compare(bytes(v for c in range(32,128) for v in reversed(chosen[c]))))
    reject('changed DEL', lambda: compare(raw[:-1]+bytes([raw[-1]^8])))
    reject('absent notices', lambda: notices(''))
    out.mkdir()
    text = '# TEC Compact. Exact retained source chain and notices accompany this file.\n'
    for c in range(32,128):
        text += '= %02X\n' % c
        text += ''.join(''.join('#' if v & (128 >> x) else '.' for x in range(5))+'\n' for v in chosen[c])
    (out/'font5x7.txt').write_text(text)
    (out/'font.bin').write_bytes(raw)
    (out/'original.bin').write_bytes(previous)
    (out/'conversion.json').write_text(json.dumps({'sha256':sha(raw),'originalSha256':sha(previous),'slots':96,'bytes':768,'changedBytes':427,'changedPrintable':91,'row7Ink':[c for c in range(32,127) if chosen[c][7]],'controls':killed},indent=2)+'\n')
if __name__ == '__main__':
    main(pathlib.Path(sys.argv[1]))
