const fs = require('fs');
const path = require('path');

const files = [
  'gastos.tsx',
  'empleados.tsx',
  'vehiculos.tsx',
  'reportes.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, 'src', 'app', '(admin)', file);
  if (!fs.existsSync(filePath)) {
    console.log(`File ${file} does not exist.`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Search for Floating Action Button for Ventas
  const ventasStart = content.indexOf('{/* Floating Action Button for Ventas */}');
  
  if (ventasStart !== -1) {
    // Find the end of the last FAB which is the IA admin FAB
    const iaAdminStart = content.indexOf('{/* Floating Action Button for IA Admin (Left Side) */}', ventasStart);
    if (iaAdminStart !== -1) {
      const iaAdminEnd = content.indexOf('</TouchableOpacity>', iaAdminStart);
      if (iaAdminEnd !== -1) {
        content = content.slice(0, ventasStart) + content.slice(iaAdminEnd + 19);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Successfully removed FABs from ${file}`);
      }
    }
  } else {
    console.log(`Could not find FABs in ${file}`);
  }
});
