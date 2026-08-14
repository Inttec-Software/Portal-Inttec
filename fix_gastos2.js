const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "src/app/(admin)/gastos.tsx");
let content = fs.readFileSync(p, "utf8");
let lines = content.split(/\r?\n/);

const headerStartIdx = lines.findIndex(l => l.includes("{/* Switch de Empresa - Fila Dedicada */}"));
let tabsEndIdx = -1;
for (let i = headerStartIdx; i < headerStartIdx + 250; i++) {
  if (lines[i] && lines[i].includes("</View>")) {
    if (lines[i+2] && lines[i+2].includes("Contents based on tab")) {
      tabsEndIdx = i;
      break;
    }
  }
}

const returnIdx = lines.findIndex(l => l.trim() === "return (");

let mobilePendientesLine = lines.findIndex((l, idx) => l.includes("<FlatList scrollEnabled={false}") && lines[idx+1] && lines[idx+1].includes("pendingGastos"));
let desktopHistorialLine = -1;
for (let i = mobilePendientesLine; i < lines.length; i++) {
  if (lines[i].includes("<ScrollView style={{ flex: 1 }}>")) {
    desktopHistorialLine = i;
    break;
  }
}
let mobileHistorialLine = -1;
for (let i = desktopHistorialLine; i < lines.length; i++) {
  if (lines[i] && lines[i].includes("<FlatList scrollEnabled={false}")) {
    mobileHistorialLine = i;
    break;
  }
}

let endScrollIdx = -1;
let depth = 0;
for (let i = returnIdx + 2; i < lines.length; i++) {
  if (lines[i].includes("<ScrollView")) depth++;
  if (lines[i].includes("</ScrollView>")) {
    if (depth === 0) {
      endScrollIdx = i;
      break;
    }
    depth--;
  }
}

if (headerStartIdx > -1 && tabsEndIdx > -1) {
  let headerBlockStr = lines.slice(headerStartIdx, tabsEndIdx + 1).join("\n");
  const renderFn = `  const renderScreenHeader = () => (\n    <View>\n` + headerBlockStr + `\n    </View>\n  );\n`;
  
  let newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    if (i === returnIdx) {
      newLines.push(...renderFn.split("\n"));
      newLines.push(lines[i]);
    } else if (i === returnIdx + 2 && lines[i].includes("<ScrollView style={{ flex: 1 }}")) {
      newLines.push(`      <View style={{ flex: 1 }}>`);
    } else if (i >= headerStartIdx && i <= tabsEndIdx) {
      // omit header lines
    } else if (i === mobilePendientesLine) {
      newLines.push(`              <FlatList scrollEnabled={true} style={{ flex: 1 }}`);
      newLines.push(`                ListHeaderComponent={renderScreenHeader}`);
    } else if (i === desktopHistorialLine) {
      newLines.push(lines[i]);
      newLines.push(`                  {renderScreenHeader()}`);
    } else if (i === mobileHistorialLine) {
      newLines.push(`              <FlatList scrollEnabled={true} style={{ flex: 1 }}`);
      newLines.push(`                ListHeaderComponent={renderScreenHeader}`);
    } else if (i === endScrollIdx) {
      newLines.push(`      </View>`);
    } else {
      newLines.push(lines[i]);
    }
  }
  
  // also add {renderScreenHeader()} to desktop pendientes
  let dpLine = newLines.findIndex(l => l.includes("/* REVISAR PENDIENTES */"));
  if (dpLine > -1) {
     for (let i = dpLine; i < dpLine + 10; i++) {
       if (newLines[i].includes("<ScrollView style={{ flex: 1 }}>")) {
         newLines.splice(i + 1, 0, "                {renderScreenHeader()}");
         break;
       }
     }
  }
  
  fs.writeFileSync(p, newLines.join("\n"), "utf8");
  console.log("SUCCESSFULLY UPDATED GASTOS.TSX!");
} else {
  console.log("FAILED to find bounds");
}
