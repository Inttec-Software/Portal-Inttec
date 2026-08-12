const fs = require('fs');
const path = require('path');

const files = [
  'ventas.tsx',
  'gastos.tsx',
  'cotizaciones.tsx',
  'inventario.tsx',
  'empleados.tsx',
  'vehiculos.tsx',
  'reportes.tsx',
  'evidencias.tsx',
  'catalogos.tsx',
  'auditoria-tarjeta.tsx',
  'formulario.tsx',
  'chat-ia.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, 'src', 'app', '(admin)', file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // If already has scrollEnabled={false} we assume it was processed
  if (content.includes('scrollEnabled={false}')) return;

  // 1. Wrap SafeAreaView content in ScrollView
  const safeAreaMatch = content.match(/<SafeAreaView[^>]*>/);
  if (safeAreaMatch) {
    const replacement = `${safeAreaMatch[0]}\n      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">`;
    content = content.replace(safeAreaMatch[0], replacement);

    // 2. Find the last </SafeAreaView>
    const lastSafeAreaIndex = content.lastIndexOf('</SafeAreaView>');
    if (lastSafeAreaIndex !== -1) {
      content = content.slice(0, lastSafeAreaIndex) + '</ScrollView>\n    </SafeAreaView>' + content.slice(lastSafeAreaIndex + 15);
    }
  }

  // 3. Make all FlatLists not scrollable
  content = content.replace(/<FlatList/g, '<FlatList scrollEnabled={false}');

  // 4. Ensure ScrollView is imported
  if (content.includes('react-native') && !content.includes('ScrollView,')) {
    content = content.replace(/import \{([\s\S]*?)\} from 'react-native';/, "import { ScrollView, $1 } from 'react-native';");
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
});
