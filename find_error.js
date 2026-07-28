const fs = require('fs');
const code = fs.readFileSync('src/app/(admin)/formulario.tsx', 'utf8');

// Using Babel to parse and get error line precisely
try {
  const parser = require('@babel/parser');
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log("No syntax error found by babel parser.");
} catch (e) {
  console.error("Babel parser error:", e.message, "at line:", e.loc?.line, "col:", e.loc?.column);
}
