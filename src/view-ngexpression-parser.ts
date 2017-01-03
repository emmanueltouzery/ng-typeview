import {readFileSync} from "fs";
import * as ts from "typescript";
import {Set} from "immutable";
import * as P from "parsimmon"

import {ScopeInfo} from "./controller-parser"

/**
 * Helper functions to assist with code generation.
 */
export interface CodegenHelpers {
    /**
     * Add scope accessors to a JS expression. For instance,
     * "data.name" will become "$scope.data.name" if the scope
     * has a field named 'data'
     * @param js the javascript from the angular view
     * @returns new source with the scope accessors added
     */
    addScopeAccessors: (js:string)=>string;
    /**
     * Get a new unique variable name
     * @returns new unique variable name
     */
    getNewVariableName: ()=>string;
    /**
     * Generate a TS expression declaring a variable of
     * the type and value that you give. Will automatically call
     * `addScopeAccessors` on the value.
     * @param type typescript type for the variable
     * @param val value for the variable
     * @returns typescript expression that registers the variable, as string.
     */
    registerVariable:(type:string,val:string)=>string;
}

/**
 * An angular filter expression. For instance
 * "data.items | orderBy: 'name'"
 * For that example, `expression` will contain "data.items"
 * and `filterCalls` will contain a single filter, "orderBy" with a parameter
 * of "name".
 */
export interface NgFilterExpression {
    /**
     * The base expression for the filter expression
     */
    expression: string;
    /**
     * List of the filter calls applied to the base expression.
     */
    filterCalls: NgFilterCall[];
}

/**
 * An angular filter call. For instance "orderBy: 'name'".
 * For that example, `functionName` will contain "orderBy",
 * and `functionParameters` will contain a single parameter
 * of "name".
 */
export interface NgFilterCall {
    /**
     * The name of the filter function.
     */
    functionName: string;
    /**
     * List of the function parameters.
     */
    functionParameters: string[];
}

/**
 * @hidden
 */
export function keyword(txt: string): P.Parser<string> {
    return P.whitespace.then(P.string(txt)).skip(P.whitespace);
}

/**
 * @hidden
 */
export function parseAtom(): P.Parser<string> {
    return P.takeWhile(c => [' ', '|'].indexOf(c) < 0);
}

function parseArithmeticOperator(): P.Parser<string> {
    return keyword("+").or(keyword("-")).or(keyword("*")).or(keyword("/"));
}

function parseArithmetic(): P.Parser<string> {
    return parseString().or(parseAtom())
        .chain(expr => parseArithmeticOperator()
               .chain(op => parseString().or(parseAtom())
                      .map(expr2 => expr + op + expr2)));
}

function parseTernary(): P.Parser<string> {
    return parseAtom()
        .skip(keyword("?"))
        .chain(expr => parseString().or(parseAtom())
               .chain(expr2 => keyword(":").then(parseString().or(parseAtom()))
                      .map(expr3 => expr + " ? " + expr2 + ":" + expr3)));
}

function parseString(): P.Parser<string> {
    const str = (sep:string) => P.string(sep)
        .then(P.noneOf(sep).many())
        .skip(P.string(sep))
        .map(s => sep + s.join("") + sep);
    return str("'").or(str('"'));
}

function parseExpr() : P.Parser<string> {
    return parseString()
        .or(parseArithmetic())
        .or(parseTernary())
        .or(parseAtom());
}

/**
 * [Parsimmon](https://github.com/jneen/parsimmon) parser for angular filter
 * expressions. You can then use [[ngFilterExpressionToTypeScriptEmbedded]]
 * and [[ngFilterExpressionToTypeScriptStandalone]] to operate on the data.
 * @returns a [Parsimmon](https://github.com/jneen/parsimmon) Parser of [[NgFilterExpression]]
 */
export function parseNgFilterExpression(): P.Parser<NgFilterExpression> {
    return P.optWhitespace.then(parseExpr())
        .chain(expression => P.regex(/\s*\|\s*/).then(parseNgFilterCall()).many()
               .map(filterCalls => ({expression, filterCalls})));
}

function parseNgFilterCall(): P.Parser<NgFilterCall> {
    return P.takeWhile(c => [' ', ':'].indexOf(c) < 0).chain(
        functionName => parseNgFilterParam().many()
            .map(functionParameters => ({functionName, functionParameters})));
}

function parseNgFilterParam() : P.Parser<string> {
    const simpleParam = P.takeWhile(c => [':', '|'].indexOf(c) < 0);
    const objectLiteralParam = P.string("{")
        .then(P.takeWhile(c => c !== "}")).skip(P.string("}")).map(s => "{" + s + "}");
    return P.regex(/\s*:\s*/).then(objectLiteralParam.or(simpleParam));
}

function wrapFilterCall(addScAccessors: (x:string)=>string):
    (soFar: string, ngFilterCall: NgFilterCall) => string {
    return (soFar, ngFilterCall) => {
        const params = ngFilterCall.functionParameters
            .map(addScAccessors).join(', ');
        const fnParams = params.length > 0 ? (', ' + params) : '';
        return `f__${ngFilterCall.functionName}(${soFar}${fnParams})`
    }
}

/**
 * Convert an angular filter expression to typescript code.
 * For instance, "data.items | orderBy: 'name'" will become:
 * "f___orderBy($scope.data.items, 'name');".
 * Calls [[ngFilterExpressionToTypeScriptStandalone]] under the hood.
 * @param expr The angular filter expression
 * @param codegenHelpers Object which contains functions
 *     to assist with typescript code generation.
 * @returns A typescript expression for type-checking the angular filters,
 *     or the empty string in case of parse error.
 */
export function filterExpressionToTypescript(
    expr: string, codegenHelpers: CodegenHelpers): string {
    const ngFilterExpr = parseNgFilterExpression().skip(P.optWhitespace).parse(expr);
    if (!ngFilterExpr.status) {
        console.warn("Failed parsing filter expression");
        console.warn(expr);
        console.warn(ngFilterExpr);
        return "";
    }
    return ngFilterExpressionToTypeScriptStandalone(
        ngFilterExpr.value, codegenHelpers);
}

/**
 * Convert a parsed angular filter expression to typescript code.
 * For instance, "data.items | orderBy: 'name'" will become:
 * "f___orderBy($scope.data.items, 'name');".
 * @param ngFilterExpr The parsed angular filter expression
 * @param codegenHelpers Object which contains functions
 *     to assist with typescript code generation.
 * @returns A typescript expression for type-checking the angular filters,
 *     or the empty string in case of parse error.
 */
export function ngFilterExpressionToTypeScriptStandalone(
    ngFilterExpr: NgFilterExpression, codegenHelpers: CodegenHelpers): string {
    if (ngFilterExpr.filterCalls.length === 0) {
        return codegenHelpers.registerVariable("any", ngFilterExpr.expression);
    }

    return ngFilterExpr.filterCalls.reduce(
        wrapFilterCall(codegenHelpers.addScopeAccessors),
        codegenHelpers.addScopeAccessors(ngFilterExpr.expression)) + ";";
}

/**
 * Convert a parsed angular filter expression to typescript code.
 * For instance, "data.items | orderBy: 'name'" will become:
 * "f___orderBy($scope.data.items, 'name')".
 * Unlike [[ngFilterExpressionToTypeScriptStandalone]], this version will
 * generate typescript code to be reused by further code, not to be generated
 * standalone. For instance:
 * `ng-options="item.subItem as item.label for item in data.groups | orderBy:'labelSort'"`
 * In that case we can generate a typescript embeddable expression for:
 * `data.groups | orderBy:'labelSort'` and then include it in the rest of the
 * outer expression.
 * @param ngFilterExpr The parsed angular filter expression
 * @param codegenHelpers Code generation helpers
 * @returns A typescript expression for type-checking the angular filters,
 *     or the empty string in case of parse error.
 */
export function ngFilterExpressionToTypeScriptEmbedded(
    ngFilterExpr: NgFilterExpression, codegenHelpers: CodegenHelpers): string {
    if (ngFilterExpr.filterCalls.length === 0) {
        return codegenHelpers.addScopeAccessors(ngFilterExpr.expression);
    }

    return ngFilterExpr.filterCalls.reduce(
        wrapFilterCall(codegenHelpers.addScopeAccessors),
        codegenHelpers.addScopeAccessors(ngFilterExpr.expression));
}

/**
 * @hidden
 */
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
