const ts = require('typescript');
const fs = require('fs');

const code = fs.readFileSync('src/app/(admin)/formulario.tsx', 'utf8');
const sourceFile = ts.createSourceFile('formulario.tsx', code, ts.ScriptTarget.Latest, true);

function traverse(node) {
    // Collect diagnostics? ts.createSourceFile does not produce diagnostics directly if you just parse it.
    // However, it creates a parse tree. We can just run ts.createProgram
}

const program = ts.createProgram(['src/app/(admin)/formulario.tsx'], {
    jsx: ts.JsxEmit.React,
    noEmit: true
});

const diagnostics = ts.getPreEmitDiagnostics(program);
diagnostics.forEach(diag => {
    if (diag.category === ts.DiagnosticCategory.Error) {
        if (diag.file) {
            let { line, character } = ts.getLineAndCharacterOfPosition(diag.file, diag.start);
            console.log(`${diag.file.fileName} (${line + 1},${character + 1}): ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
        } else {
            console.log(ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
        }
    }
});
