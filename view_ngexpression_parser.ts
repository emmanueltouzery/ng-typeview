/// <reference path="typings/node/node.d.ts" />

import {readFileSync} from "fs";
import * as ts from "typescript";
import {Set} from "immutable";

function addScopeAccessors(input: string): string {
    let sourceFile = ts.createSourceFile(
        "", input, ts.ScriptTarget.ES6, /*setParentNodes */ true);
    return sourceFile.statements.map(stmtAddScopeAccessors).join(";\n");
}

const nodeKindPassthroughList = Set(
    [ts.SyntaxKind.NumericLiteral,
     ts.SyntaxKind.NullKeyword,
     ts.SyntaxKind.StringLiteral]);

function stmtAddScopeAccessors(node: ts.Node): string {
    if (node.kind === ts.SyntaxKind.ExpressionStatement) {
        return stmtAddScopeAccessors((<ts.ExpressionStatement>node).expression);
    } else if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
        const prop = <ts.PropertyAccessExpression>node;
        return stmtAddScopeAccessors(prop.expression) + "." + prop.name.getText();
    } else if (node.kind === ts.SyntaxKind.Identifier) {
        return "$scope." + node.getText();
    } else if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
        const op = <ts.PrefixUnaryExpression>node;
        return ts.tokenToString(op.operator) + stmtAddScopeAccessors(op.operand);
    } else if (node.kind === ts.SyntaxKind.CallExpression) {
        const expr = <ts.CallExpression>node;
        return "$scope." + expr.expression.getText() + "(" +
            expr.arguments.map(stmtAddScopeAccessors).join(", ") + ")";
    } else if (node.kind === ts.SyntaxKind.BinaryExpression) {
        const expr = <ts.BinaryExpression>node;
        return stmtAddScopeAccessors(expr.left)
            + " " + expr.operatorToken.getText() + " "
            + stmtAddScopeAccessors(expr.right);
    } else if (node.kind === ts.SyntaxKind.ElementAccessExpression) {
        const acc = <ts.ElementAccessExpression>node;
        return stmtAddScopeAccessors(acc.expression) + "["+ stmtAddScopeAccessors(acc.argumentExpression) + "]";
    } else if (nodeKindPassthroughList.contains(node.kind)) {
        return node.getText();
    }
    console.log("Add scope accessors: unhandled node: " + node.kind);
    return node.getText();
}

console.log(addScopeAccessors("data.value"));
console.log(addScopeAccessors("!wasProvidedWorkbook()"))
console.log(addScopeAccessors("info.subscribedEmails.length > 0"))
console.log(addScopeAccessors("movieInfo.legendEnabled && movieInfo.legend.length > 0"))
console.log(addScopeAccessors("selectedScreen.images[idx - 1] !== null"))
console.log(addScopeAccessors("selectedScreen.images[idx - 1].name"))
console.log(addScopeAccessors("getSelectedImage(selectedScreen.images[idx - 1])"))
console.log(addScopeAccessors("fType === 'test' || fType === 'test1'"))
