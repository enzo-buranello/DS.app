// Expressions des champs numériques (« 16*2 », « (24 - 4) / 2 ») : analyse
// descendante des quatre opérations et des parenthèses. Jamais d'eval.
export function evaluate(text: string): number | null {
  const src = text.replace(/,/g, '.').replace(/\s+/g, '');
  if (!src || src.length > 64) return null;
  let i = 0;
  const peek = () => src[i];
  function number(): number | null {
    const m = /^\d*\.?\d+|^\d+\./.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }
  function factor(): number | null {
    if (peek() === '-') {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = sum();
      if (v === null || peek() !== ')') return null;
      i++;
      return v;
    }
    return number();
  }
  function product(): number | null {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const r = factor();
      if (r === null) return null;
      v = op === '*' ? v * r : r === 0 ? null : v / r;
    }
    return v;
  }
  function sum(): number | null {
    let v = product();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const r = product();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  return v !== null && i === src.length && Number.isFinite(v)
    ? Math.round(v * 1000) / 1000
    : null;
}
