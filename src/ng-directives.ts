import {Option} from "prelude-ts";
import * as P from "parsimmon"

import {filterExpressionToTypescript, parseNgFilterExpression,
        NgFilterExpression, ngFilterExpressionToTypeScriptStandalone,
        ngFilterExpressionToTypeScriptEmbedded, keyword, parseAtom,
        CodegenHelper
       } from "./view-ngexpression-parser"

/**
 * When handling an angular directive, you can generate TS source code for
 * type-safety testing. This is what your directive can return to ng-typeview.
 */
export interface DirectiveResponse {
    /**
     * The code you want to insert in the generated typescript
     */
    source: string;
    /**
     * An optional function returning the code that'll be inserted
     * when this tag gets closed (typically you'll give nothing,
     * or `}` or `})` for instance).
     */
    closeSource?: ()=>string;
};

/**
 * Allows to handle a specific angular directive, which is tied to an attribute
 * (so, not tied to any particular HTML tag). For instance `<ANY ng-repeat>`.
 */
export interface AttributeDirectiveHandler {
    /**
     * List of attribute names which will trigger this handler. You must
     * use the ng-xxx syntax here (other forms present in your application's
     * source will get normalized to this syntax, so it'll match).
     */
    forAttributes: string[];
    /**
     * handle a certain attribute appearing in the view.
     * @param attrName The normalized name of the attribute (always in the form ng-xxx)
     * @param attrValue The value for the attribute
     * @param allAttribs The value of all the attributes on that node
     * @param codegenHelpers Object containing helper functions
     *     to assist with typescript code generation
     * @returns The TS source to generate for that attribute, and the closing source if needed.
     *     You can also return `undefined` in case you don't want to handle the attribute.
     */
    handleAttribute(
        attrName: string, attrValue: string, allAttribs: {[type:string]: string},
        codegenHelpers: CodegenHelper): DirectiveResponse|undefined;
}

/**
 * Allows to handle a specific angular directive, which tied to a specific
 * HTML tag. For instance `ui-select`.
 */
export interface TagDirectiveHandler {
    /**
     * List of attributes this tag directive may handle. Used for the
     * 'unhandled attribute' warning.
     */
    canHandleAttributes: string[];
    /**
     * List of tag names which will trigger this handler. You must use the
     * ng-xxx syntax here (other forms present in your application's source
     * will get normalized to this syntax, so it'll match).
     * NOTE: If you return the empty list here, you will be called for every tag.
     */
    forTags: string[];
    /**
     * handle a certain tag appearing in the view.
     * @param tagName The normalized name of the tag (always in the form ng-xxx)
     * @param attribs A dictionary object, the keys being the normalized (ng-xxx)
     *     attribute names, the value the attribute values
     * @param codegenHelpers Object containing helper functions
     *     to assist with typescript code generation
     * @returns The TS source to generate for that attribute, and the closing source if needed.
     *     You can also return `undefined` in case you don't want to handle the tag.
     */
    handleTag(
        tagName: string, attribs:{[type:string]: string},
        codegenHelpers: CodegenHelper): DirectiveResponse|undefined;
}

const boolAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-required", "ng-disabled", "ng-trim", "ng-checked"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("boolean", val) })
};

// ng-show and ng-if introduce a scope. The reason is flow-control in typescript:
// if (variable.kind === ...) { /* typescript now knows the kind is X */ }
const boolWithScopeAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-show", "ng-if"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) =>
        ({
            source: codegenHelpers.declareVariable("boolean", val) +
                `if (${codegenHelpers.addScopeAccessors(val)}) {`,
            closeSource: () => "}"
        })
};

const anyAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-model", "ng-change", "ng-value",
                    "ng-submit", "ng-class", "ng-style", "ng-init", "ng-grid"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("any", val) })
};

// attributes for which we do nothing at all.
const passThroughAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-form"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) => ({ source: ""})
};

const stringAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-include"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("string", val) })
};

const numberAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-maxlength"],
    handleAttribute: (attrName, val, allAttribs, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("number", val) })
};

const ngBindAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-bind", "ng-bind-html"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            return {source: filterExpressionToTypescript(attrValue, codegenHelpers)};
        }
};

interface NgRepeatData {
    readonly variable: string;
    readonly expression: NgFilterExpression;
    readonly trackingExpression?: string;
}

function parseNgRepeat(): P.Parser<NgRepeatData> {
    return parseAtom()
        .chain(variable => keyword("in")
               .then(parseNgFilterExpression())
               .chain(expression => parseNgOptionsTrackBy().atMost(1)
                      .map(trackBy => {
                          const r: NgRepeatData = {
                              variable, expression,
                              trackingExpression: trackBy ? trackBy[0] : undefined
                          };
                          return r;
                      })))
}

function handleNgRepeat(attrValue: string, codegenHelpers: CodegenHelper): string|null {
    const ngRepeatData = parseNgRepeat().parse(attrValue);
    if (!ngRepeatData.status) {
        console.warn("failed parsing a ng-repeat clause!");
        console.warn(attrValue);
        console.warn(ngRepeatData);
        return null;
    }

    const enumerable = ngFilterExpressionToTypeScriptEmbedded(
        ngRepeatData.value.expression, codegenHelpers);

    // so here we have a hack to be able to support scenarios like
    // "(k,v) in data" -- if there are no spaces in the expression,
    // we actually parse it as one, variable name being "(k,v)".
    // We should fix the parsing but... I just take it as-is then
    // split in two variables "k" and "v", then hack around the iteration
    // to make it work the way angular does it.
    const shouldSplitVar = ngRepeatData.value.variable.startsWith("(") &&
        ngRepeatData.value.variable.endsWith(")");
    const keysIfSplit = (x:string) => shouldSplitVar ? `Object.keys(${x})` : x;
    let splitterExpr = "";
    if (shouldSplitVar) {
        const vars = ngRepeatData.value.variable.substring(1, ngRepeatData.value.variable.length-1).split(",");
        vars.forEach((v,idx) => codegenHelpers.registerVariable(v));
        let [k,v] = vars;
        splitterExpr = `const ${k} = curKey; const ${v} = ${enumerable}[curKey];`;
    }
    const repeatVarExpr = shouldSplitVar ? "curKey" : codegenHelpers.registerVariable(ngRepeatData.value.variable);

    const source =`angular.forEach(${keysIfSplit(enumerable)}, ${repeatVarExpr} => {` +
        `let ${codegenHelpers.registerVariable('$index')} = 0;` +
        `let ${codegenHelpers.registerVariable('$first')} = true;` +
        `let ${codegenHelpers.registerVariable('$middle')} = true;` +
        `let ${codegenHelpers.registerVariable('$last')} = true;` +
        `let ${codegenHelpers.registerVariable('$even')} = true;` +
        `let ${codegenHelpers.registerVariable('$odd')} = false;` +
        `${splitterExpr}` +
        (ngRepeatData.value.trackingExpression ?
         `${codegenHelpers.declareVariable('any', ngRepeatData.value.trackingExpression)}` : "");
    return source;
}

const ngRepeatAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            const source = handleNgRepeat(attrValue, codegenHelpers);
            if (source === null) {
                return {source: ""};
            }
            return {
                source,
                closeSource: () => "});"
            };
        }
};

const ngRepeatStartAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat-start"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            const source = handleNgRepeat(attrValue, codegenHelpers);
            if (source === null) {
                return {source: ""};
            }
            if (allAttribs["ng-repeat-end"] !== undefined) {
                return {
                    source,
                    closeSource: () => "});"
                };
            }
            return {
                source
            };
        }
};

const ngRepeatEndAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat-end"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            if (allAttribs["ng-repeat-start"] !== undefined) {
                return { source: "" };
            }
            return {
                source: "});"
            };
        }
};

// https://docs.angularjs.org/api/ng/directive/ngOptions
interface NgOptionsData {
    readonly select?: NgFilterExpression;
    readonly label: NgFilterExpression;
    readonly value: string;
    readonly array: NgFilterExpression;
    readonly trackexpr?: string;
}

function parseNgOptions(): P.Parser<NgOptionsData> {
    return parseNgFilterExpression()
        .chain(first => parseNgOptionsAs(first).or(parseNgOptionsFor({ label: first})));
}

function maybeBracketed<T>(next: P.Parser<T>): P.Parser<T> {
    return P.regexp(/\s*\(\s*/).then(next).skip(P.regexp(/\s*\)/))
        .or(next);
}

function parseNgOptionsAs(select: NgFilterExpression): P.Parser<NgOptionsData> {
    return keyword("as")
        .then(maybeBracketed(parseNgFilterExpression()))
        .chain(label => parseNgOptionsFor({select, label}));
}

function parseNgOptionsFor(expressions: {label:NgFilterExpression,select?:NgFilterExpression}): P.Parser<NgOptionsData> {
    return keyword("for")
        .then(P.takeWhile(c => c !== ' ').skip(keyword("in")))
        .chain(value => parseNgFilterExpression()
               .chain(array => parseNgOptionsTrackBy().atMost(1)
                      .map(trackBy => {
                          const r: NgOptionsData = {
                              select: expressions.select,
                              label: expressions.label,
                              value: value,
                              array: array,
                              trackexpr: trackBy ? trackBy[0] : undefined
                          };
                          return r;
                      })));
}

function parseNgOptionsTrackBy(): P.Parser<string> {
    return P.regexp(/\s+track\s+by\s+/).then(P.all);
}

const ngOptions: AttributeDirectiveHandler = {
    forAttributes: ["ng-options"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            const ngOptionsData = parseNgOptions().parse(attrValue);
            if (!ngOptionsData.status) {
                console.warn("failed parsing a ng-options clause!");
                console.warn(attrValue);
                console.warn(ngOptionsData);
                return {source: ""};
            }
            const addVar = (v:string|undefined) => (v ? `${codegenHelpers.declareVariable('any', v)}` : "");
            const addNgVar = (v:NgFilterExpression|undefined) =>
                (v ? ngFilterExpressionToTypeScriptStandalone(v, codegenHelpers) : "");
            const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                ngOptionsData.value.array, codegenHelpers);
            const source = `angular.forEach(${enumerable}, ${codegenHelpers.registerVariable(ngOptionsData.value.value)} => {` +
                addNgVar(ngOptionsData.value.select) +
                addNgVar(ngOptionsData.value.label) +
                addVar(ngOptionsData.value.trackexpr) +
                "});";
            return {source};
        }
};

const ngWithEvent: AttributeDirectiveHandler = {
    forAttributes: ["ng-blur", "ng-mouseenter", "ng-mouseleave", "ng-click"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            return { source: `const ${codegenHelpers.getNewVariableName()}: any = (${codegenHelpers.registerVariable('$event')}: any) => ` +
                     codegenHelpers.addScopeAccessors(attrValue) + ";" };
        }
};

const ngModelOptions: AttributeDirectiveHandler = {
    forAttributes: ["ng-model-options"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            const typeDef = "{updateOn?: string, debounce?: number,"+
                "allowInvalid?: boolean, getterSetter?: boolean, timezone?: string}";
            return { source: codegenHelpers.declareVariable(typeDef, attrValue) };
        }
};

const ngPattern: AttributeDirectiveHandler = {
    forAttributes: ["ng-pattern"],
    handleAttribute: (attrName, attrValue, allAttribs, codegenHelpers) =>
        {
            return { source: codegenHelpers.declareVariable("RegExp|string", attrValue) };
        }
};

// ng-switch should work on the attribute level, but the spec requires to read
// multiple attributes at once... Eg "on"
const ngSwitch: TagDirectiveHandler = {
    canHandleAttributes: ['ng-switch'],
    forTags: [],
    handleTag: (tag, attribs, codegenHelpers) =>
        {
            if (!attribs.hasOwnProperty('ng-switch')) { return; }
            const expr = attribs.hasOwnProperty('on') ?
                attribs['on'] : attribs['ng-switch'];
            const extraSrc = `
                const assertUnreachable= (x:never): never => {
                    throw new Error("Didn't expect to get here " + x);
                };`;
            const strictDefault = `
                default:
                    assertUnreachable(${expr});`;

        const isStrict = attribs.hasOwnProperty('typeview-switch-exhaustive') ||
            attribs.hasOwnProperty('data-typeview-switch-exhaustive');
            return {
                source: `${isStrict ? extraSrc : ""}switch (${codegenHelpers.addScopeAccessors(expr)}) {`,
                closeSource: () => `${isStrict ? strictDefault : ''}}`
            };
        }
};

// ng-switch-when should work on the attribute level, but the spec requires to read
// multiple attributes at once... Eg "ng-switch-when-separator"
const ngSwitchWhen: TagDirectiveHandler = {
    canHandleAttributes: ['ng-switch-when', 'ng-switch-when-separator', 'ng-switch-default'],
    forTags: [],
    handleTag: (tag, attribs, codegenHelpers) =>
        {
            const quoteOrNot = (str: string) => {
                if (str === "true" || str === "false") {
                    return str;
                }
                if (str.match(/^\d+$/)) {
                    return str;
                }
                return '"' + str + '"';
            }
            if (attribs.hasOwnProperty("ng-switch-default")) {
                    return {source: `default:`, closeSource:()=>"break;"};
            }
            if (!attribs.hasOwnProperty("ng-switch-when")) { return; }
            if (attribs.hasOwnProperty("ng-switch-when-separator")) {
                const values = attribs['ng-switch-when'].split(attribs['ng-switch-when-separator']);
                const source = values.map(codegenHelpers.addScopeAccessors).map(v => `case ${v}: break;`).join("");
                return {source};
            } else {
                return {source: `case ${quoteOrNot(attribs['ng-switch-when'])}:`, closeSource:()=>"break;"};
            }
        }
};

const ngUiSelectDirectiveTagHandler: TagDirectiveHandler = {
    canHandleAttributes: ['ng-model', 'allow-clear', 'ui-lock-choice'],
    forTags: ["ui-select"],
    handleTag: (tag, attribs, codegenHelpers) => {
        // a while just to introduce a new scope.
        let source = "while (1) {";
        for (let attrName in attribs){
            const attrValue = attribs[attrName];
            switch (attrName) {
            case "ng-model":
                source += `const ${codegenHelpers.registerVariable("$select")} = {search:'', selected: ${
                    codegenHelpers.addScopeAccessors(attrValue)}};`;
                // alright, here comes the crazy part. it seems that $item is NOT
                // defined by ui-select.ng-model as I first thought...
                // but actually by the subtag ui-select.ui-select-choices.repeat.
                // which is completely nuts imho.
                // a sub-tag is creating stuff in the scope of the parent node...
                // anyway. creating it here in the parent scope, as null by default,
                // overwriting it from ui-select-choices. Means it'll be T|null instead
                // of T, but there's only so much I can do here.
                source += `let ${codegenHelpers.registerVariable("$item")} = null;`;
                break;
            case "allow-clear":
                source += codegenHelpers.declareVariable("boolean", attrValue);
                break;
            case "ui-lock-choice":
                source += codegenHelpers.declareVariable("any", attrValue);
                break;
            }
        }
        return {source, closeSource: () => "}"};
    }
};

interface NgUiSelectChoicesData {
    readonly variable: string;
    readonly variableExpr: Option<string>;
    readonly expression: NgFilterExpression;
}

function parseNgUiSelectChoicesSelect(): P.Parser<NgUiSelectChoicesData> {
    return parseAtom()
        .chain(first => parseNgUiSelectChoicesAs(first)
               .or(parseNgUiSelectChoicesIn(first, Option.none<string>())));
}

function parseNgUiSelectChoicesAs(varExpr: string): P.Parser<NgUiSelectChoicesData> {
    return keyword("as")
        .then(P.regexp(/[a-zA-Z0-9]+/)) // identifier
        .chain(identifier => parseNgUiSelectChoicesIn(identifier, Option.of(varExpr)));
}

function parseNgUiSelectChoicesIn(
    variable: string, variableExpr: Option<string>): P.Parser<NgUiSelectChoicesData> {
    return keyword("in")
            .then(parseNgFilterExpression())
            .map(expression => ({variable, variableExpr, expression}));
}

const ngUiSelectChoicesTagHandler: TagDirectiveHandler = {
    canHandleAttributes: ['repeat'],
    forTags: ["ui-select-choices"],
    handleTag: (tag, attribs, codegenHelpers) => {
        for (let attrName in attribs) {
            if (attrName === "repeat") {
                const attrValue = attribs[attrName];
                const selectData = parseNgUiSelectChoicesSelect().parse(attrValue);
                if (!selectData.status) {
                    console.warn("failed parsing a ui-select-choices select clause!");
                    console.warn(attrValue);
                    console.warn(selectData);
                    return {source: ""};
                }
                const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                    selectData.value.expression, codegenHelpers);
                const declVar = codegenHelpers.registerVariable(selectData.value.variable);
                const variableExprSrc = selectData.value.variableExpr
                    .map(v => codegenHelpers.declareVariable('any', v))
                    .getOrElse("");
                return {
                    // setting $item. See the comment in the ui-select handling.
                    // That also means that you should first have the ui-select-choices
                    // subtag to ui-select and then the ui-select-match otherwise it won't work.
                    source: `$item = ${enumerable}[0];${enumerable}.forEach(${declVar} => {${
                            variableExprSrc}`,
                    closeSource: () => "});"
                };
            }
        }
        return undefined;
    }
};

/**
 * Set of angular attribute directives supported out of the box. You can give this
 * list in [[ProjectSettings.attributeDirectives]], or you can add your own or provide
 * your own list entirely.
 */
export const defaultAttrDirectiveHandlers =
    [boolAttrHandler, boolWithScopeAttrHandler,
     anyAttrHandler, stringAttrHandler, numberAttrHandler,
     ngBindAttrDirectiveHandler,
     ngRepeatAttrDirectiveHandler, ngRepeatStartAttrDirectiveHandler,
     ngRepeatEndAttrDirectiveHandler,
     ngOptions, ngWithEvent,
     ngModelOptions, ngPattern, passThroughAttrHandler];

/**
 * Set of angular tag directives supported out of the box. You can give this
 * list in [[ProjectSettings.tagDirectives]], or you can add your own or provide
 * your own list entirely.
 */
export const defaultTagDirectiveHandlers =
    [ngUiSelectDirectiveTagHandler, ngUiSelectChoicesTagHandler,
    ngSwitch, ngSwitchWhen];
