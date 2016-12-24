import {Maybe} from "monet"
import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {Iterable, List, Stack} from "immutable";
import {VarType, AttributeDirectiveHandler, TagDirectiveHandler, DirectiveResponse} from "./ng-directives"

interface NgLoop {
    readonly xpathDepth: number;
    readonly closeSource: ()=>string;
    readonly handleAttr?: (attrN:string,attrV:string) => void;
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

function requireDefined<T>(x:T|undefined): T {
    if (typeof x === "undefined") {
        throw "unexpected undefined!";
    }
    return x;
}

function listKeepDefined<T>(l:Iterable<number,T|undefined>): Iterable<number, T> {
    return l.filter(x => x!==undefined).map(requireDefined);
}

function getHandler(
    fileName: string, addScopeAccessors: (js:string) => string,
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>, f: (expr: string) => void): Handler {
    let expressions: string = "";
    let xpath = Stack<string>();
    let activeLoops = Stack<NgLoop>();
    const registerVariable:(type:VarType,val:string)=>string = (type,val) =>
        `const ___x${v++}: ${type} = ${addScopeAccessors(val)};`;
    return {
        onopentag: (name: string, attribs:{[type:string]: string}) => {
            xpath = xpath.unshift(name);
            const relevantTagHandlers = tagDirectiveHandlers
                .filter(d => d.forTags.indexOf(name) >= 0);
            const tagDirectiveResps = relevantTagHandlers
                .map(handler => handler.handleTag(
                    name, addScopeAccessors, registerVariable));
            expressions += listKeepDefined(tagDirectiveResps)
                .map(x => x.source).join("");
            const maybeCloseSources = tagDirectiveResps
                .map(Maybe.fromNull).map(m => m.map(x => x.closeSource));

            // for each relevant tag handler, we already processed the tag itself,
            // but must now register the loops and process individual attributes.
            Iterable.Indexed(relevantTagHandlers).zip(maybeCloseSources)
                .forEach(([tagHandler, closeSrc]:[TagDirectiveHandler, Maybe<()=>string>]) => {
                    const tagHandleAttr = (attrN:string, attrV:string) => {
                        const directiveR = tagHandler.handleAttribute(
                            attrN, attrV, addScopeAccessors, registerVariable);
                        if (directiveR) {
                            expressions += directiveR.source;
                            if (directiveR.closeSource) {
                                activeLoops = activeLoops.unshift(
                                    {
                                        xpathDepth: xpath.size,
                                        closeSource: directiveR.closeSource
                                    });
                            }
                        }
                    };
                    activeLoops = activeLoops.unshift(
                        {
                            xpathDepth: xpath.size,
                            closeSource: closeSrc.orSome(()=>""),
                            handleAttr: tagHandleAttr
                        });
                    for (let attr in attribs) {
                        tagHandleAttr(attr, attribs[attr]);
                    }
                });
        },
        onclosetag: (name: string) => {
            if (xpath.first() !== name) {
                console.error(`${fileName}: expected </${xpath.first()}> but found </${name}>`);
            }
            xpath = xpath.shift();
            while (activeLoops.first() && activeLoops.first().xpathDepth >= xpath.size) {
                expressions += activeLoops.first().closeSource();
                activeLoops = activeLoops.shift();
            }
        },
        onattribute: (name: string, value: string) => {
            activeLoops.forEach(l => l.handleAttr && l.handleAttr(name, value));

            const attrDirectiveResps = listKeepDefined(attrDirectiveHandlers
                .filter(d => d.forAttributes.indexOf(name) >= 0)
                .map(handler => handler.handleAttribute(
                    name, value, addScopeAccessors, registerVariable)));
            expressions += attrDirectiveResps.map(x => x.source).join("");

            listKeepDefined(attrDirectiveResps
                            .map(x => x.closeSource))
                .forEach(closeSrc => activeLoops = activeLoops.unshift(
                    { xpathDepth: xpath.size, closeSource: closeSrc }));
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
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>) : Promise<string> {
    return new Promise((resolve, reject) => {
        const parser = new Parser(getHandler(
            fileName, addScopeAccessors,
            tagDirectiveHandlers, attrDirectiveHandlers, resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}
