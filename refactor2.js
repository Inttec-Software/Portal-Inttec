const fs = require('fs');
const path = require('path');

function processFile(filePath, modalComment, modalVisibleVar) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\r\n/g, '\n');

  const returnRegex = /return \([\s]*<SafeAreaView/m;
  const match = content.match(returnRegex);
  if (!match) {
    console.log('Could not find main return in ' + filePath);
    return;
  }
  
  const safeAreaStart = match.index + match[0].indexOf('<SafeAreaView');
  const safeAreaEnd = content.indexOf('>', safeAreaStart) + 1;
  
  const modalsStartIndex = content.indexOf('      {/* Modal de Filtro de Fechas */}');
  
  if (modalsStartIndex === -1) {
    console.log('Could not find Modals start in ' + filePath);
    return;
  }

  content = content.slice(0, safeAreaEnd) + '\n        {false && <View>\n' + content.slice(safeAreaEnd);
  
  const newModalsStartIndex = content.indexOf('      {/* Modal de Filtro de Fechas */}');
  content = content.slice(0, newModalsStartIndex) + '        </View>}\n' + content.slice(newModalsStartIndex);

  const targetModalCommentIndex = content.indexOf(modalComment);
  if (targetModalCommentIndex === -1) {
    console.log('Could not find target modal ' + modalComment + ' in ' + filePath);
    return;
  }
  
  const modalTagStart = content.indexOf('<Modal', targetModalCommentIndex);
  const modalTagEnd = content.indexOf('>', modalTagStart) + 1;
  content = content.slice(0, modalTagStart) + '<View style={{ flex: 1, backgroundColor: themeColors.background }}>' + content.slice(modalTagEnd);
  
  const closingModalIndex = content.indexOf('</Modal>', modalTagStart);
  content = content.slice(0, closingModalIndex) + '</View>' + content.slice(closingModalIndex + 8);
  
  const closeBtnRegex = new RegExp(`<TouchableOpacity[^>]*onPress={[^{]*${modalVisibleVar}\\(false\\)[^}]*}[^>]*>\\s*<Ionicons name="close"[^>]*>\\s*</TouchableOpacity>`, 'g');
  content = content.replace(closeBtnRegex, '');
  
  const modalContentIndex = content.indexOf('styles.modalContent', modalTagStart);
  if (modalContentIndex !== -1) {
    const nextBracket = content.indexOf('}', modalContentIndex);
    const sliceToFix = content.slice(modalContentIndex, nextBracket);
    // Be sure to catch maxHeight as well, as reports uses maxHeight: '85%'
    const fixedSlice = sliceToFix.replace(/(maxHeight|height):\s*'[^']+'/, "height: '100%'").replace(/(maxHeight|height):\s*"[^"]+"/, 'height: "100%"');
    content = content.slice(0, modalContentIndex) + fixedSlice + content.slice(nextBracket);
  }

  // Rename the default export
  content = content.replace(/export default function AdminDashboard\(/g, 'export default function ReportesScreen(');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully processed ' + filePath);
}

processFile(path.join(__dirname, 'src/app/(admin)/reportes.tsx'), '/* MODAL 2 EXTRA: REPORTES */', 'setReportsModalVisible');
