import {List} from "immutable";
import {Maybe} from "monet";

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
    ngRepeatAttrDirectiveHandler);
export const defaultTagDirectiveHandlers = List.of(
    ngUiSelectDirectiveTagHandler, ngUiSelectChoicesTagHandler);
