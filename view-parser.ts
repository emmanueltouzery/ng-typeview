//  <reference path="typings/globals/html2parser2/index.d.ts"

// var htmlparser = require("htmlparser2");
import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List} from "immutable";

export type ParsedExpression = {expr: string, type: ExpressionType};
export type ExpressionType = "boolean" | "any"

interface AttributeHandler {
    attrName: string,
    getExpressions: (val: string) => ParsedExpression[]
}

const ngShowAttributeHandler = {
    attrName: "ng-show",
    getExpressions: val => [{expr: val, type: "boolean"}]
};

const ngClickAttributeHandler = {
    attrName: "ng-click",
    getExpressions: val => [{expr: val, type: "any"}]
}

const attributeHandlers = List.of(
    ngShowAttributeHandler, ngClickAttributeHandler);

function writeExpression(expr: ExpressionType): void {
    console.log(expr);
}

function getHandler(f: (expr: ParsedExpression[]) => void): Handler {
    var expressions = [];
    return {
        // onopentag: (name: string, attribs:{[type:string]: string}) => {
        //     console.log("tag open " + name);
        // },
        onattribute: (name: string, value: string) => {
            expressions = expressions.concat(
                attributeHandlers
                    .filter(attrHandler => attrHandler.attrName === name)
                    .flatMap(handler => handler.getExpressions(value))
                    .toArray());
        },
        onend: () => {
            f(expressions);
        }
    };
}

export function parseView(fileName: string): Promise<ParsedExpression[]> {
    return new Promise((resolve, reject) => {
        const parser = new Parser(getHandler(resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}

async function fetch(fileName: string) {
    let r = await parseView(fileName);
    console.log(r);
}

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
    // parseView(fileName).then(expr => console.log(expr));

    // parseView(fileName).then(expr => console.log(expr));

    fetch(fileName);

    // parser.write(readFileSync(fileName).toString());
});
// parser.done();
