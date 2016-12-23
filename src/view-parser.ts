import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {List, Stack} from "immutable";
import {VarType, Attributes, DirectiveHandler} from "./ng-directives"

interface NgLoop {
    readonly xpathDepth: number;
    readonly closeSource: ()=>string;
}

var v: number = 0;

function extractInlineExpressions(
    text: string, addScopeAccessors: (x:string) => string,
    registerVariable:(type:VarType,val:string)=>string): string {
    const re = /{{([^}]+)}}/g; // anything inside {{}}, multiple times
    let m: RegExpExecArray|null;
    let result: string = "";
    while (m = re.exec(text)) {
        const expr: string = m[1];
        if (expr.indexOf("|") < 0) {
            result += registerVariable("any", m[1]);
        } else {
            let [input, filter] = expr.split("|");
            let [filterName, ...filterParams] = filter.split(":");

            const fParams = [addScopeAccessors(input.trim())]
                .concat(filterParams.map(x => x.trim())).join(", ")
            result += `f__${filterName.trim()}(${fParams});`;
        }
    }
    return result;
}

function getHandler(
    fileName: string, addScopeAccessors: (js:string) => string,
    directiveHandlers: List<DirectiveHandler>, f: (expr: string) => void): Handler {
    let expressions: string = "";
    let xpath = Stack<string>();
    let activeLoops = Stack<NgLoop>();
    const registerVariable:(type:VarType,val:string)=>string = (type,val) =>
        `const ___x${v++}: ${type} = ${addScopeAccessors(val)};`;
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
                expressions += activeLoops.first().closeSource();
                activeLoops = activeLoops.shift();
            }
        },
        onattribute: (name: string, value: string) => {
            const directiveResps = directiveHandlers
                .filter(d => d.forAttributes.attrNames.indexOf(name) >= 0)
                .map(handler => handler.handleTagAttribute(
                    name, value, addScopeAccessors, registerVariable));
            expressions += directiveResps.map(x => x.source).join("");
            directiveResps
                .map(x => x.closeSource)
                .filter(x => x.isSome())
                .forEach(closeSrc => activeLoops = activeLoops.unshift(
                    { xpathDepth: xpath.size, closeSource: closeSrc.some() }));
            expressions += extractInlineExpressions(
                value, addScopeAccessors, registerVariable);
        },
        ontext: (text: string) => {
            expressions = expressions.concat(extractInlineExpressions(
                text, addScopeAccessors, registerVariable));
        },
        onend: () => {
            f(indentSource(expressions));
        }
    };
}

function indentSource(src: string): string {
    const multiple: number = 4;
    let depth: number = 1;
    let inSingleQuotes: boolean = false;
    let inDoubleQuotes: boolean = false;
    const addCr: ()=>string = () => "\n" + " ".repeat(depth*multiple);
    let result: string = " ".repeat(depth*multiple);
    for (let i:number = 0;i<src.length;i++) {
        const chr = src[i];
        if (inSingleQuotes) {
            if (chr === "'") {
                inSingleQuotes = false;
            }
            result += chr;
        } else if (inDoubleQuotes) {
            if (chr === '"') {
                inDoubleQuotes = false;
            }
            result += chr;
        } else {
            if (chr === "'") {
                result += "'";
                inSingleQuotes = true;
            } else if (chr === '"') {
                result += '"';
                inDoubleQuotes = true;
            } else if (chr === ';') {
                result += ";" + addCr();
            } else if (chr === '{') {
                ++depth;
                result += "{" + addCr();
            } else if (chr === '}') {
                --depth;
                result +=  addCr() + "}";
            } else {
                result += chr;
            }
        }
    }
    return result;
}

export function parseView(
    fileName: string, addScopeAccessors: (js:string) => string,
    directiveHandlers: List<DirectiveHandler>) : Promise<string> {
    return new Promise((resolve, reject) => {
        const parser = new Parser(getHandler(
            fileName, addScopeAccessors, directiveHandlers, resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}
