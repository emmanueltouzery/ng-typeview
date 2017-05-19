import {readFileSync} from "fs";
import * as ts from "typescript";
import {Set, Stack} from "immutable";
import * as imm from "immutable";
import * as P from "parsimmon"

import {NgScope, requireDefined} from "./view-parser"
import {NgFilter} from "./filters"

/**
 * Scope info used by ng-typeview. Directive authors can
 * consider it an opaque type (type synonym on purpose
 * so typedoc doesn't document it).
 */
export type NgScopeInfo = {
    readonly soFar: Stack<NgScope>,
    curScopeVars: string[]
};

/**
 * Companion object to assist typescript code generation.
 * It manages the scope behind the scenes so its state
 * changes as you call its methods.
 * If you do not let it know about variables you declare
 * in your typescript, there will be issues of '$scope.'
 * being prepended to the generated code when it shouldn't be.
 */
export class CodegenHelper {
    public readonly ngScopeInfo: NgScopeInfo;
    private getNewVarName: ()=>string;
    public readonly ngFilters: imm.List<NgFilter>;

    constructor(ngFilters: imm.List<NgFilter>, scope: Stack<NgScope>, getNewVarName: ()=>string) {
        this.ngFilters = ngFilters;
        this.ngScopeInfo = {soFar: scope, curScopeVars: []};
        this.getNewVarName = getNewVarName;
    }

    /**
     * Add scope accessors to a JS expression. For instance,
     * "data.name" will become "$scope.data.name" if the scope
     * has a field named 'data'
     * NOTE using an instance function so this will be properly
     * bound when used as a callback =>
     * https://github.com/Microsoft/TypeScript/wiki/'this'-in-TypeScript#use-instance-functions
     * @param js the javascript from the angular view
     * @returns new source with the scope accessors added
     */
    public addScopeAccessors = (js:string): string => {
        return addScopeAccessors(this.ngScopeInfo.soFar.unshift({
            // hardcoding 1...I just need to let addScopeAccessors
            // know about these local variables. a bit of a hack.
            xpathDepth:1,
            closeSource:()=>"",
            variables: this.ngScopeInfo.curScopeVars
        }), js);
    }

    /**
     * Get a new unique variable name
     * @returns new unique variable name
     */
    public getNewVariableName(): string {
        return this.registerVariable(this.getNewVarName());
    }

    /**
     * Generate a TS expression declaring a variable of
     * the type and value that you give. Will automatically call
     * `addScopeAccessors` on the value.
     * @param type typescript type for the variable
     * @param val value for the variable
     * @returns typescript expression that registers the variable, as string.
     */
    public declareVariable(type:string, val:string): string {
        // if there are embedded {{}} blocks, ignore this and we'll grab them
        // in the html source in general through other means.
        if (val.length > 0 && val.indexOf("{{") < 0) {
            return `const ${this.getNewVariableName()}: ${type} = ${this.addScopeAccessors(val)};`;
        } else {
            return ""; // angular tolerates empty attributes and ignores them, for instance ng-submit=""
        }
    }

    /**
     * You must register a variable name when you declare a variable
     * while generating code without going through [[generateVariable]]
     * or [[getNewVariableName]].
     * Otherwise generation will add a `$scope.` accessor to it even though
     * it shouldn't.
     * Since `registerVariable` will return you the variable name you gave,
     * you can use this function as a pass-through, just wrap your var
     * name with this call.
     */
    public registerVariable(name:string): string {
        this.ngScopeInfo.curScopeVars.push(name);
        return name;
    }
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

function parseNgExpr(): P.Parser<string> {
    return P.string("{{").then(P.lazy(parseExpr)).skip(P.string("}}"));
}

function parseArithmeticOperator(): P.Parser<string> {
    return keyword("+").or(keyword("-")).or(keyword("*")).or(keyword("/"));
}

function parseLogicalOperator(): P.Parser<string> {
    return keyword("&&").or(keyword("||"))
        .or(keyword("===")).or(keyword("!=="))
        .or(keyword("<")).or(keyword("<=")).or(keyword(">")).or(keyword(">="));
}

function parseBinaryOperations(): P.Parser<string> {
    return parseString().or(parseAtom())
        .chain(expr => parseLogicalOperator().or(parseArithmeticOperator())
            .chain(op => parseBinaryOperations().or(parseString()).or(parseAtom())
                .map(expr2 => expr + op + expr2)));
}

function parseTernary(): P.Parser<string> {
    return parseBinaryOperations().or(parseAtom())
        .skip(keyword("?"))
        .chain(expr => parseExpr()
            .chain(expr2 => keyword(":").then(parseExpr())
                .map(expr3 => expr + " ? " + expr2 + ":" + expr3)));
}

function parseString(): P.Parser<string> {
    const str = (sep:string) => P.string(sep)
        .then(P.noneOf(sep).many())
        .skip(P.string(sep))
        .map(s => sep + s.join("") + sep);
    return str("'").or(str('"'));
}

function parseBracketed<T>(next: P.Parser<T>): P.Parser<T> {
    return P.regexp(/\s*\(\s*/).then(next).skip(P.regexp(/\s*\)/));
}

function parseExpr() : P.Parser<string> {
    return parseNgExpr()
        .or(parseBracketed(P.lazy(parseExpr)))
        .or(parseTernary())
        .or(parseBinaryOperations())
        .or(parseString())
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
    return P.takeWhile(c => [' ', ':', ')'].indexOf(c) < 0).chain(
        functionName => parseNgFilterParam().many()
            .map(functionParameters => ({functionName, functionParameters})));
}

function parseNgFilterParam() : P.Parser<string> {
    const simpleParam = P.takeWhile(c => [':', '|'].indexOf(c) < 0);
    const objectLiteralParam = P.string("{")
        .then(P.takeWhile(c => c !== "}")).skip(P.string("}")).map(s => "{" + s + "}");
    return P.regex(/\s*:\s*/).then(objectLiteralParam.or(simpleParam));
}

function wrapFilterCall(ngFilters: imm.List<NgFilter>, addScAccessors: (x:string)=>string):
    (soFar: string, ngFilterCall: NgFilterCall) => string {
    return (soFar, ngFilterCall) => {
        const filterInfo = ngFilters.find(f => f.name === ngFilterCall.functionName);
        if (!filterInfo) {
            throw "Unknown filter: " + ngFilterCall.functionName + " -- context: " + soFar;
        }
        const addAccessorsForParam = filterInfo.addScopeToParam;
        const params = ngFilterCall.functionParameters
            .map((val, idx) => addAccessorsForParam(idx+1, val, addScAccessors)).join(', ');
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
    expr: string, codegenHelpers: CodegenHelper): string {
    const ngFilterExpr = parseNgFilterExpression().skip(P.optWhitespace).parse(expr);
    if (!ngFilterExpr.status) {
        console.warn("Failed parsing filter expression");
        console.warn(expr);
        console.warn(ngFilterExpr);
        return "";
    }
    return ngFilterExpressionToTypeScriptStandalone(ngFilterExpr.value, codegenHelpers);
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
    ngFilterExpr: NgFilterExpression, codegenHelpers: CodegenHelper): string {
    if (ngFilterExpr.filterCalls.length === 0) {
        return codegenHelpers.declareVariable("any", ngFilterExpr.expression);
    }

    return ngFilterExpr.filterCalls.reduce(
        wrapFilterCall(codegenHelpers.ngFilters, codegenHelpers.addScopeAccessors),
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
    ngFilterExpr: NgFilterExpression, codegenHelpers: CodegenHelper): string {
    if (ngFilterExpr.filterCalls.length === 0) {
        return codegenHelpers.addScopeAccessors(ngFilterExpr.expression);
    }

    return ngFilterExpr.filterCalls.reduce(
        wrapFilterCall(codegenHelpers.ngFilters, codegenHelpers.addScopeAccessors),
        codegenHelpers.addScopeAccessors(ngFilterExpr.expression));
}

/**
 * @hidden
 */
export function addScopeAccessors(scopes: Stack<NgScope>, input: string): string {
    const sourceFile = ts.createSourceFile(
        "", input, ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return sourceFile.statements.map(stmtAddScopeAccessors(scopes)).join("");
}

function handleRegexpNode(node: ts.RegularExpressionLiteral) {
    // {} and other characters in regex literals confuse the indenting
    // pass that I have during codegen. generate a more uniform syntax.
    if (node.text.startsWith('/') && node.text.endsWith('/')) {
        const regexText = node.text.substring(1, node.text.length-1);
        let separator = '"';
        if (node.text.indexOf('"') >= 0) {
            separator = "'";
            if (node.text.indexOf("'") >= 0) {
                // ok that's probably too much now.
                // return in the // form. if there are characters
                // which could confuse the layout pass, maybe this
                // can be worked around (put the regex in the controller,
                // not the view). or I can try yet another way but...
                if (node.text.indexOf('{') >= 0 ||
                    node.text.indexOf('}') >= 0 ||
                    node.text.indexOf(';') >= 0) {
                    console.warn(
                        "Warning: it's likely that the rendering of the regular expression" +
                            regexText + " causes problems." +
                            " Consider moving its value to the view instead of the controller" +
                            " or changing it to the 'new Regexp()' form.");
                }
                return node.getText();
            }
        }
        return "new RegExp(" + separator + regexText + separator + ")";
    } else {
        return node.getText();
    }
}

const nodeKindPassthroughList = Set(
    [ts.SyntaxKind.NumericLiteral,
     ts.SyntaxKind.NullKeyword,
     ts.SyntaxKind.StringLiteral,
     ts.SyntaxKind.TrueKeyword,
     ts.SyntaxKind.FalseKeyword,
     ts.SyntaxKind.UndefinedKeyword]);

function stmtAddScopeAccessors(scopes: Stack<NgScope>): (node: ts.Node) => string {
    return node => {
        if (node.kind === ts.SyntaxKind.ExpressionStatement) {
            return stmtAddScopeAccessors(scopes)((<ts.ExpressionStatement>node).expression);
        } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
            return handleRegexpNode(<ts.RegularExpressionLiteral>node);
        } else if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const prop = <ts.PropertyAccessExpression>node;
            return stmtAddScopeAccessors(scopes)(prop.expression) + "." + prop.name.getText();
        } else if (node.kind === ts.SyntaxKind.Identifier) {
            return node.getText() === "undefined" ? "undefined" : addScopePrefixIfNeeded(scopes, node.getText());
        } else if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
            const op = <ts.PrefixUnaryExpression>node;
            return ts.tokenToString(op.operator) + stmtAddScopeAccessors(scopes)(op.operand);
        } else if (node.kind === ts.SyntaxKind.CallExpression) {
            const expr = <ts.CallExpression>node;
            return stmtAddScopeAccessors(scopes)(expr.expression) + "(" +
                expr.arguments.map(stmtAddScopeAccessors(scopes)).join(", ") + ")";
        } else if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const expr = <ts.BinaryExpression>node;
            return stmtAddScopeAccessors(scopes)(expr.left)
                + " " + expr.operatorToken.getText() + " "
                + stmtAddScopeAccessors(scopes)(expr.right);
        } else if (node.kind === ts.SyntaxKind.ElementAccessExpression) {
            const acc = <ts.ElementAccessExpression>node;
            const argValue = acc.argumentExpression
                ? stmtAddScopeAccessors(scopes)(acc.argumentExpression)
                : "";
            return stmtAddScopeAccessors(scopes)(acc.expression) +
                "["+ argValue + "]";
        } else if (node.kind === ts.SyntaxKind.ConditionalExpression) {
            const cond = <ts.ConditionalExpression>node;
            return stmtAddScopeAccessors(scopes)(cond.condition) + " ? " +
                stmtAddScopeAccessors(scopes)(cond.whenTrue) + " : " +
                stmtAddScopeAccessors(scopes)(cond.whenFalse);
        } else if (node.kind === ts.SyntaxKind.Block) {
            // it's most likely in fact not a block per se, but an object literal.
            const block = <ts.Block>node;
            return block.getChildren().map(stmtAddScopeAccessors(scopes)).join("");
        } else if (node.kind === ts.SyntaxKind.LabeledStatement) {
            const lStat = <ts.LabeledStatement>node;
            return lStat.label.text + ": " + stmtAddScopeAccessors(scopes)(lStat.statement);
        } else if (node.kind === ts.SyntaxKind.SyntaxList) {
            return node.getChildren().map(stmtAddScopeAccessors(scopes)).join("");
        } else if (nodeKindPassthroughList.contains(node.kind)) {
            return node.getText();
        } else if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken) {
            return ts.tokenToString(node.kind);
        } else if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return "(" + stmtAddScopeAccessors(scopes)(
                (<ts.ParenthesizedExpression>node).expression) + ")";
        } else if (node.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            return "[" + (<ts.ArrayLiteralExpression>node).elements.map(stmtAddScopeAccessors(scopes)).join(", ") + "]";
        }
        console.log("Add scope accessors: unhandled node: " + node.kind + " -- "+ node.getText());
        return node.getText();
    }
}

function addScopePrefixIfNeeded(scopes: Stack<NgScope>, expression: string): string {
    // extract the field name from the expression, which can be...
    // data.user.getName(), or getName() or things like that.
    // so we stop at the first "." or "(" to get respectively
    // "data" or "getName".
    const fieldName = expression.replace(/[\(\.].*$/, "");

    // is the field name present in any of the parent scopes?
    if (scopes.find(s => s.variables.indexOf(expression) >= 0)) {
        // YES => read it from there.
        return expression;
    } else {
        return "$scope." + expression;
    }

}
