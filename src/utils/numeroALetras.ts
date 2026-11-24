/**
 * Convierte un monto numérico y una moneda (MXN, USD, EUR) a su representación
 * en letras en español en formato comercial mexicano.
 *
 * Ejemplos:
 *  - numeroALetras(564.34, 'USD') -> "QUINIENTOS SESENTA Y CUATRO DOLARES 34/100 USD"
 *  - numeroALetras(1250.5, 'MXN') -> "UN MIL DOSCIENTOS CINCUENTA PESOS 50/100 M.N."
 */

const UNIDADES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUN',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];

const DECENAS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function convertirGrupo(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  let texto = '';

  if (centena > 0) {
    texto += CENTENAS[centena];
    if (resto > 0) texto += ' ';
  }

  if (resto > 0) {
    if (resto < 30) {
      texto += UNIDADES[resto];
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      texto += DECENAS[decena];
      if (unidad > 0) {
        texto += ` Y ${UNIDADES[unidad]}`;
      }
    }
  }

  return texto;
}

function convertirEntero(num: number): string {
  if (num === 0) return 'CERO';

  const millones = Math.floor(num / 1_000_000);
  const restoMillones = num % 1_000_000;
  const miles = Math.floor(restoMillones / 1_000);
  const unidades = restoMillones % 1_000;

  const partes: string[] = [];

  if (millones > 0) {
    if (millones === 1) {
      partes.push('UN MILLON');
    } else {
      partes.push(`${convertirEntero(millones)} MILLONES`);
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      partes.push('UN MIL');
    } else {
      partes.push(`${convertirGrupo(miles)} MIL`);
    }
  }

  if (unidades > 0) {
    partes.push(convertirGrupo(unidades));
  }

  return partes.join(' ').trim();
}

export function getMonedaDisplayName(moneda?: string): string {
  const code = (moneda || 'MXN').toUpperCase().trim();
  switch (code) {
    case 'USD':
      return 'Dólar estadounidense (USD)';
    case 'EUR':
      return 'Euro (EUR)';
    case 'MXN':
    default:
      return 'Peso mexicano (MXN)';
  }
}

export function numeroALetras(monto: number, moneda: string = 'MXN'): string {
  const num = Number(monto);
  const safeVal = isNaN(num) || num < 0 ? 0 : num;
  const entero = Math.floor(safeVal);
  const centavos = Math.round((safeVal - entero) * 100);
  const centavosStr = String(centavos === 100 ? 0 : centavos).padStart(2, '0');
  const enteroFinal = centavos === 100 ? entero + 1 : entero;

  const letras = convertirEntero(enteroFinal);
  const code = (moneda || 'MXN').toUpperCase().trim();

  let singular = 'PESO';
  let plural = 'PESOS';
  let sufijo = 'M.N.';

  if (code === 'USD') {
    singular = 'DOLAR';
    plural = 'DOLARES';
    sufijo = 'USD';
  } else if (code === 'EUR') {
    singular = 'EURO';
    plural = 'EUROS';
    sufijo = 'EUR';
  }

  const dePrefix = enteroFinal > 0 && enteroFinal % 1_000_000 === 0 ? 'DE ' : '';
  const nombreMoneda = enteroFinal === 1 ? singular : plural;

  return `${letras} ${dePrefix}${nombreMoneda} ${centavosStr}/100 ${sufijo}`.replace(/\s+/g, ' ').trim();
}
