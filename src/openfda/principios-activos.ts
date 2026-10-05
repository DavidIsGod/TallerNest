/**
 * openFDA indexa los principios activos en inglés. Este diccionario traduce
 * los nombres en español más comunes en tratamientos crónicos de adultos
 * mayores; para el resto se aplican heurísticas (ver candidatosDeBusqueda).
 */
export const TRADUCCIONES_PRINCIPIOS: Record<string, string> = {
  'acido acetilsalicilico': 'aspirin',
  aspirina: 'aspirin',
  acetaminofen: 'acetaminophen',
  paracetamol: 'acetaminophen',
  amlodipino: 'amlodipine',
  atorvastatina: 'atorvastatin',
  carvedilol: 'carvedilol',
  clopidogrel: 'clopidogrel',
  digoxina: 'digoxin',
  enalapril: 'enalapril',
  furosemida: 'furosemide',
  glibenclamida: 'glyburide',
  hidroclorotiazida: 'hydrochlorothiazide',
  ibuprofeno: 'ibuprofen',
  insulina: 'insulin',
  levotiroxina: 'levothyroxine',
  losartan: 'losartan',
  metformina: 'metformin',
  metoprolol: 'metoprolol',
  omeprazol: 'omeprazole',
  rosuvastatina: 'rosuvastatin',
  simvastatina: 'simvastatin',
  warfarina: 'warfarin',
  sertralina: 'sertraline',
  donepezilo: 'donepezil',
  memantina: 'memantine',
  tamsulosina: 'tamsulosin',
  alendronato: 'alendronate',
  apixaban: 'apixaban',
  rivaroxaban: 'rivaroxaban',
  espironolactona: 'spironolactone',
  valsartan: 'valsartan',
  gabapentina: 'gabapentin',
  pregabalina: 'pregabalin',
  prednisona: 'prednisone',
  calcio: 'calcium',
};

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Términos a buscar en openFDA, en orden de prioridad y sin duplicados. */
export function candidatosDeBusqueda(principioActivo: string): string[] {
  const base = normalizarTexto(principioActivo);
  const candidatos = [TRADUCCIONES_PRINCIPIOS[base], base];
  // Heurística: muchos genéricos en español terminan en -a/-o (metformina → metformin).
  if (/[ao]$/.test(base)) candidatos.push(base.slice(0, -1));
  if (/ina$/.test(base)) candidatos.push(`${base.slice(0, -3)}ine`);
  return [...new Set(candidatos.filter((c): c is string => Boolean(c)))];
}
