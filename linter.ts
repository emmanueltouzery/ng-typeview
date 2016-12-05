/// <reference path="typings/node/node.d.ts" />
/// <reference path="node_modules/tsmonad/dist/tsmonad.d.ts" />

import {readFileSync} from "fs";
import * as ts from "typescript";
import {Maybe} from "tsmonad";

export function delint(sourceFile: ts.SourceFile) {
    // console.info(sourceFile.statements);
    delintNode(sourceFile);

    function naFind<T>(arr: ts.NodeArray<T>, f: (value: T) => boolean) : T|null {
        const filterRes = arr.filter(f);
        if (filterRes.length > 0) {
            return filterRes[0];
        } else {
            return null;
        }
    }

    function maybeCallExpression(input: ts.Node): Maybe<ts.CallExpression> {
        return (input.kind === ts.SyntaxKind.CallExpression)
            ? Maybe.just(input) : Maybe.nothing();
    }

    function maybePropertyAccessExpression(input: ts.Node): Maybe<ts.PropertyAccessExpression> {
        return (input.kind === ts.SyntaxKind.PropertyAccessExpression)
            ? Maybe.just(input) : Maybe.nothing();
    }

    function maybeIdentifier(input: ts.Node): Maybe<ts.Identifier> {
        return (input.kind === ts.SyntaxKind.Identifier)
            ? Maybe.just(input) : Maybe.nothing();
    }

    function maybeStringLiteral(input: ts.Node): Maybe<ts.StringLiteral> {
        return (input.kind === ts.SyntaxKind.StringLiteral)
            ? Maybe.just(input) : Maybe.nothing();
    }

    interface ControllerViewInfo {
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
        // const expr = callExpr.expression;
        // console.log(callExpr.expression.getText());
        // console.log(callExpr);
        // console.log("name => " + callExpr.name);
        // if (typeof callExpr.name == 'Identifier') {
        //     const identifier = <ts.Identifier>callExpr.name;
        //     const identifierText = identifier.text;
        //     console.log(identifierText);
        // }
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
                    .bind(c => maybeStringLiteral(c.arguments[0]))
                    .map(a => a.text);
                console.log("name => " + nme.valueOr(null));
            }
        }
    }

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

    function delintNode(node: ts.Node) {
        // console.info(node);
        // console.info(node.kind);

        if (node.kind == ts.SyntaxKind.CallExpression) {
            console.info(parseModalOpen(<ts.CallExpression>node));
        }
        if (node.kind == ts.SyntaxKind.ExpressionStatement) {
            parseAngularModule(<ts.ExpressionStatement>node);
        }
        if (node.kind == ts.SyntaxKind.InterfaceDeclaration) {
            console.info(parseScopeInterface(<ts.InterfaceDeclaration>node));
        }

        // if (node.kind == ts.SyntaxKind.PropertyAccessExpression) {
        //     console.info("EXPR=>" + (<ts.PropertyAccessExpression>node).name.text);
        // }

        // switch (node.kind) {
        //     case ts.SyntaxKind.ForStatement:
        //     case ts.SyntaxKind.ForInStatement:
        //     case ts.SyntaxKind.WhileStatement:
        //     case ts.SyntaxKind.DoStatement:
        //         if ((<ts.IterationStatement>node).statement.kind !== ts.SyntaxKind.Block) {
        //             report(node, "A looping statement's contents should be wrapped in a block body.");
        //         }
        //         break;

        //     case ts.SyntaxKind.IfStatement:
        //         let ifStatement = (<ts.IfStatement>node);
        //         if (ifStatement.thenStatement.kind !== ts.SyntaxKind.Block) {
        //             report(ifStatement.thenStatement, "An if statement's contents should be wrapped in a block body.");
        //         }
        //         if (ifStatement.elseStatement &&
        //             ifStatement.elseStatement.kind !== ts.SyntaxKind.Block &&
        //             ifStatement.elseStatement.kind !== ts.SyntaxKind.IfStatement) {
        //             report(ifStatement.elseStatement, "An else statement's contents should be wrapped in a block body.");
        //         }
        //         break;

        //     case ts.SyntaxKind.BinaryExpression:
        //         let op = (<ts.BinaryExpression>node).operatorToken.kind;
        //         if (op === ts.SyntaxKind.EqualsEqualsToken || op == ts.SyntaxKind.ExclamationEqualsToken) {
        //             report(node, "Use '===' and '!=='.")
        //         }
        //         break;
        // }

        ts.forEachChild(node, delintNode);

        // console.info(delintNode);
    }

    function report(node: ts.Node, message: string) {
        let { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        console.log(`${sourceFile.fileName} (${line + 1},${character + 1}): ${message}`);
    }
}

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
    // Parse a file
    let sourceFile = ts.createSourceFile(fileName, readFileSync(fileName).toString(), ts.ScriptTarget.ES6, /*setParentNodes */ true);

    // delint it
    delint(sourceFile);
});
