import {List} from "immutable";
import {Maybe} from "monet";
import * as P from "parsimmon"

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
        tagName: string,
        addScopeAccessors: (js:string)=>string,
        registerVariable:(type:VarType,val:string)=>string): DirectiveResponse|undefined;
    handleAttribute(
        attrName: string, attrValue: string,
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

const ngRepeatAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat", "data-ng-repeat"],
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            const [lhs, rhs] = attrValue.split(" in ");
            const [enumerable, tracker] = rhs.split(" track by ");
            const source =`angular.forEach(${addScopeAccessors(enumerable)}, ${lhs} => {` +
                    "let $index = 0;let $first = true;let $middle = true;" +
                    "let $last = true;let $even = true;let $odd = false;" +
                    (tracker ? `${registerVariable('any', tracker)}` : "");
            return {source: source, closeSource: () => "});"};
        }
};

// https://docs.angularjs.org/api/ng/directive/ngOptions
interface NgOptionsData {
    select?: string;
    label: string;
    value: string;
    array: string;
    trackexpr?: string;
}

function parseNgOptions(): P.Parser<NgOptionsData> {
    return P.takeWhile(c => c !== ' ')
        .chain(first => parseNgOptionsAs(first).or(parseNgOptionsFor({ label: first})));
}

function parseNgOptionsAs(select: string): P.Parser<NgOptionsData> {
    return P.string(" as ")
        .then(P.takeWhile(c => c !== ' '))
        .chain(label => parseNgOptionsFor({select :select, label :label}));
}

function parseNgOptionsFor(expressions: {label:string,select?:string}): P.Parser<NgOptionsData> {
    return P.string(" for ")
        .then(P.takeWhile(c => c !== ' ').skip(P.string(" in ")))
        .chain(value => P.takeWhile(c => c !== ' ')
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
    return P.string(" track by ").then(P.all);
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
            const addVar = (v:any) => (v ? `${registerVariable('any', v)}` : "");
            const source = `angular.forEach(${addScopeAccessors(ngOptionsData.value.array)}, ${ngOptionsData.value.value} => {` +
                addVar(ngOptionsData.value.select) +
                addVar(ngOptionsData.value.label) +
                addVar(ngOptionsData.value.trackexpr) +
                "});";
            return {source: source};
        }
};

const ngUiSelectDirectiveTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select"],
    handleTag: (tag, addScopeAccessors, registerVariable) =>
        // a while just to introduce a new scope.
        ({source: "while (1) {", closeSource: () => "}"}) ,
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            switch (attrName) {
            case "ng-model":
                return {source:`let $select = {search:'', selected: ${addScopeAccessors(attrValue)}};`};
            case "allow-clear":
                return {source:registerVariable("boolean", attrValue)};
            case "ui-lock-choice":
                return {source:registerVariable("any", attrValue)};
            }
        }
};

const ngUiSelectChoicesTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select-choices"],
    handleTag: (tag, addScopeAccessors, registerVariable) => undefined,
    handleAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            if (attrName !== "repeat") {
                return undefined;
            }
            const [lhs, rhs] = attrValue.split(" in ");
            const rest = rhs.split("|");
            // TODO we skip the filters. example:
            // repeat="subtype in model.subtypes| filter:$select.search | filter: {typeId: auxItem.typeId} | orderBy: 'name'"
            return {source: `${addScopeAccessors(rest[0].trim())}.forEach(${lhs} => {`, closeSource: () => "});"};
        }
};

export const defaultAttrDirectiveHandlers = List.of(
    boolAttrHandler, anyAttrHandler, stringAttrHandler, numberAttrHandler,
    ngRepeatAttrDirectiveHandler, ngOptions);
export const defaultTagDirectiveHandlers = List.of(
    ngUiSelectDirectiveTagHandler, ngUiSelectChoicesTagHandler);
