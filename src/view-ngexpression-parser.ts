import {readFileSync} from "fs";
import * as ts from "typescript";
import {Set} from "immutable";
import * as P from "parsimmon"

import {ScopeInfo} from "./controller-parser"
import {VarType} from "./ng-directives"

interface NgFilterExpression {
    expression: string;
    filterCalls: NgFilterCall[];
}

function parseNgFilterExpression(): P.Parser<NgFilterExpression> {
    return P.takeWhile(c => c !== '|').map(e => e.trim())
        .chain(expression => P.regex(/\s*\|\s*/).then(parseNgFilterCall()).many()
               .map(filterCalls => ({expression, filterCalls})))
        .skip(P.optWhitespace);
}

interface NgFilterCall {
    functionName: string;
    functionParameters: string[];
}

function parseNgFilterCall(): P.Parser<NgFilterCall> {
    return P.takeWhile(c => [' ', ':'].indexOf(c) < 0).chain(
        fName => parseNgFilterParam().many()
            .map(params => ({functionName: fName, functionParameters:params })));
}

function parseNgFilterParam() : P.Parser<string> {
    return P.regex(/\s*:\s*/).then(P.takeWhile(c => [' ',':'].indexOf(c) < 0));
}

function wrapFilterCall(soFar: string, ngFilterCall: NgFilterCall): string {
    const params = ngFilterCall.functionParameters.join(', ');
    const fnParams = params.length > 0 ? (', ' + params) : '';
    return `f__${ngFilterCall.functionName}(${soFar}${fnParams})`
}

export function filterExpressionToTypescript(
    expr: string, registerVariable:(type:VarType,val:string)=>string,
    addScAccessors: (x:string)=>string): string {
    const ngFilterExpr = parseNgFilterExpression().parse(expr);
    if (!ngFilterExpr.status) {
        console.warn("Failed parsing filter expression");
        console.warn(expr);
        console.warn(ngFilterExpr);
        return "";
    }
    if (ngFilterExpr.value.filterCalls.length === 0) {
        return registerVariable("any", ngFilterExpr.value.expression);
    }

    return ngFilterExpr.value.filterCalls.reduce(wrapFilterCall, addScAccessors(ngFilterExpr.value.expression)) + ";";
}

export function addScopeAccessors(input: string, scopeInfo: ScopeInfo): string {
    let sourceFile = ts.createSourceFile(
        "", input, ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return sourceFile.statements.map(stmtAddScopeAccessors(scopeInfo)).join(";\n");
}

const nodeKindPassthroughList = Set(
    [ts.SyntaxKind.NumericLiteral,
     ts.SyntaxKind.NullKeyword,
     ts.SyntaxKind.StringLiteral,
     ts.SyntaxKind.TrueKeyword,
     ts.SyntaxKind.FalseKeyword]);

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
        } else if (node.kind === ts.SyntaxKind.ConditionalExpression) {
            const cond = <ts.ConditionalExpression>node;
            return stmtAddScopeAccessors(scopeInfo)(cond.condition) + " ? " +
                stmtAddScopeAccessors(scopeInfo)(cond.whenTrue) + " : " +
                stmtAddScopeAccessors(scopeInfo)(cond.whenFalse);
        } else if (node.kind === ts.SyntaxKind.Block) {
            // it's most likely in fact not a block per se, but an object literal.
            const block = <ts.Block>node;
            return block.getChildren().map(stmtAddScopeAccessors(scopeInfo)).join("");
        } else if (node.kind === ts.SyntaxKind.LabeledStatement) {
            const lStat = <ts.LabeledStatement>node;
            return lStat.label.text + ": " + stmtAddScopeAccessors(scopeInfo)(lStat.statement);
        } else if (node.kind === ts.SyntaxKind.SyntaxList) {
            return node.getChildren().map(stmtAddScopeAccessors(scopeInfo)).join("");
        } else if (nodeKindPassthroughList.contains(node.kind)) {
            return node.getText();
        } else if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken) {
            return ts.tokenToString(node.kind);
        }
        console.log("Add scope accessors: unhandled node: " + node.kind + " -- "+ node.getText());
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
