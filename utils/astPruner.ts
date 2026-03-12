import * as ts from 'typescript';

export function extractSignatures(code: string, filePath: string): string {
  if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) {
    return code;
  }

  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true
    );

    let signatures = '';

    function visit(node: ts.Node) {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (isExported) {
        if (ts.isFunctionDeclaration(node)) {
          const name = node.name?.text || 'anonymous';
          const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
          const type = node.type ? `: ${node.type.getText(sourceFile)}` : '';
          const asyncMod = modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
          signatures += `export ${asyncMod}function ${name}(${params})${type};\n`;
        } else if (ts.isClassDeclaration(node)) {
          const name = node.name?.text || 'anonymous';
          let methods = '';
          node.members.forEach(member => {
            const memberModifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
            if (ts.isMethodDeclaration(member)) {
              const isPublic = !memberModifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword);
              if (isPublic) {
                const memberName = member.name.getText(sourceFile);
                const params = member.parameters.map(p => p.getText(sourceFile)).join(', ');
                const type = member.type ? `: ${member.type.getText(sourceFile)}` : '';
                methods += `  ${memberName}(${params})${type};\n`;
              }
            } else if (ts.isPropertyDeclaration(member)) {
               const isPublic = !memberModifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword);
               if (isPublic) {
                 const memberName = member.name.getText(sourceFile);
                 const type = member.type ? `: ${member.type.getText(sourceFile)}` : '';
                 methods += `  ${memberName}${type};\n`;
               }
            }
          });
          signatures += `export class ${name} {\n${methods}}\n`;
        } else if (ts.isInterfaceDeclaration(node)) {
          signatures += `${node.getText(sourceFile)}\n`;
        } else if (ts.isTypeAliasDeclaration(node)) {
          signatures += `${node.getText(sourceFile)}\n`;
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach(decl => {
            const name = decl.name.getText(sourceFile);
            if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
              const params = decl.initializer.parameters.map(p => p.getText(sourceFile)).join(', ');
              const type = decl.initializer.type ? `: ${decl.initializer.type.getText(sourceFile)}` : '';
              signatures += `export const ${name} = (${params})${type} => { /* ... */ };\n`;
            } else {
              const type = decl.type ? `: ${decl.type.getText(sourceFile)}` : '';
              signatures += `export const ${name}${type};\n`;
            }
          });
        } else if (ts.isEnumDeclaration(node)) {
          signatures += `${node.getText(sourceFile)}\n`;
        }
      }
    }

    ts.forEachChild(sourceFile, visit);

    return signatures.trim() || '// No exported signatures found';
  } catch (e) {
    console.error(`Error parsing AST for ${filePath}:`, e);
    return code; // Fallback to full code if parsing fails
  }
}
