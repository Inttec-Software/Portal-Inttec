const fs = require('fs');
const lines = fs.readFileSync('src/app/(admin)/formulario.tsx', 'utf8').split('\n');
let depth = 0;
let output = [];
for(let i=0; i<lines.length; i++) {
  let line = lines[i];
  let inString = false;
  let strChar = '';
  let ignoreNext = false;
  let hasBrace = false;
  for(let j=0; j<line.length; j++) {
    let c = line[j];
    if(ignoreNext) { ignoreNext = false; continue; }
    if(c === '\\') { ignoreNext = true; continue; }
    if(inString) {
      if(c === strChar) inString = false;
    } else {
      if(c === '\'' || c === '"' || c === '`') {
        inString = true; strChar = c;
      } else if(c === '{') { depth++; hasBrace = true; }
      else if(c === '}') { depth--; hasBrace = true; }
    }
  }
  if(hasBrace) {
    output.push((i+1) + ': ' + depth + ' ' + line.trim());
  }
}
fs.writeFileSync('depth.txt', output.join('\n'));
