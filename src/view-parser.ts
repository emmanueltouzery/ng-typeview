import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List, Stack} from "immutable";

export class ParsedVariable {
    constructor(public readonly expr: string, public readonly type: VariableType) {}
};
export type VariableType = "boolean" | "any"

export class LoopStart {
    constructor(public readonly loopExpr: string) {}
}
export class LoopEnd {};
export class FilterExpression {
    constructor(public readonly filterName:string,
                public readonly filterInput:string,
                public readonly filterParams: string[]) {}
}

export type ParsedExpression = ParsedVariable | LoopStart | LoopEnd | FilterExpression;

interface AttributeHandler {
    readonly attrNames: string[],
    readonly getVariables: (val: string) => ParsedVariable[]
}

const boolAttrHandler: AttributeHandler = {
    attrNames: ["ng-show", "ng-if", "ng-required"],
    getVariables: val => [new ParsedVariable(val, "boolean")]
};

const anyAttrHandler: AttributeHandler = {
    attrNames: ["ng-click", "ng-model", "ng-change"],
    getVariables: val => [new ParsedVariable(val, "any")]
};

const attributeHandlers = List.of(boolAttrHandler, anyAttrHandler);

interface NgLoop { readonly xpathDepth: number; }

function extractInlineExpressions(text: string): ParsedExpression[] {
    const re = /{{([^}]+)}}/g; // anything inside {{}}, multiple times
    let m: RegExpExecArray|null;
    let result: ParsedExpression[] = [];
    while (m = re.exec(text)) {
        const expr: string = m[1];
        if (expr.indexOf("|") < 0) {
            result.push(new ParsedVariable(m[1], "any"));
        } else {
            let [input, filter] = expr.split("|");
            let [filterName, ...filterParams] = filter.split(":");
            result.push(new FilterExpression(
                filterName.trim(), input.trim(), filterParams.map(x => x.trim())));
        }
    }
    return result;
}

function getHandler(fileName: string, f: (expr: ParsedExpression[]) => void): Handler {
    let expressions: ParsedExpression[] = [];
    let xpath = Stack<string>();
    let activeLoops = Stack<NgLoop>();
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
                expressions.push(new LoopStart(value));
            }
            expressions = expressions.concat(
                attributeHandlers
                    .filter(attrHandler => attrHandler.attrNames.indexOf(name) >= 0)
                    .flatMap<number,ParsedExpression>(handler => handler.getVariables(value))
                    .toArray());
            expressions = expressions.concat(extractInlineExpressions(value));
        },
        ontext: (text: string) => {
            expressions = expressions.concat(extractInlineExpressions(text));
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
