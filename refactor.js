const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'utils', 'reportGenerator.ts');
let content = fs.readFileSync(filePath, 'utf-8');

if (!content.includes("import * as XLSX from 'xlsx';")) {
  content = content.replace("import * as Sharing from 'expo-sharing';", "import * as Sharing from 'expo-sharing';\nimport * as XLSX from 'xlsx';");
}

const xlsxHelper = `
  async _exportArrayToXLSX(sheetName: string, headers: string[], rows: any[][], filename: string): Promise<void> {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    if (Platform.OS === 'web') {
      XLSX.writeFile(wb, filename);
    } else {
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = \`\${cacheDirectory}\${filename}\`;
      await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: \`Exportar \${sheetName}\` });
      } else {
        throw new Error('La función de compartir no está disponible.');
      }
    }
  },
`;

if (!content.includes("_exportArrayToXLSX")) {
  content = content.replace("async _printOrDownload", xlsxHelper + "\n  async _printOrDownload");
}

fs.writeFileSync(filePath, content);
console.log('Helpers added.');
