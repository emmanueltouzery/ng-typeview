import {readFileSync} from "fs";
import * as ts from "typescript";
import {Set} from "immutable";

import {ScopeInfo} from "./controller-parser"

export function addScopeAccessors(input: string, scopeInfo: ScopeInfo): string {
    let sourceFile = ts.createSourceFile(
        "", input, ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return sourceFile.statements.map(stmtAddScopeAccessors(scopeInfo)).join(";\n");
}

const nodeKindPassthroughList = Set(
    [ts.SyntaxKind.NumericLiteral,
     ts.SyntaxKind.NullKeyword,
     ts.SyntaxKind.StringLiteral]);

function stmtAddScopeAccessors(scopeInfo: ScopeInfo) : (node: ts.Node) => string {
    return node => {
        if (node.kind === ts.SyntaxKind.ExpressionStatement) {
            return stmtAddScopeAccessors(scopeInfo)((<ts.ExpressionStatement>node).expression);
        } else if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const prop = <ts.PropertyAccessExpression>node;
            return stmtAddScopeAccessors(scopeInfo)(prop.expression) + "." + prop.name.getText();
        } else if (node.kind === ts.SyntaxKind.Identifier) {
            return addScopePrefixIfNeeded(scopeInfo, node.getText());
        } else if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
            const op = <ts.PrefixUnaryExpression>node;
            return ts.tokenToString(op.operator) + stmtAddScopeAccessors(scopeInfo)(op.operand);
        } else if (node.kind === ts.SyntaxKind.CallExpression) {
            const expr = <ts.CallExpression>node;
            return addScopePrefixIfNeeded(scopeInfo, expr.expression.getText()) + "(" +
                expr.arguments.map(stmtAddScopeAccessors(scopeInfo)).join(", ") + ")";
        } else if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const expr = <ts.BinaryExpression>node;
            return stmtAddScopeAccessors(scopeInfo)(expr.left)
                + " " + expr.operatorToken.getText() + " "
                + stmtAddScopeAccessors(scopeInfo)(expr.right);
        } else if (node.kind === ts.SyntaxKind.ElementAccessExpression) {
            const acc = <ts.ElementAccessExpression>node;
            const argValue = acc.argumentExpression
                ? stmtAddScopeAccessors(scopeInfo)(acc.argumentExpression)
                : "";
            return stmtAddScopeAccessors(scopeInfo)(acc.expression) +
                "["+ argValue + "]";
        } else if (nodeKindPassthroughList.contains(node.kind)) {
            return node.getText();
        }
        console.log("Add scope accessors: unhandled node: " + node.kind);
        return node.getText();
    };
}

function addScopePrefixIfNeeded(scopeInfo: ScopeInfo, expression: string): string {
    // extract the field name from the expression, which can be...
    // data.user.getName(), or getName() or things like that.
    // so we stop at the first "." or "(" to get respectively
    // "data" or "getName".
    const fieldName = expression.replace(/[\(\.].*$/, "");

    // is the field name present in the scope declaration?
    if (scopeInfo.fieldNames.indexOf(fieldName) >= 0) {
        // YES => read it from there.
        return "$scope." + expression;
    } else {
        // NO => the expression is accessed from elsewhere than the scope
        // (parent loop in the view, global namespace...)
        return expression;
    }
}
