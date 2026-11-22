import sys, pathlib

CP1252 = {i: bytes([i]).decode('cp1252') for i in range(0x80, 0x100)
          if i not in (0x81, 0x8D, 0x8F, 0x90, 0x9D)}

def decode_mixed(raw: bytes) -> str:
    out, i, n = [], 0, len(raw)
    while i < n:
        b = raw[i]
        if b < 0x80:
            out.append(chr(b)); i += 1; continue
        # tentative UTF-8 sequence
        for ln in (4, 3, 2):
            chunk = raw[i:i+ln]
            if len(chunk) == ln:
                try:
                    out.append(chunk.decode('utf-8')); i += ln; break
                except UnicodeDecodeError:
                    pass
        else:
            if b in CP1252:
                out.append(CP1252[b])
            else:
                out.append('\ufffd')
            i += 1
    return ''.join(out)

p = pathlib.Path(sys.argv[1])
raw = p.read_bytes()
try:
    raw.decode('utf-8')
    print('already utf-8', p); sys.exit(0)
except UnicodeDecodeError:
    pass
text = decode_mixed(raw)
p.write_text(text, encoding='utf-8', newline='')
print('converted', p, 'chars', len(text), 'replacement', text.count('\ufffd'))
