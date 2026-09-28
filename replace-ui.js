const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      replaceInDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      
      // Update UI Text
      content = content.replace(/"Excel \(CSV\)"/g, '"Excel"');
      content = content.replace(/'Excel \(CSV\)'/g, "'Excel'");
      content = content.replace(/>CSV</g, '>Excel<');
      
      // Update error messages just in case
      content = content.replace(/'Error CSV'/g, "'Error Excel'");
      content = content.replace(/'Error CSV Asistencia'/g, "'Error Excel Asistencia'");
      content = content.replace(/'Error CSV Inventario'/g, "'Error Excel Inventario'");
      content = content.replace(/'Error CSV Consumos'/g, "'Error Excel Consumos'");
      content = content.replace(/'Error CSV Ventas'/g, "'Error Excel Ventas'");
      
      // Some variables state
      content = content.replace(/isExportingMovimientosCSV/g, 'isExportingMovimientosExcel');
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated UI texts in ${fullPath}`);
      }
    }
  }
}

replaceInDir(path.join(__dirname, 'src', 'app', '(admin)'));
