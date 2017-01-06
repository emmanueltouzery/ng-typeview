import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe, List} from "monet";

function maybeWhen<T>(p: boolean, v: T): Maybe<T> {
    return p ? Maybe.Some(v) : Maybe.None<T>();
}

function parseScopeInterface(iface: ts.InterfaceDeclaration): Maybe<string> {
    return maybeWhen(iface.name.getText() === "Scope", iface.getText());
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

/**
 * Returned by [[ControllerViewConnector.getControllerView]]
 * Describes a connection between a controller (TS file)
 * and a view (HTML file).
 */
export interface ControllerViewInfo {
    /**
     * Name of an angular controller
     */
    readonly controllerName : string;
    /**
     * Path to an angular view (file name within the project,
     * NOT absolute path on disk).
     */
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

/**
 * @hidden
 */
export interface ViewInfo {
    readonly fileName: string;
    readonly ngModuleName: Maybe<string>;
    readonly controllerName: Maybe<string>;
    readonly controllerViewInfos: ControllerViewInfo[]
}

/**
 * You can register such a connector using [[ProjectSettings.ctrlViewConnectors]].
 * Will be called when parsing typescript files, allows you to tell ng-typeview
 * about connections between controllers and views made in your code, for instance
 * if you wrapped `$modal.open()` through your own helper classes or things like that.
 * For an example, check `ctrlViewConn` in `test/controller-parser.ts`.
 */
export interface ControllerViewConnector {
    /**
     * Which AST node you want to be listening for
     */
    interceptAstNode: ts.SyntaxKind;
    /**
     * When your view connector is registered and we parse a TS file and
     * ecounter an AST node with the type you specified through [[interceptAstNode]],
     * this function will be called.
     * @param node the AST node which matched your specification
     * @param projectPath the path of the project on disk
     * @returns the controller-view connections that you detected for this node,
     *     if any (the empty array if you didn't detect any).
     */
    getControllerView: (node: ts.Node, projectPath: string) => ControllerViewInfo[];
}

const modalOpenViewConnector : ControllerViewConnector = {
    interceptAstNode: ts.SyntaxKind.CallExpression,
    getControllerView: (node, projectPath) =>
        parseModalOpen(<ts.CallExpression>node, projectPath).toList().toArray()
};

const moduleStateViewConnector: ControllerViewConnector = {
    interceptAstNode: ts.SyntaxKind.ObjectLiteralExpression,
    getControllerView: (node, projectPath) =>
        parseModuleState(<ts.ObjectLiteralExpression>node, projectPath).toList().toArray()
};

/**
 * Default set of [[ControllerViewConnector]] which can recognize connections between
 * angular controllers and views from the typescript source.
 * You can give this list in [[ProjectSettings.ctrlViewConnectors]], or you can add
 * your own or provide your own list entirely.
 */
export const defaultCtrlViewConnectors = [modalOpenViewConnector, moduleStateViewConnector];

/**
 * @hidden
 */
export function extractCtrlViewConnsAngularModule(
    fileName: string, webappPath: string,
    ctrlViewConnectors: ControllerViewConnector[]): Promise<ViewInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    let ngModuleName = Maybe.None<string>();
    let controllerName = Maybe.None<string>();
    let controllerViewInfos:ControllerViewInfo[] = [];
    return new Promise<ViewInfo>((resolve, reject) => {
        function nodeExtractModuleOpenAngularModule(node: ts.Node) {
            if (controllerName.isNone() && node.kind == ts.SyntaxKind.ExpressionStatement) {
                const mCtrlNgModule = parseAngularModule(<ts.ExpressionStatement>node);
                ngModuleName = mCtrlNgModule.map(moduleCtrl => moduleCtrl[0]);
                controllerName = mCtrlNgModule.map(moduleCtrl => moduleCtrl[1]);
            }
            controllerViewInfos = controllerViewInfos.concat(
                List.fromArray(ctrlViewConnectors)
                    .filter(conn => conn.interceptAstNode === node.kind)
                    .flatMap(conn => List.fromArray(conn.getControllerView(node, webappPath)))
                    .toArray());
            ts.forEachChild(node, nodeExtractModuleOpenAngularModule);
        }
        nodeExtractModuleOpenAngularModule(sourceFile);
        resolve({fileName, ngModuleName, controllerName, controllerViewInfos});
    });
}

/**
 * @hidden
 */
export interface ControllerScopeInfo {
    readonly tsModuleName: Maybe<string>;
    readonly scopeInfo: Maybe<string>;
    readonly typeAliases: string[];
    readonly imports: string[];
    readonly importNames: string[];
    readonly nonExportedDeclarations: string[];
}

function nodeIsExported(node: ts.Node): boolean {
    return Maybe.fromNull(node.modifiers)
        .filter(modifiers => modifiers.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
        .isSome();
}

/**
 * @hidden
 */
export function extractControllerScopeInfo(fileName: string): Promise<ControllerScopeInfo> {
    const sourceFile = ts.createSourceFile(
        fileName, readFileSync(fileName).toString(),
        ts.ScriptTarget.ES2016, /*setParentNodes */ true);
    return new Promise<ControllerScopeInfo>((resolve, reject) => {
        let scopeInfo: Maybe<string> = Maybe.None<string>();
        let tsModuleName:string|null = null;
        let typeAliases:string[] = [];
        let imports:string[] = [];
        let importNames:string[] = [];
        let nonExportedDeclarations:string[] = [];
        function nodeExtractScopeInterface(node: ts.Node) {
            if (node.kind === ts.SyntaxKind.InterfaceDeclaration && !nodeIsExported(node)) {
                const curIntfInfo = parseScopeInterface(<ts.InterfaceDeclaration>node);
                if (curIntfInfo.isSome()) {
                    scopeInfo = curIntfInfo;
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
                importNames.push((<ts.ImportEqualsDeclaration>node).name.getText());
            }
            ts.forEachChild(node, nodeExtractScopeInterface);
        }
        nodeExtractScopeInterface(sourceFile);
        resolve({
            tsModuleName: Maybe.fromNull<string>(tsModuleName),
            scopeInfo, typeAliases, imports, importNames, nonExportedDeclarations
        });
    });
}
