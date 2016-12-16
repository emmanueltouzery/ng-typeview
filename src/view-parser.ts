import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List, Stack} from "immutable";

export class ParsedVariable {
    constructor(public expr: string, public type: VariableType) {}
};
export type VariableType = "boolean" | "any"

export class LoopStart {
    constructor(public loopExpr: string) {}
}
export class LoopEnd {};

export type ParsedExpression = ParsedVariable | LoopStart | LoopEnd;

interface AttributeHandler {
    attrNames: string[],
    getVariables: (val: string) => ParsedVariable[]
}

const boolAttrHandler: AttributeHandler = {
    attrNames: ["ng-show", "ng-if", "ng-required"],
    getVariables: val => [new ParsedVariable(val, "boolean")]
};

const anyAttrHandler: AttributeHandler = {
    attrNames: ["ng-click", "ng-model"],
    getVariables: val => [new ParsedVariable(val, "any")]
};

const attributeHandlers = List.of(boolAttrHandler, anyAttrHandler);

interface NgLoop { xpathDepth: number; }

function getHandler(fileName: string, f: (expr: ParsedExpression[]) => void): Handler {
    var expressions: ParsedExpression[] = [];
    var xpath = Stack<string>();
    var activeLoops = Stack<NgLoop>();
    return {
        onopentag: (name: string, attribs:{[type:string]: string}) => {
            xpath = xpath.unshift(name);
        },
        onclosetag: (name: string) => {
            if (xpath.first() !== name) {
                console.error(`${fileName}: expected </${xpath.first()}> but found </${name}>`);
            }
            xpath = xpath.shift();
            if (activeLoops.first() && activeLoops.first().xpathDepth === xpath.size) {
                activeLoops = activeLoops.shift();
                expressions.push(new LoopEnd());
            }
        },
        onattribute: (name: string, value: string) => {
            if (["ng-repeat", "data-ng-repeat"].indexOf(name) >= 0) {
                activeLoops = activeLoops.unshift({ xpathDepth: xpath.size });
                expressions.push(new LoopStart(`for (${value}) {`));
            }
            expressions = expressions.concat(
                attributeHandlers
                    .filter(attrHandler => attrHandler.attrNames.indexOf(name) >= 0)
                    .flatMap<number,ParsedExpression>(handler => handler.getVariables(value))
                    .toArray());
        },
        onend: () => {
            f(expressions);
        }
    };
}

export function parseView(fileName: string): Promise<ParsedExpression[]> {
    return new Promise((resolve, reject) => {
        const parser = new Parser(getHandler(fileName, resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}

async function fetch(fileName: string) {
    let r = await parseView(fileName);
}

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
    fetch(fileName);
});
