const fs = require('fs');
const path = require('path');

const files = [
  'empleados.tsx',
  'gastos.tsx',
  'reportes.tsx',
  'vehiculos.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, 'src', 'app', '(admin)', file);
  if (!fs.existsSync(filePath)) {
    console.log(`File ${file} does not exist.`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Find the start of the Header
  const headerStart = content.indexOf('      {/* Header */}');
  if (headerStart === -1) {
    console.log(`Could not find header in ${file}`);
    return;
  }

  // Find the end of the Header by looking for the next major block
  const headerEndStr1 = '      {/* Herramientas de Desarrollo (Fuera de la cabecera) */}';
  const headerEndStr2 = '      {/* Switch de Empresa - Fila Dedicada */}';

  let headerEnd = content.indexOf(headerEndStr1, headerStart);
  if (headerEnd === -1) {
    headerEnd = content.indexOf(headerEndStr2, headerStart);
  }

  if (headerEnd !== -1) {
    content = content.slice(0, headerStart) + content.slice(headerEnd);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Successfully removed header from ${file}`);
  } else {
    console.log(`Could not find end of header in ${file}`);
  }
});
