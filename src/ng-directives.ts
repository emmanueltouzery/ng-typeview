import {List} from "immutable";
import {Maybe} from "monet";
import * as P from "parsimmon"

import {filterExpressionToTypescript, parseNgFilterExpression,
        NgFilterExpression, ngFilterExpressionToTypeScriptStandalone,
        ngFilterExpressionToTypeScriptEmbedded, keyword, parseAtom
       } from "./view-ngexpression-parser"

export type VarType = "boolean" | "any" | "string" | "number";

export type DirectiveResponse = { source: string, closeSource?: ()=>string };

export interface AttributeDirectiveHandler {
    forAttributes: string[];
    handleAttribute(
        attrName: string, attrValue: string,
        addScopeAccessors: (js:string)=>string,
        registerVariable:(type:VarType,val:string)=>string): DirectiveResponse|undefined;
}

export interface TagDirectiveHandler {
    forTags: string[];
    handleTag(
        tagName: string, attribs:{[type:string]: string},
        addScopeAccessors: (js:string)=>string,
        registerVariable:(type:VarType,val:string)=>string): DirectiveResponse|undefined;
}

const simpleDirectiveResponse: (v:string) => DirectiveResponse = v => ({ source: v});

const boolAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-show", "ng-if", "ng-required", "ng-disabled"],
    handleAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("boolean", val))
};

const anyAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-click", "ng-model", "ng-change", "ng-value",
                    "ng-submit", "ng-class", "ng-style"],
    handleAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("any", val))
};

const stringAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-include", "ng-src"],
    handleAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("string", val))
};

const numberAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-maxlength"],
    handleAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("number", val))
};

const ngBindAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-bind", "ng-bind-html"],
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            return {source: filterExpressionToTypescript(
                attrValue, registerVariable, addScopeAccessors)};
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

const ngRepeatAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat", "data-ng-repeat"],
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            const ngRepeatData = parseNgRepeat().parse(attrValue);
            if (!ngRepeatData.status) {
                console.warn("failed parsing a ng-repeat clause!");
                console.warn(attrValue);
                console.warn(ngRepeatData);
                return {source: ""};
            }
            const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                ngRepeatData.value.expression, registerVariable, addScopeAccessors);
            const source =`angular.forEach(${enumerable}, ${ngRepeatData.value.variable} => {` +
                    "let $index = 0;let $first = true;let $middle = true;" +
                    "let $last = true;let $even = true;let $odd = false;" +
                (ngRepeatData.value.trackingExpression ?
                 `${registerVariable('any', ngRepeatData.value.trackingExpression)}` : "");
            return {source, closeSource: () => "});"};
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

function parseNgOptionsAs(select: NgFilterExpression): P.Parser<NgOptionsData> {
    return keyword("as")
        .then(parseNgFilterExpression())
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
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            const ngOptionsData = parseNgOptions().parse(attrValue);
            if (!ngOptionsData.status) {
                console.warn("failed parsing a ng-options clause!");
                console.warn(attrValue);
                console.warn(ngOptionsData);
                return {source: ""};
            }
            const addVar = (v:string|undefined) => (v ? `${registerVariable('any', v)}` : "");
            const addNgVar = (v:NgFilterExpression|undefined) => (v ? ngFilterExpressionToTypeScriptStandalone(
                v, registerVariable, addScopeAccessors) : "");
            const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                ngOptionsData.value.array, registerVariable, addScopeAccessors);
            const source = `angular.forEach(${enumerable}, ${ngOptionsData.value.value} => {` +
                addNgVar(ngOptionsData.value.select) +
                addNgVar(ngOptionsData.value.label) +
                addVar(ngOptionsData.value.trackexpr) +
                "});";
            return {source};
        }
};

const ngUiSelectDirectiveTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select"],
    handleTag: (tag, attribs, addScopeAccessors, registerVariable) => {
        // a while just to introduce a new scope.
        let source = "while (1) {";
        for (let attrName in attribs){
            const attrValue = attribs[attrName];
            switch (attrName) {
            case "ng-model":
                source += `let $select = {search:'', selected: ${addScopeAccessors(attrValue)}};`;
                break;
            case "allow-clear":
                source += registerVariable("boolean", attrValue);
                break;
            case "ui-lock-choice":
                source += registerVariable("any", attrValue);
                break;
            }
        }
        return {source, closeSource: () => "}"}
    }
};

interface NgUiSelectChoicesData {
    readonly variable: string;
    readonly expression: NgFilterExpression;
}

function parseNgUiSelectChoicesSelect(): P.Parser<NgUiSelectChoicesData> {
    return parseAtom()
        .chain(variable => keyword("in")
               .then(parseNgFilterExpression())
               .map(expression => {
                   const r: NgUiSelectChoicesData = {
                       variable, expression
                   };
                   return r;
               }))
}

const ngUiSelectChoicesTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select-choices"],
    handleTag: (tag, attribs, addScopeAccessors, registerVariable) => {
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
                    selectData.value.expression, registerVariable, addScopeAccessors);
                return {source: `${enumerable}.forEach(${selectData.value.variable} => {`,
                        closeSource: () => "});"};
            }
        }
    }
};

export const defaultAttrDirectiveHandlers = List.of(
    boolAttrHandler, anyAttrHandler, stringAttrHandler, numberAttrHandler,
    ngBindAttrDirectiveHandler,
    ngRepeatAttrDirectiveHandler, ngOptions);
export const defaultTagDirectiveHandlers = List.of(
    ngUiSelectDirectiveTagHandler, ngUiSelectChoicesTagHandler);
