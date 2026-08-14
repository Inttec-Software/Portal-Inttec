const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "src/app/(admin)/ventas.tsx");
let content = fs.readFileSync(p, "utf8");

// Define a regex that matches the header and tabs accurately.
const pattern = /\s*\{\/\*\s*Header\s*\*\/\}([\s\S]*?)      \)\}/;
const match = content.match(pattern);

if (match) {
  const fullMatch = match[0];
  const renderFn = `  const renderScreenHeader = () => (\n    <View>\n${fullMatch}\n    </View>\n  );\n\n`;
  
  content = content.replace("  return (", renderFn + "  return (");
  content = content.replace(fullMatch, "");
  
  content = content.replace(
    "{/* Step Indicator */}",
    "{renderScreenHeader()}\n          {/* Step Indicator */}"
  );
  
  content = content.replace(
    "<FlatList scrollEnabled={true} style={{ flex: 1 }}",
    "<FlatList scrollEnabled={true} style={{ flex: 1 }}\n          ListHeaderComponent={renderScreenHeader}"
  );
  
  content = content.replace(
    "<ScrollView style={{ flex: 1 }}>\\n          <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>",
    "<ScrollView style={{ flex: 1 }}>\\n          {renderScreenHeader()}\\n          <View style={{ paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>"
  );
  
  fs.writeFileSync(p, content, "utf8");
  console.log("SUCCESS MANUALLY");
} else {
  console.log("Regex not matched");
}

