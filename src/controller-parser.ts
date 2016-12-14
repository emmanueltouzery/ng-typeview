import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe, List} from "monet";

function parseScopeInterface(iface: ts.InterfaceDeclaration): Maybe<string> {
    const typeIsIScope = (t: ts.ExpressionWithTypeArguments) =>
        t.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
        (<ts.PropertyAccessExpression>t.expression).name.text === "IScope";
    const heritageClauseHasIScope = (c:ts.HeritageClause) =>
        Maybe.fromNull(c.types).filter(ts => ts.some(typeIsIScope)).isSome();
    return Maybe.fromNull(iface.heritageClauses)
        .filter(clauses => clauses.some(heritageClauseHasIScope))
        .map(_ => iface.getText());
}

function maybeNodeType<T>(input: ts.Node|undefined, sKind: ts.SyntaxKind, f: (value:ts.Node) => T): Maybe<T> {
    return (input && input.kind === sKind) ? Maybe.Some(f(input)) : Maybe.None<T>();
}

function maybeCallExpression(input: ts.Node): Maybe<ts.CallExpression> {
    return maybeNodeType(input, ts.SyntaxKind.CallExpression, i => <ts.CallExpression>i);
}

function maybePropertyAccessExpression(input: ts.Node): Maybe<ts.PropertyAccessExpression> {
    return maybeNodeType(input, ts.SyntaxKind.PropertyAccessExpression, i => <ts.PropertyAccessExpression>i);
}

function maybePropertyAssignment(input: ts.Node): Maybe<ts.PropertyAssignment> {
    return maybeNodeType(input, ts.SyntaxKind.PropertyAssignment, i => <ts.PropertyAssignment>i);
}

function maybeIdentifier(input: ts.Node|undefined): Maybe<ts.Identifier> {
    return maybeNodeType(input, ts.SyntaxKind.Identifier, i => <ts.Identifier>i);
}

function maybeStringLiteral(input: ts.Node): Maybe<ts.StringLiteral> {
    return maybeNodeType(input, ts.SyntaxKind.StringLiteral, i => <ts.StringLiteral>i);
}

function maybeObjectLiteralExpression(input: ts.Node): Maybe<ts.ObjectLiteralExpression> {
    return maybeNodeType(input, ts.SyntaxKind.ObjectLiteralExpression, i => <ts.ObjectLiteralExpression>i);
}

export interface ControllerViewInfo {
    controllerName : string;
    viewPath: string;
}

function parseModalOpen(callExpr : ts.CallExpression, folder: string): Maybe<ControllerViewInfo> {
    const paramObjectElements = Maybe.of(callExpr)
        .filter(c => c.expression.getText() === "$modal.open")
        .filter(c => c.arguments.length === 1)
        .flatMap(c => maybeObjectLiteralExpression(c.arguments[0]))
        .map(o => List.fromArray(o.properties));

    const getField = (name: string): Maybe<ts.Node> =>
        paramObjectElements.flatMap(elts => elts.find(
            elt => maybeIdentifier(elt.name).filter(i => i.text === name).isSome()));

    const getFieldStringLiteralValue = (field: ts.Node): Maybe<string> =>
        maybePropertyAssignment(field)
        .flatMap(pa => maybeStringLiteral(pa.initializer))
        .map(ini => ini.text);

    const controllerName = getField("controller")
        .flatMap(f => getFieldStringLiteralValue(f));
    const rawViewPath = getField("templateUrl")
        .flatMap(f =>getFieldStringLiteralValue(f));

    const buildCtrlViewInfo = (rawViewPath:string) => (ctrlName:string):ControllerViewInfo =>
        ({controllerName: ctrlName, viewPath: folder + "/" + rawViewPath});

    return controllerName.ap(rawViewPath.map(buildCtrlViewInfo));
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
        const moduleCall = prop0.map(p => p.name.text);
        if (moduleCall.filter(v => v === "controller").isSome()) {
            const nme = callExpr
                .filter(c => c.arguments.length > 0)
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
                if (viewInfo.isSome()) {
                    viewInfos.push(viewInfo.some());
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
    tsModuleName: Maybe<string>;
    scopeContents: Maybe<string>;
    typeAliases: string[];
    imports: string[];
    interfaces: string[];
}

export function extractControllerScopeInfo(fileName: string): Promise<ControllerScopeInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return new Promise((resolve, reject) => {
        var intfInfo: Maybe<string> = Maybe.None<string>();
        var tsModuleName:string|null = null;
        var typeAliases:string[] = [];
        var imports:string[] = [];
        var interfaces:string[] = [];
        function nodeExtractScopeInterface(node: ts.Node) {
            if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
                const curIntfInfo = parseScopeInterface(<ts.InterfaceDeclaration>node);
                if (curIntfInfo.isSome()) {
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
            tsModuleName: Maybe.fromNull<string>(tsModuleName),
            scopeContents: intfInfo,
            typeAliases: typeAliases,
            imports: imports,
            interfaces: interfaces
        } as ControllerScopeInfo);
    });
}
