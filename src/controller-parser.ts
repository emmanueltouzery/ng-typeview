import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe, List} from "monet";

function parseScopeInterface(iface: ts.InterfaceDeclaration): Maybe<ScopeInfo> {
    const typeIsIScope = (t: ts.ExpressionWithTypeArguments) =>
        t.expression.kind === ts.SyntaxKind.PropertyAccessExpression &&
        (<ts.PropertyAccessExpression>t.expression).name.text === "IScope";
    const heritageClauseHasIScope = (c:ts.HeritageClause) =>
        Maybe.fromNull(c.types).filter(ts => ts.some(typeIsIScope)).isSome();
    return Maybe.fromNull(iface.heritageClauses)
        .filter(clauses => clauses.some(heritageClauseHasIScope))
        .map(_ => getScopeInfo(iface));
}

function getScopeInfo(iface: ts.InterfaceDeclaration): ScopeInfo {
    const fieldNames = List.fromArray(iface.members)
        .map(m => maybeIdentifier(m.name).map(i => i.text))
        .flatMap(m => m.toList())
        .toArray();
    return { contents: iface.getText(), fieldNames: fieldNames};
}

const maybeNodeType = <T> (sKind: ts.SyntaxKind) => (input: ts.Node|undefined): Maybe<T> => {
    return (input && input.kind === sKind) ? Maybe.Some(<T><any>input) : Maybe.None<T>();
}

const maybeCallExpression = maybeNodeType<ts.CallExpression>(ts.SyntaxKind.CallExpression);
const maybePropertyAccessExpression = maybeNodeType<ts.PropertyAccessExpression>(ts.SyntaxKind.PropertyAccessExpression);
const maybePropertyAssignment = maybeNodeType<ts.PropertyAssignment>(ts.SyntaxKind.PropertyAssignment);
const maybeIdentifier = maybeNodeType<ts.Identifier>(ts.SyntaxKind.Identifier);
const maybeStringLiteral = maybeNodeType<ts.StringLiteral>(ts.SyntaxKind.StringLiteral);
const maybeObjectLiteralExpression = maybeNodeType<ts.ObjectLiteralExpression>(ts.SyntaxKind.ObjectLiteralExpression);

export interface ControllerViewInfo {
    readonly controllerName : string;
    readonly viewPath: string;
}

function objectLiteralGetProperty(
    propName: string, elts: List<ts.ObjectLiteralElementLike>): Maybe<ts.Node> {
    return elts.find(elt => maybeIdentifier(elt.name).filter(i => i.text === propName).isSome());
}

function getFieldStringLiteralValue(field: ts.Node): Maybe<string> {
    return maybePropertyAssignment(field)
        .flatMap(pa => maybeStringLiteral(pa.initializer))
        .map(ini => ini.text);
}

function objectLiteralGetStringLiteralField(
    propName: string, elts: List<ts.ObjectLiteralElementLike>): Maybe<string> {
    return objectLiteralGetProperty(propName, elts)
        .flatMap(p => getFieldStringLiteralValue(p));
}

function parseModalOpen(callExpr : ts.CallExpression, folder: string): Maybe<ControllerViewInfo> {
    const paramObjectElements = Maybe.of(callExpr)
        .filter(c => ["$modal.open", "this.$modal.open"]
                .indexOf(c.expression.getText()) >= 0)
        .filter(c => c.arguments.length === 1)
        .flatMap(c => maybeObjectLiteralExpression(c.arguments[0]))
        .map(o => List.fromArray(o.properties));

    const getField = (name: string): Maybe<string> =>
        paramObjectElements.flatMap(oe => objectLiteralGetStringLiteralField(name, oe));

    const controllerName = getField("controller");
    const rawViewPath = getField("templateUrl");

    const buildCtrlViewInfo = (rawViewPath:string) => (ctrlName:string):ControllerViewInfo =>
        ({controllerName: ctrlName, viewPath: folder + "/" + rawViewPath});

    return controllerName.ap(rawViewPath.map(buildCtrlViewInfo));
}

function parseModuleState(prop : ts.ObjectLiteralExpression, folder: string): Maybe<ControllerViewInfo> {
    const objectLiteralFields = prop.properties
        .map(e => maybeIdentifier(e.name))
        .filter(i => i.isSome())
        .map(i => i.some().text);
    if ((objectLiteralFields.indexOf("url") >= 0) &&
        (objectLiteralFields.indexOf("templateUrl") >= 0) &&
        (objectLiteralFields.indexOf("controller") >= 0)) {
        // seems like I got a state controller/view declaration
        const controllerName = objectLiteralGetStringLiteralField(
            "controller", List.fromArray(prop.properties));
        const rawViewPath = objectLiteralGetStringLiteralField(
            "templateUrl", List.fromArray(prop.properties));

        const buildCtrlViewInfo = (rawViewPath:string) => (ctrlName:string):ControllerViewInfo =>
            ({controllerName: ctrlName, viewPath: folder + "/" + rawViewPath});
        return controllerName.ap(rawViewPath.map(buildCtrlViewInfo));
    }
    return Maybe.None<ControllerViewInfo>();
}

function parseAngularModule(expr: ts.ExpressionStatement): Maybe<[string,string]> {
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
            const ctrlName = callExpr
                .filter(c => c.arguments.length > 0)
                .flatMap(c => maybeStringLiteral(c.arguments[0]))
                .map(a => a.text);
            const moduleName = prop0
                .flatMap(p => maybeCallExpression(p.expression))
                .filter(c => c.arguments.length > 0)
                .flatMap(c => maybeStringLiteral(c.arguments[0]))
                .map(s => s.text);
            const buildModuleCtrl: ((x:string) => (y:string) => [string,string]) = mod => ctrl => [mod, ctrl];
            return ctrlName.ap(moduleName.map(buildModuleCtrl));
        }
    }
    return Maybe.None<[string,string]>();
}

export interface ViewInfo {
    readonly fileName: string;
    readonly ngModuleName: Maybe<string>;
    readonly controllerName: Maybe<string>;
    readonly controllerViewInfos: ControllerViewInfo[]
}

export interface ControllerViewConnector {
    interceptAstNode: ts.SyntaxKind;
    getControllerView: (call: ts.Node, projectPath: string) => ControllerViewInfo[];
}

export function extractCtrlViewConnsAngularModule(
    fileName: string, webappPath: string,
    ctrlViewConnectors: ControllerViewConnector[]): Promise<ViewInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    let ngModuleName = Maybe.None<string>();
    let controllerName = Maybe.None<string>();
    let viewInfos:ControllerViewInfo[] = [];
    return new Promise((resolve, reject) => {
        function nodeExtractModuleOpenAngularModule(node: ts.Node) {
            if (node.kind == ts.SyntaxKind.CallExpression) {
                const viewInfo = parseModalOpen(<ts.CallExpression>node, webappPath);
                if (viewInfo.isSome()) {
                    viewInfos.push(viewInfo.some());
                }
            } else if (node.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                const linkInfo = parseModuleState(<ts.ObjectLiteralExpression>node, webappPath);
                if (linkInfo.isSome()) {
                    viewInfos.push(linkInfo.some());
                }
            } else if (controllerName.isNone() && node.kind == ts.SyntaxKind.ExpressionStatement) {
                const mCtrlNgModule = parseAngularModule(<ts.ExpressionStatement>node);
                ngModuleName = mCtrlNgModule.map(moduleCtrl => moduleCtrl[0]);
                controllerName = mCtrlNgModule.map(moduleCtrl => moduleCtrl[1]);
            }
            viewInfos = viewInfos.concat(
                List.fromArray(ctrlViewConnectors)
                    .filter(conn => conn.interceptAstNode === node.kind)
                    .flatMap(conn => List.fromArray(conn.getControllerView(node, webappPath)))
                    .toArray());
            ts.forEachChild(node, nodeExtractModuleOpenAngularModule);
        }
        nodeExtractModuleOpenAngularModule(sourceFile);
        const result: ViewInfo = {
            fileName: fileName,
            ngModuleName: ngModuleName,
            controllerName: controllerName,
            controllerViewInfos: viewInfos};
        resolve(result);
    });
}

export interface ScopeInfo {
    readonly contents: string;
    readonly fieldNames: string[];
}

export interface ControllerScopeInfo {
    readonly tsModuleName: Maybe<string>;
    readonly scopeInfo: Maybe<ScopeInfo>;
    readonly typeAliases: string[];
    readonly imports: string[];
    readonly nonExportedDeclarations: string[];
}

function nodeIsExported(node: ts.Node): boolean {
    return Maybe.fromNull(node.modifiers)
        .filter(modifiers => modifiers.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
        .isSome();
}

export function extractControllerScopeInfo(fileName: string): Promise<ControllerScopeInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return new Promise((resolve, reject) => {
        let intfInfo: Maybe<ScopeInfo> = Maybe.None<ScopeInfo>();
        let tsModuleName:string|null = null;
        let typeAliases:string[] = [];
        let imports:string[] = [];
        let nonExportedDeclarations:string[] = [];
        function nodeExtractScopeInterface(node: ts.Node) {
            if (node.kind === ts.SyntaxKind.InterfaceDeclaration && !nodeIsExported(node)) {
                const curIntfInfo = parseScopeInterface(<ts.InterfaceDeclaration>node);
                if (curIntfInfo.isSome()) {
                    intfInfo = curIntfInfo;
                } else {
                    nonExportedDeclarations.push(node.getText());
                }
            }
            if (node.kind === ts.SyntaxKind.ClassDeclaration && !nodeIsExported(node)) {
                nonExportedDeclarations.push(node.getText());
            }
            if (node.kind === ts.SyntaxKind.ModuleDeclaration) {
                const moduleLevel = (<ts.StringLiteral>(<ts.ModuleDeclaration>node).name).text;
                if (tsModuleName) {
                    tsModuleName += "." + moduleLevel;
                } else {
                    tsModuleName = moduleLevel;
                }
            }
            if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && !nodeIsExported(node)) {
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
            typeAliases: typeAliases,
            imports: imports,
            nonExportedDeclarations: nonExportedDeclarations
        });
    });
}
