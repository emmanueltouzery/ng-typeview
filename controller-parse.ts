import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe} from "tsmonad";

function parseScopeInterface(iface: ts.InterfaceDeclaration): string | null {
    const typeIsIScope = t =>
        t.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
        t.expression.name.text === "IScope";
    const ifaceIsIScope = iface.heritageClauses.some(c => c.types.some(typeIsIScope));
    if (ifaceIsIScope) {
        return iface.getText();
    } else {
        return null;
    }
}

function naFind<T extends ts.Node>(arr: ts.NodeArray<T>, f: (value: T) => boolean) : T|null {
    const filterRes = arr.filter(f);
    if (filterRes.length > 0) {
        return filterRes[0];
    } else {
        return null;
    }
}

function maybeNodeType<T>(input: ts.Node, sKind: ts.SyntaxKind, f: (value:ts.Node) => T): Maybe<T> {
    return (input.kind === sKind) ? Maybe.just(f(input)) : Maybe.nothing();
}

function maybeCallExpression(input: ts.Node): Maybe<ts.CallExpression> {
    return maybeNodeType(input, ts.SyntaxKind.CallExpression, i => <ts.CallExpression>i);
}

function maybePropertyAccessExpression(input: ts.Node): Maybe<ts.PropertyAccessExpression> {
    return maybeNodeType(input, ts.SyntaxKind.PropertyAccessExpression, i => <ts.PropertyAccessExpression>i);
}

function maybeIdentifier(input: ts.Node): Maybe<ts.Identifier> {
    return maybeNodeType(input, ts.SyntaxKind.Identifier, i => <ts.Identifier>i);
}

function maybeStringLiteral(input: ts.Node): Maybe<ts.StringLiteral> {
    return maybeNodeType(input, ts.SyntaxKind.StringLiteral, i => <ts.StringLiteral>i);
}

export interface ControllerViewInfo {
    controllerName : string;
    viewPath: string;
}

function parseModalOpen(callExpr : ts.CallExpression): ControllerViewInfo | null {
    if (callExpr.expression.getText() !== "$modal.open") {
        return null;
    }
    if (callExpr.arguments.length !== 1 ||
        callExpr.arguments[0].kind !== ts.SyntaxKind.ObjectLiteralExpression) {
        console.warn("$modal.open call with unexpected param count: " +
                     callExpr.arguments.length +
                     " or kind: " + callExpr.arguments[0].kind);
        return null;
    }
    const objectParam = <ts.ObjectLiteralExpression>callExpr.arguments[0];
    const getField = name =>
        naFind(objectParam.properties,
               p => (<ts.Identifier>p.name).text === name);

    const getFieldStringLiteralValue = field =>
        (<ts.StringLiteral>(<ts.PropertyAssignment>field).initializer).text;

    const controllerInfo = getField("controller");
    const templateInfo = getField("templateUrl");
    return {
        controllerName: getFieldStringLiteralValue(controllerInfo),
        viewPath: getFieldStringLiteralValue(templateInfo)
    };
}

function parseAngularModule(expr: ts.ExpressionStatement) {
    const callExpr = maybeCallExpression(expr.expression);
    const prop0 = callExpr
        .bind(callExpr => maybePropertyAccessExpression(callExpr.expression));

    const prop = prop0
        .bind(callProp => maybeCallExpression(callProp.expression))
        .bind(callPropCall => maybePropertyAccessExpression(callPropCall.expression));

    const receiver1 = prop
        .bind(p => maybeIdentifier(p.expression))
        .map(r => r.text);
    const call1 = prop
        .bind(p => maybeIdentifier(p.name))
        .map(r => r.text);

    if (receiver1.valueOr(null) === "angular" && call1.valueOr(null) === "module") {
        console.log("part 1 done")
        const moduleCall = prop0.map(p => p.name.text);
        if (moduleCall.valueOr(null) === "controller") {
            console.log("part 2 done")
            const nme = callExpr
            // TODO guard the array indexing
                .bind(c => maybeStringLiteral(c.arguments[0]))
                .map(a => a.text);
            return nme.valueOr(null);
        }
    }
    return null;
}

export interface ViewInfo {
    ngModuleName: string|null;
    controllerViewInfos: [ControllerViewInfo]
}

export function extractModalOpenAngularModule(fileName: string): Promise<ViewInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    var ngModuleName = null;
    var viewInfos = [];
    return new Promise((resolve, reject) => {
        function nodeExtractModuleOpenAngularModule(node: ts.Node) {
            if (node.kind == ts.SyntaxKind.CallExpression) {
                const viewInfo = parseModalOpen(<ts.CallExpression>node);
                if (viewInfo !== null) {
                    viewInfos.push(viewInfo);
                }
            }
            if (ngModuleName === null && node.kind == ts.SyntaxKind.ExpressionStatement) {
                ngModuleName = parseAngularModule(<ts.ExpressionStatement>node);
            }
            ts.forEachChild(node, nodeExtractModuleOpenAngularModule);
        }
        nodeExtractModuleOpenAngularModule(sourceFile);
        const result = {ngModuleName: ngModuleName, controllerViewInfos: viewInfos};
        console.log("resolving for " + fileName);
        console.log(result);
        resolve(result);
    });
}

export function extractScopeInterface(fileName: string): Promise<string> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return new Promise((resolve, reject) => {
        function nodeExtractScopeInterface(node: ts.Node) {
            if (node.kind == ts.SyntaxKind.InterfaceDeclaration) {
                const intfInfo = parseScopeInterface(<ts.InterfaceDeclaration>node);
                if (intfInfo !== null) {
                    resolve(intfInfo);
                }
            }
            ts.forEachChild(node, nodeExtractScopeInterface);
        }
        nodeExtractScopeInterface(sourceFile);
    });
}
