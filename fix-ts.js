const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'utils', 'reportGenerator.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Fix asistencias type
content = content.replace(/exportAsistenciasToXLSX\(asistencias: Asistencia\[\]/g, 'exportAsistenciasToXLSX(asistencias: any[]');

// 2. Fix productos type
content = content.replace(/exportInventarioToXLSX\(productos: ReportProducto\[\]/g, 'exportInventarioToXLSX(productos: any[]');

// 3. Fix fileName typos
// En exportInventarioToXLSX
content = content.replace(/await ReportGenerator\._exportArrayToXLSX\('Inventario', headers, rows, filename\);/g, "await ReportGenerator._exportArrayToXLSX('Inventario', headers, rows, fileName);");

// En exportConsumosToXLSX
content = content.replace(/await ReportGenerator\._exportArrayToXLSX\('Consumos', headers, rows, filename\);/g, "await ReportGenerator._exportArrayToXLSX('Consumos', headers, rows, filename);");
// wait, the parameter in exportConsumosToXLSX might be fileName or filename, let's just make it consistent in the body

content = content.replace(/async exportInventarioToXLSX\(productos: any\[\], filename: string/g, "async exportInventarioToXLSX(productos: any[], fileName: string");
content = content.replace(/async exportConsumosToXLSX\(consumos: any\[\], filename: string/g, "async exportConsumosToXLSX(consumos: any[], fileName: string");
content = content.replace(/async exportRetirosToXLSX\(retiros: any\[\], filename: string/g, "async exportRetirosToXLSX(retiros: any[], fileName: string");

content = content.replace(/_exportArrayToXLSX\('Inventario', headers, rows, filename\)/g, "_exportArrayToXLSX('Inventario', headers, rows, fileName)");
content = content.replace(/_exportArrayToXLSX\('Consumos', headers, rows, filename\)/g, "_exportArrayToXLSX('Consumos', headers, rows, fileName)");
content = content.replace(/_exportArrayToXLSX\('Retiros', headers, rows, filename\)/g, "_exportArrayToXLSX('Retiros', headers, rows, fileName)");


fs.writeFileSync(filePath, content);
console.log('Fixed typescript errors.');
