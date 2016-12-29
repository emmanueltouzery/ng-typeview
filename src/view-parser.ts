import {Maybe} from "monet"
import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {Iterable, List, Stack} from "immutable";
import {AttributeDirectiveHandler, TagDirectiveHandler, DirectiveResponse} from "./ng-directives"
import {filterExpressionToTypescript} from "./view-ngexpression-parser"

interface NgLoop {
    readonly xpathDepth: number;
    readonly closeSource: ()=>string;
}

var v: number = 0;

function extractInlineExpressions(
    text: string, addScopeAccessors: (x:string) => string,
    registerVariable:(type:string,val:string)=>string): string {
    const re = /{{([^}]+)}}/g; // anything inside {{}}, multiple times
    let m: RegExpExecArray|null;
    let result: string = "";
    while (m = re.exec(text)) {
        const expr: string = m[1];
        result += filterExpressionToTypescript(expr, registerVariable, addScopeAccessors);
    }
    return result;
}

function requireDefined<T>(x:T|undefined): T {
    if (typeof x === "undefined") {
        throw "unexpected undefined!";
    }
    return x;
}

function listKeepDefined<T>(l:Iterable<number,T|undefined>): Iterable<number, T> {
    return l.filter(x => x!==undefined).map(requireDefined);
}

/**
 * http://stackoverflow.com/a/16184477/516188
 * @hidden
 */
export function normalizeTagAttrName(name: string): string {
    return name
        .replace("_", "-")
        .replace(":", "-")
        .replace(/^x\-/, "")
        .replace(/^data\-/, "")
        .replace(/([A-Z])/g, l => "-" + l.toLowerCase());
}

function getHandler(
    fileName: string, addScopeAccessors: (js:string) => string,
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>, f: (expr: string) => void): Handler {
    let expressions: string = "";
    let xpath = Stack<string>();
    let activeLoops = Stack<NgLoop>();
    const registerVariable:(type:string,val:string)=>string = (type,val) => {
        if (val.length > 0) {
            return `const ___x${v++}: ${type} = ${addScopeAccessors(val)};`;
        } else {
            return ""; // angular tolerates empty attributes and ignores them, for instance ng-submit=""
        }
    }
    return {
        onopentag: (_name: string, _attribs:{[type:string]: string}) => {
            const name = normalizeTagAttrName(_name);
            const attribs:{[type:string]: string} = {};
            for (let k in _attribs) {
                attribs[normalizeTagAttrName(k)] = _attribs[k];
            }
            xpath = xpath.unshift(name);

            // work on tag handlers
            const relevantTagHandlers = tagDirectiveHandlers
                .filter(d => d.forTags.length === 0 || d.forTags.indexOf(name) >= 0);
            const tagDirectiveResps = listKeepDefined(relevantTagHandlers
                .map(handler => handler.handleTag(
                    name, attribs, addScopeAccessors, registerVariable)));
            expressions += tagDirectiveResps
                .map(x => x.source).join("");
            tagDirectiveResps
                .filter(x => x.closeSource !== undefined)
                .forEach(r => activeLoops = activeLoops.unshift(
                    {
                        xpathDepth: xpath.size,
                        closeSource: requireDefined(r.closeSource)
                    }));

            // work on attribute handlers
            for (let attrName in attribs) {
                const attrValue = attribs[attrName];

                const attrDirectiveResps = listKeepDefined(
                    attrDirectiveHandlers
                        .filter(d => d.forAttributes.indexOf(attrName) >= 0)
                        .map(handler => handler.handleAttribute(
                            attrName, attrValue, addScopeAccessors, registerVariable)));
                expressions += attrDirectiveResps.map(x => x.source).join("");

                listKeepDefined(attrDirectiveResps
                                .map(x => x.closeSource))
                    .forEach(closeSrc => {
                        activeLoops = activeLoops.unshift(
                            { xpathDepth: xpath.size, closeSource: closeSrc })});
                expressions += extractInlineExpressions(
                    attrValue, addScopeAccessors, registerVariable);
            }
        },
        onclosetag: (name: string) => {
            if (xpath.first() !== name) {
                console.error(`${fileName}: expected </${xpath.first()}> but found </${name}>`);
            }
            xpath = xpath.shift();
            while (activeLoops.first() && activeLoops.first().xpathDepth > xpath.size) {
                expressions += activeLoops.first().closeSource();
                activeLoops = activeLoops.shift();
            }
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
    let previousIsEndBlock = false;
    const addCr: ()=>string = () => "\n" + " ".repeat(depth*multiple);
    let result: string = " ".repeat(depth*multiple);
    for (let i:number = 0;i<src.length;i++) {
        const chr = src[i];
        if (previousIsEndBlock && [';', ')'].indexOf(chr)<0) {
            result += addCr();
        }
        previousIsEndBlock = false;
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
                previousIsEndBlock = true;
            } else {
                result += chr;
            }
        }
    }
    return result;
}

/**
 * @hidden
 */
export function parseView(
    fileName: string, addScopeAccessors: (js:string) => string,
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>) : Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const parser = new Parser(getHandler(
            fileName, addScopeAccessors,
            tagDirectiveHandlers, attrDirectiveHandlers, resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}
