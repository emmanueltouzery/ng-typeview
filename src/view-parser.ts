import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List} from "immutable";

export type ParsedExpression = {expr: string, type: ExpressionType};
export type ExpressionType = "boolean" | "any"

interface AttributeHandler {
    attrName: string,
    getExpressions: (val: string) => ParsedExpression[]
}

function boolAttrHandler(attrName: string): AttributeHandler {
    return {
        attrName: attrName,
        getExpressions: val => [{expr: val, type: "boolean"}]
    };
}

function anyAttrHandler(attrName: string): AttributeHandler {
    return {
        attrName: attrName,
        getExpressions: val => [{expr: val, type: "any"}]
    };
}

const attributeHandlers = List.of(
    boolAttrHandler("ng-show"), boolAttrHandler("ng-if"),
    boolAttrHandler("ng-required"),
    anyAttrHandler("ng-click"), anyAttrHandler("ng-model"));

function writeExpression(expr: ExpressionType): void {
    console.log(expr);
}

function getHandler(f: (expr: ParsedExpression[]) => void): Handler {
    var expressions: ParsedExpression[] = [];
    return {
        // onopentag: (name: string, attribs:{[type:string]: string}) => {
        //     console.log("tag open " + name);
        // },
        onattribute: (name: string, value: string) => {
            expressions = expressions.concat(
                attributeHandlers
                    .filter(attrHandler => attrHandler.attrName === name)
                    .flatMap<number,ParsedExpression>(handler => handler.getExpressions(value))
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
    // console.log(r);
}

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
    // parseView(fileName).then(expr => console.log(expr));

    // parseView(fileName).then(expr => console.log(expr));

    fetch(fileName);

    // parser.write(readFileSync(fileName).toString());
});
// parser.done();
