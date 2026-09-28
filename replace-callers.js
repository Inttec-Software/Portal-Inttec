const fs = require('fs');
const path = require('path');

const files = [
  'src/app/(admin)/empleados.tsx',
  'src/app/(admin)/gastos.tsx',
  'src/app/(admin)/vehiculos.tsx',
  'src/app/(admin)/reportes.tsx',
  'src/app/(admin)/inventario.tsx',
  'src/utils/reportGenerator.ts'
];

for (const file of files) {
  const absolutePath = path.join(__dirname, file);
  if (!fs.existsSync(absolutePath)) continue;
  
  let content = fs.readFileSync(absolutePath, 'utf-8');
  
  content = content.replace(/exportToCSV/g, 'exportToXLSX');
  content = content.replace(/exportMovimientosToCSV/g, 'exportMovimientosToXLSX');
  content = content.replace(/exportGasolinaToCSV/g, 'exportGasolinaToXLSX');
  content = content.replace(/exportAsistenciasToCSV/g, 'exportAsistenciasToXLSX');
  content = content.replace(/exportInventarioToCSV/g, 'exportInventarioToXLSX');
  content = content.replace(/exportConsumosToCSV/g, 'exportConsumosToXLSX');
  content = content.replace(/exportRetirosToCSV/g, 'exportRetirosToXLSX');
  content = content.replace(/exportVentasToCSV/g, 'exportVentasToXLSX');
  
  content = content.replace(/\.csv'/g, '.xlsx\'');
  content = content.replace(/\.csv`/g, '.xlsx`');
  content = content.replace(/\.csv"/g, '.xlsx"');
  
  fs.writeFileSync(absolutePath, content);
  console.log(`Updated ${file}`);
}
