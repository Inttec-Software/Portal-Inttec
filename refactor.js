const fs = require('fs');
const path = require('path');

function processFile(filePath, modalComment, modalVisibleVar) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Normalize newlines to \n to avoid issues
  content = content.replace(/\r\n/g, '\n');

  // 1. Hide the Gastos UI by wrapping it in {false && ( ... )}
  
  // Find the main return
  const returnRegex = /return \([\s]*<SafeAreaView/m;
  const match = content.match(returnRegex);
  if (!match) {
    console.log('Could not find main return in ' + filePath);
    return;
  }
  
  const safeAreaStart = match.index + match[0].indexOf('<SafeAreaView');
  const safeAreaEnd = content.indexOf('>', safeAreaStart) + 1;
  
  // Find where the Modals start (usually around DateFilter Modal or Personal Modal)
  const modalsStartIndex = content.indexOf('      {/* Modal de Filtro de Fechas */}');
  
  if (modalsStartIndex === -1) {
    console.log('Could not find Modals start in ' + filePath);
    return;
  }

  // Insert {false && <View> after SafeAreaView opens
  content = content.slice(0, safeAreaEnd) + '\n        {false && <View>\n' + content.slice(safeAreaEnd);
  
  // Re-find the modals start because string shifted
  const newModalsStartIndex = content.indexOf('      {/* Modal de Filtro de Fechas */}');
  
  // Close the false block right before modals
  content = content.slice(0, newModalsStartIndex) + '        </View>}\n' + content.slice(newModalsStartIndex);


  // 2. Un-modal the target modal (Personal or Vehiculos)
  const targetModalCommentIndex = content.indexOf(modalComment);
  if (targetModalCommentIndex === -1) {
    console.log('Could not find target modal ' + modalComment + ' in ' + filePath);
    return;
  }
  
  // Find the <Modal tag after the comment
  const modalTagStart = content.indexOf('<Modal', targetModalCommentIndex);
  const modalTagEnd = content.indexOf('>', modalTagStart) + 1;
  
  // Replace the <Modal ... > with <View style={{ flex: 1, backgroundColor: themeColors.background }}>
  content = content.slice(0, modalTagStart) + '<View style={{ flex: 1, backgroundColor: themeColors.background }}>' + content.slice(modalTagEnd);
  
  // Find the closing </Modal> for this specific modal
  const closingModalIndex = content.indexOf('</Modal>', modalTagStart);
  content = content.slice(0, closingModalIndex) + '</View>' + content.slice(closingModalIndex + 8);
  
  // 3. Remove the close button from the header of the un-modalized screen
  const closeBtnRegex = new RegExp(`<TouchableOpacity[^>]*onPress={[^{]*${modalVisibleVar}\\(false\\)[^}]*}[^>]*>\\s*<Ionicons name="close"[^>]*>\\s*</TouchableOpacity>`, 'g');
  content = content.replace(closeBtnRegex, '');
  
  // 4. Change height: '85%' or '90%' to '100%' for modalContent
  const modalContentIndex = content.indexOf('styles.modalContent', modalTagStart);
  if (modalContentIndex !== -1) {
    const nextBracket = content.indexOf('}', modalContentIndex);
    const sliceToFix = content.slice(modalContentIndex, nextBracket);
    const fixedSlice = sliceToFix.replace(/height:\s*'[^']+'/, "height: '100%'").replace(/height:\s*"[^"]+"/, 'height: "100%"');
    content = content.slice(0, modalContentIndex) + fixedSlice + content.slice(nextBracket);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully processed ' + filePath);
}

// Process Empleados
processFile(path.join(__dirname, 'src/app/(admin)/empleados.tsx'), '/* MODAL 1 EXTRA: PERSONAL MANAGER */', 'setPersonalModalVisible');

// Process Vehiculos
processFile(path.join(__dirname, 'src/app/(admin)/vehiculos.tsx'), '/* MODAL 5: VEHICULOS MANAGER */', 'setVehiculosManagerModalVisible');

