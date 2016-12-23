import {List} from "immutable";
import {Maybe} from "monet";
export interface Attributes { attrNames: string[]};

export type VarType = "boolean" | "any";

export type DirectiveResponse = { source: string, closeSource: Maybe<()=>string> };

export interface DirectiveHandler {
    forAttributes : Attributes;
    handleTagAttribute(
        attrName: string, attrValue: string,
        addScopeAccessors: (js:string)=>string, registerVariable:(type:VarType,val:string)=>string): DirectiveResponse;
}

const simpleDirectiveResponse: (v:string) => DirectiveResponse = v =>
    ({ source: v, closeSource: Maybe.None<()=>string>()});

// want all direktive to be plugged in, not builtin,
// including those. take them as parameter, provide a list "defaultDirectives"
const boolAttrHandler: DirectiveHandler = {
    forAttributes: { attrNames: ["ng-show", "ng-if", "ng-required"] },
    handleTagAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("boolean", val))
};

const anyAttrHandler: DirectiveHandler = {
    forAttributes: { attrNames: ["ng-click", "ng-model", "ng-change"] },
    handleTagAttribute: (attrName, val, addScopeAccessors, registerVariable) =>
        simpleDirectiveResponse(registerVariable("any", val))
};

const ngRepeatDirectiveHandler: DirectiveHandler = {
    forAttributes: { attrNames: ["ng-repeat", "data-ng-repeat"] },
    handleTagAttribute: (attrName, attrValue, addScopeAccessors, registerVariable) =>
        {
            const [lhs, rhs] = attrValue.split(" in ");
            const [enumerable, tracker] = rhs.split(" track by ");
            const source =`angular.forEach(${addScopeAccessors(enumerable)}, ${lhs} => {` +
                    "let $index = 0;let $first = true;let $middle = true;" +
                    "let $last = true;let $even = true;let $odd = false;" +
                    (tracker ? `${registerVariable('any', tracker)}` : "");
            return {source: source, closeSource: Maybe.of(() => "});")};
        }
}

export const defaultDirectiveHandlers = List.of(boolAttrHandler, anyAttrHandler, ngRepeatDirectiveHandler);
