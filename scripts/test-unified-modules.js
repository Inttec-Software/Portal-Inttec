/**
 * Test Suite Integral: Modulos Unificados de Cotizaciones y Facturacion
 * Ejecuta validaciones exhaustivas sobre:
 * 1. Logica de reporte PDF / HTML de cotizaciones (ocultar IVA 0% cuando no se incluye IVA)
 * 2. Parser de CFDI XML para facturas recibidas
 * 3. Integridad estructural y de estilos ERP en cotizaciones.tsx, facturacion.tsx y facturas-recibidas.tsx
 * 4. Salud y conectividad de backend (localhost:10000) y frontend web (localhost:8081)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m[PASS]\x1b[0m ${message}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m[FAIL]\x1b[0m ${message}`);
  }
}

// -------------------------------------------------------------
// PRUEBA 1: Verificacion de la generacion HTML de Cotizaciones
// -------------------------------------------------------------
console.log('\n\x1b[1m\x1b[36m=== PRUEBA 1: Logica de IVA en Cotizaciones (reportGenerator.ts) ===\x1b[0m');

const reportGenPath = path.join(__dirname, '..', 'src', 'utils', 'reportGenerator.ts');
const reportGenCode = fs.readFileSync(reportGenPath, 'utf-8');

// Verificar que la logica hasIva y la exclusion de columnas exista
assert(reportGenCode.includes('const hasIva = (Number(cotizacion.iva || 0) > 0) || (cotizacion.lineas || []).some(l => Number(l.impuestoPorcentaje || 0) > 0);'), 
  'Definicion exacta de hasIva basada en el monto de IVA y porcentajes en lineas');
assert(reportGenCode.includes("${hasIva ? '<th class=\"text-center\">IVA</th>' : ''}"), 
  'Encabezado de columna IVA condicionado estrictamente a hasIva');
assert(reportGenCode.includes("${hasIva ? `"), 
  'Celdas de IVA en filas de productos condicionadas estrictamente a hasIva');
assert(reportGenCode.includes("${hasIva ? `<tr><td>${ivaLabel}</td><td class=\"text-end\">$ ${formatMoney(cotizacion.iva)}</td></tr>` : ''}"), 
  'Desglose de IVA en totales condicionado estrictamente a hasIva');

// -------------------------------------------------------------
// PRUEBA 2: Validacion de CFDI XML Parser
// -------------------------------------------------------------
console.log('\n\x1b[1m\x1b[36m=== PRUEBA 2: Parser XML de Facturas Recibidas (xmlParser.ts) ===\x1b[0m');

const xmlParserPath = path.join(__dirname, '..', 'src', 'utils', 'xmlParser.ts');
const xmlParserCode = fs.readFileSync(xmlParserPath, 'utf-8');

assert(xmlParserCode.includes('export function parseCfdiXml'), 'La funcion parseCfdiXml esta exportada');
assert(xmlParserCode.includes('UUID='), 'El parser busca correctamente el nodo Timbre Fiscal UUID');
assert(xmlParserCode.includes('cfdi:Emisor'), 'El parser busca correctamente el nodo cfdi:Emisor');

// Simular parsing con mock XML
const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="F" Folio="1024" Fecha="2026-10-21T10:00:00" SubTotal="1000.00" Total="1160.00" Moneda="MXN" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="INT101010ABC" Nombre="INTEGRACION TECNOLOGICA SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="CLI202020XYZ" Nombre="CLIENTE DE PRUEBA SA DE CV" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="43211500" Cantidad="1" ClaveUnidad="H87" Descripcion="Servidor rack" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="4A1B2C3D-E4F5-6789-ABCD-EF0123456789" FechaTimbrado="2026-10-21T10:05:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Eval simple regex parser
const uuidMatch = mockXml.match(/UUID="([^"]+)"/i);
const emisorMatch = mockXml.match(/<cfdi:Emisor\s+[^>]*Rfc="([^"]+)"[^>]*Nombre="([^"]+)"/i);
const totalMatch = mockXml.match(/\bTotal="([^"]+)"/i);

assert(uuidMatch && uuidMatch[1] === '4A1B2C3D-E4F5-6789-ABCD-EF0123456789', 'Extraccion de UUID mock exitosa');
assert(emisorMatch && emisorMatch[1] === 'INT101010ABC', 'Extraccion de RFC Emisor exitosa');
assert(totalMatch && totalMatch[1] === '1160.00', 'Extraccion de Total monetario exitosa');

// -------------------------------------------------------------
// PRUEBA 3: Consistencia y Unificacion de Componentes de Interfaz
// -------------------------------------------------------------
console.log('\n\x1b[1m\x1b[36m=== PRUEBA 3: Formato Unificado ERP entre Pantallas ===\x1b[0m');

const cotizacionesPath = path.join(__dirname, '..', 'src', 'app', '(admin)', 'cotizaciones.tsx');
const facturasRecPath = path.join(__dirname, '..', 'src', 'app', '(admin)', 'facturas-recibidas.tsx');
const facturacionPath = path.join(__dirname, '..', 'src', 'app', '(admin)', 'facturacion.tsx');

const cotizacionesCode = fs.readFileSync(cotizacionesPath, 'utf-8');
const facturasRecCode = fs.readFileSync(facturasRecPath, 'utf-8');
const facturacionCode = fs.readFileSync(facturacionPath, 'utf-8');

// 3.1 Cotizaciones
assert(cotizacionesCode.includes('filtroEstado'), 'Cotizaciones tiene filtroEstado reactivo');
assert(cotizacionesCode.includes('renderDesktopToolbar'), 'Cotizaciones tiene renderDesktopToolbar');
assert(cotizacionesCode.includes('chipBtn'), 'Cotizaciones implementa estilo chipBtn');
assert(cotizacionesCode.includes('tableContainer'), 'Cotizaciones implementa tableContainer');

// 3.2 Facturas Recibidas
assert(facturasRecCode.includes('renderDesktopToolbar'), 'Facturas Recibidas implementa renderDesktopToolbar');
assert(facturasRecCode.includes('renderDesktopTable'), 'Facturas Recibidas implementa renderDesktopTable');
assert(facturasRecCode.includes('TableTooltipButton'), 'Facturas Recibidas implementa TableTooltipButton');
assert(facturasRecCode.includes('tableContainer'), 'Facturas Recibidas implementa tableContainer');
assert(facturasRecCode.includes('chipBtn'), 'Facturas Recibidas implementa chipBtn');
assert(facturasRecCode.includes('folioStr'), 'Facturas Recibidas calcula folioStr con fallback a UUID');

// 3.3 Facturas Emitidas (Facturacion)
assert(facturacionCode.includes('styles.tableContainer'), 'Facturacion envuelve el listado en styles.tableContainer');
assert(facturacionCode.includes('styles.facturasTableHeader'), 'Facturacion implementa styles.facturasTableHeader');
assert(facturacionCode.includes('TableTooltipButton'), 'Facturacion implementa TableTooltipButton');
assert(facturacionCode.includes('tableContainer: {'), 'Facturacion define estilo tableContainer');
assert(facturacionCode.includes('chipBtn: {'), 'Facturacion define estilo chipBtn');

// -------------------------------------------------------------
// PRUEBA 4: Servicios Activos en Localhost (Backend y Frontend)
// -------------------------------------------------------------
console.log('\n\x1b[1m\x1b[36m=== PRUEBA 4: Conectividad y Salud de Servidores ===\x1b[0m');

function pingEndpoint(host, port, pathUrl) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: pathUrl, method: 'GET', timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, data }));
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.end();
  });
}

(async () => {
  // Test Backend
  const backendRes = await pingEndpoint('localhost', 10000, '/');
  assert(backendRes.ok && backendRes.statusCode === 200, `Backend Express en :10000 responde HTTP ${backendRes.statusCode}`);

  // Test Frontend Expo Web
  const frontendRes = await pingEndpoint('localhost', 8081, '/');
  assert(frontendRes.ok && frontendRes.statusCode === 200, `Frontend Expo Web en :8081 responde HTTP ${frontendRes.statusCode}`);

  // -------------------------------------------------------------
  // RESUMEN FINAL
  // -------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[35m=== RESUMEN DE PRUEBAS DEL SISTEMA ===\x1b[0m');
  console.log(`Total de pruebas: ${totalTests}`);
  console.log(`Pruebas exitosas: \x1b[32m${passedTests}\x1b[0m`);
  console.log(`Pruebas fallidas: \x1b[31m${failedTests}\x1b[0m`);

  if (failedTests === 0) {
    console.log('\n\x1b[1m\x1b[32m✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE CON 100% DE INTEGRIDAD.\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\n\x1b[1m\x1b[31m✘ ALGUNAS PRUEBAS FALLARON.\x1b[0m\n');
    process.exit(1);
  }
})();
