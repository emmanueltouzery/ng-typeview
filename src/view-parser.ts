import {Maybe} from "monet"
import {Parser, Handler} from "htmlparser2";
import {readFileSync} from "fs";
import {Iterable, List, Stack} from "immutable";
import {AttributeDirectiveHandler, TagDirectiveHandler, DirectiveResponse} from "./ng-directives"
import {filterExpressionToTypescript, CodegenHelper, addScopeAccessors} from "./view-ngexpression-parser"

/**
 * @hidden
 */
export interface NgScope {
    readonly xpathDepth: number;
    readonly closeSource: ()=>string;
    readonly variables: string[];
}

var v: number = 0;

function extractInlineExpressions(
    text: string, codegenHelpers: CodegenHelper): string {
    const re = /{{([^}]+)}}/g; // anything inside {{}}, multiple times
    let m: RegExpExecArray|null;
    let result: string = "";
    while (m = re.exec(text)) {
        const expr: string = m[1];
        result += filterExpressionToTypescript(expr, codegenHelpers);
    }
    return result;
}

/**
 * @hidden
 */
export function requireDefined<T>(x:T|undefined): T {
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

function handleDirectiveResponses(xpath: Stack<string>,
                                  codegenHelpers: CodegenHelper,
                                  resps: Iterable<number,DirectiveResponse>)
                                  : Iterable<number,NgScope> {
    return resps
        .filter(x => x.closeSource !== undefined ||
                codegenHelpers.ngScopeInfo.curScopeVars.length > 0)
        .map(r => (
            {
                xpathDepth: xpath.size,
                closeSource: r.closeSource || (() => ""),
                variables: codegenHelpers.ngScopeInfo.curScopeVars
            }));
}

function getHandler(
    fileName: string, defaultScope: string[],
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>,
    f: (expr: string) => void): Handler {
    let expressions: string = "";
    let xpath = Stack<string>();
    let activeScopes = Stack<NgScope>([{
        xpathDepth: 0,
        closeSource: ()=>"",
        variables: defaultScope
    }]);
    const getNewVariableName = () => `___x${v++}`;
    return {
        onopentag: (_name: string, _attribs:{[type:string]: string}) => {
            const name = normalizeTagAttrName(_name);
            const attribs:{[type:string]: string} = {};
            for (let k in _attribs) {
                attribs[normalizeTagAttrName(k)] = _attribs[k];
            }
            xpath = xpath.unshift(name);

            // work on tag handlers
            const codegenHelpersTag = new CodegenHelper(activeScopes, getNewVariableName);
            const relevantTagHandlers = tagDirectiveHandlers
                .filter(d => d.forTags.length === 0 || d.forTags.indexOf(name) >= 0);
            const tagDirectiveResps = listKeepDefined(relevantTagHandlers.map(
                handler => handler.handleTag(name, attribs, codegenHelpersTag)));
            expressions += tagDirectiveResps.map(x => x.source).join("");
            activeScopes = activeScopes.unshiftAll(
                handleDirectiveResponses(xpath, codegenHelpersTag, tagDirectiveResps));

            // work on attribute handlers
            for (let attrName in attribs) {
                const codegenHelpersAttr = new CodegenHelper(activeScopes, getNewVariableName);
                const attrValue = attribs[attrName];

                const attrDirectiveResps = listKeepDefined(
                    attrDirectiveHandlers
                        .filter(d => d.forAttributes.indexOf(attrName) >= 0)
                        .map(handler => handler.handleAttribute(attrName, attrValue, codegenHelpersAttr)));
                expressions += attrDirectiveResps.map(x => x.source).join("");

                activeScopes = activeScopes.unshiftAll(
                    handleDirectiveResponses(xpath, codegenHelpersAttr, attrDirectiveResps));
                expressions += extractInlineExpressions(attrValue, codegenHelpersAttr);
            }
        },
        onclosetag: (name: string) => {
            if (xpath.first() !== name) {
                console.error(`${fileName}: expected </${xpath.first()}> but found </${name}>`);
            }
            xpath = xpath.shift();
            while (activeScopes.first() && activeScopes.first().xpathDepth > xpath.size) {
                expressions += activeScopes.first().closeSource();
                activeScopes = activeScopes.shift();
            }
        },
        ontext: (text: string) => {
            const codegenHelpers = new CodegenHelper(activeScopes, getNewVariableName);
            expressions = expressions.concat(
                extractInlineExpressions(text, codegenHelpers));
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
export function parseView(resolveImportsAsNonScope: boolean,
    fileName: string, importNames: string[],
    tagDirectiveHandlers: List<TagDirectiveHandler>,
    attrDirectiveHandlers: List<AttributeDirectiveHandler>) : Promise<string> {
    const defaultScope = resolveImportsAsNonScope ? importNames : [];
    return new Promise<string>((resolve, reject) => {
        const parser = new Parser(getHandler(
            fileName, defaultScope,
            tagDirectiveHandlers, attrDirectiveHandlers, resolve));
        parser.write(readFileSync(fileName).toString());
        parser.done();
    });
}
