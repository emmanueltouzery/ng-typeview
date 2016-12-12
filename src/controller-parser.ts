import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe} from "monet";

function parseScopeInterface(iface: ts.InterfaceDeclaration): string | null {
    const typeIsIScope = (t: ts.ExpressionWithTypeArguments) =>
        t.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
        (<ts.PropertyAccessExpression>t.expression).name.text === "IScope";
    const ifaceIsIScope = iface.heritageClauses.some(c => c.types.some(typeIsIScope));
    if (ifaceIsIScope) {
        return iface.getText();
    } else {
        return null;
    }
}

function naFind<T extends ts.Node>(arr: ts.NodeArray<T>, f: (value: T) => boolean) : Maybe<T> {
    const filterRes = arr.filter(f);
    if (filterRes.length > 0) {
        return Maybe.Some(filterRes[0]);
    } else {
        return Maybe.None<T>();
    }
}

function maybeNodeType<T>(input: ts.Node, sKind: ts.SyntaxKind, f: (value:ts.Node) => T): Maybe<T> {
    return (input.kind === sKind) ? Maybe.Some(f(input)) : Maybe.None<T>();
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

// TODO convert to monadic style
function parseModalOpen(callExpr : ts.CallExpression, folder: string): ControllerViewInfo | null {
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
    const getField = (name: string): Maybe<ts.Node> =>
        naFind(objectParam.properties,
               p => (<ts.Identifier>p.name).text === name);

    const getFieldStringLiteralValue = (field: ts.Node): string =>
        (<ts.StringLiteral>(<ts.PropertyAssignment>field).initializer).text;

    const controllerName = getField("controller")
        .map(f => getFieldStringLiteralValue(f));
    const rawViewPath = getField("templateUrl")
        .map(f =>getFieldStringLiteralValue(f));
    return (controllerName.isSome() && rawViewPath.isSome())
        ? {controllerName: controllerName.some(), viewPath: folder + "/" + rawViewPath.some()}
        : null;
}

function parseAngularModule(expr: ts.ExpressionStatement): Maybe<string> {
    const callExpr = maybeCallExpression(expr.expression);
    const prop0 = callExpr
        .flatMap(callExpr => maybePropertyAccessExpression(callExpr.expression));

    const prop = prop0
        .flatMap(callProp => maybeCallExpression(callProp.expression))
        .flatMap(callPropCall => maybePropertyAccessExpression(callPropCall.expression));

    const receiver1 = prop
        .flatMap(p => maybeIdentifier(p.expression))
        .map(r => r.text);
    const call1 = prop
        .flatMap(p => maybeIdentifier(p.name))
        .map(r => r.text);

    if (receiver1.filter(v => v === "angular")
        .orElse(call1.filter(v => v === "module")).isSome()) {
        console.log("part 1 done")
        const moduleCall = prop0.map(p => p.name.text);
        if (moduleCall.filter(v => v === "controller").isSome()) {
            console.log("part 2 done")
            const nme = callExpr
            // TODO guard the array indexing
                .flatMap(c => maybeStringLiteral(c.arguments[0]))
                .map(a => a.text);
            return nme;
        }
    }
    return Maybe.None<string>();
}

export interface ViewInfo {
    fileName: string;
    ngModuleName: Maybe<string>;
    controllerViewInfos: [ControllerViewInfo]
}

export function extractModalOpenAngularModule(fileName: string, webappPath: string): Promise<ViewInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    var ngModuleName = Maybe.None<string>();
    var viewInfos:ControllerViewInfo[] = [];
    return new Promise((resolve, reject) => {
        function nodeExtractModuleOpenAngularModule(node: ts.Node) {
            if (node.kind == ts.SyntaxKind.CallExpression) {
                const viewInfo = parseModalOpen(<ts.CallExpression>node, webappPath);
                if (viewInfo !== null) {
                    viewInfos.push(viewInfo);
                }
            }
            if (ngModuleName.isNone() && node.kind == ts.SyntaxKind.ExpressionStatement) {
                ngModuleName = parseAngularModule(<ts.ExpressionStatement>node);
            }
            ts.forEachChild(node, nodeExtractModuleOpenAngularModule);
        }
        nodeExtractModuleOpenAngularModule(sourceFile);
        const result = {
            fileName: fileName,
            ngModuleName: ngModuleName,
            controllerViewInfos: viewInfos};
        console.log("resolving for " + fileName);
        console.log(result);
        resolve(result);
    });
}

export interface ControllerScopeInfo {
    tsModuleName: string|null;
    scopeContents: string;
    typeAliases: string[];
    imports: string[];
    interfaces: string[];
}

export function extractControllerScopeInfo(fileName: string): Promise<ControllerScopeInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return new Promise((resolve, reject) => {
        var intfInfo: string|null = null;
        var tsModuleName:string|null = null;
        var typeAliases:string[] = [];
        var imports:string[] = [];
        var interfaces:string[] = [];
        function nodeExtractScopeInterface(node: ts.Node) {
            if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
                const curIntfInfo = parseScopeInterface(<ts.InterfaceDeclaration>node);
                if (curIntfInfo) {
                    intfInfo = curIntfInfo;
                } else {
                    interfaces.push(node.getText());
                }
            }
            if (node.kind === ts.SyntaxKind.ModuleDeclaration) {
                const moduleLevel = (<ts.StringLiteral>(<ts.ModuleDeclaration>node).name).text;
                if (tsModuleName) {
                    tsModuleName += "." + moduleLevel;
                } else {
                    tsModuleName = moduleLevel;
                }
            }
            if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
                typeAliases.push(node.getText());
            }
            if (node.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
                imports.push(node.getText());
            }
            ts.forEachChild(node, nodeExtractScopeInterface);
        }
        nodeExtractScopeInterface(sourceFile);
        resolve({
            tsModuleName: tsModuleName,
            scopeContents: intfInfo,
            typeAliases: typeAliases,
            imports: imports,
            interfaces: interfaces
        });
    });
}
