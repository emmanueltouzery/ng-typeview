import * as ts from "typescript";
import {Maybe} from "monet";
import * as monet from "monet";
import {maybeVariableStatement, maybeSingleNode,
        maybeObjectLiteralExpression, maybePropertyAssignment} from "./controller-parser"

/**
 * An angular filter. They can be registered through the [[ProjectSettings]] setup.
 * You must give a name, and the type for the filter.
 * Example:
 * ```new NgFilter("translate", "(key: string) => string")```
 *
 * You can also supply a addScopeToParam function: you are given the parameter index,
 * and are called with the parameter, so you can or not add scope accessors.
 * 99% of the time you want scope accessors for filter parameters, but for instance
 * 'filter' allows you to specify a pattern for items through an object literal.
 * If the filter spec is {name: "test"}, we certainly don't want to change it to:
 * {$scope.name: "test"}.
 */
export class NgFilter {

    public readonly addScopeToParam: (paramIndex:number, input:string, addScopeAccessors:(input:string)=>string)=>string;

    /**
     * @param name The name of the angular filter
     * @param type The type that'll be used to type-check uses of the filter.
     * @param addScopeToParam Customize the scope adding for parameter index n For instance
     *        for 'filter', we shouldn't wrap the values in the scope for the
     *        'expression' parameter, which is a spec of the values to keep.
     */
    constructor(
        public readonly name: string,
        public readonly type: string,
        addScopeToParam?: (paramIndex:number, input:string, addScopeAccessors:(input:string)=>string)=>string) {
        // default to add scope accessors if the user didn't specify a custom function
        this.addScopeToParam = addScopeToParam || ((idx, input, addScopeAccessors) => addScopeAccessors(input));
    }
}

/**
 * special handling for the expression parameter of the 'filter' filter.
 * that parameter defines a pattern for the items to keep.
 * for instance: {name: 'Peter'}, or {name: myName}
 * We want to change that to {name: $scope.myName}, and certainly not
 * {$scope.name: $scope.myName} and also not {name: myName}.
 * Since we want to 'half' add scope accessors, we need a custom handling.
 */
function filterFilterParams(paramIdx: number, input: string, addScAccessors: (input:string)=>string): string {
    const normal: string = addScAccessors(input);
    if (paramIdx != 1) {
        // special handling only for the first parameter of the function
        return normal;
    }
    // if we try to parse "{a:1,b:2}", typescript will parse it as a
    // LabeledStatement, and parses it wrong for us.
    // To force typescript to parse it as an object literal, we change
    // it to "const ___ = {a:1,b:2}"
    const sourceFile = ts.createSourceFile(
        "", "const ___ = " + input, ts.ScriptTarget.ES2016, /*setParentNodes */ true);

    return Maybe.Some(sourceFile)
        .flatMap(f => maybeSingleNode(f.statements))
        .flatMap(st => maybeVariableStatement(st))
        .flatMap(vs => maybeSingleNode(vs.declarationList.declarations))
        .filter(decl => decl.initializer !== undefined)
        .flatMap(decl => maybeObjectLiteralExpression(decl.initializer))
        .flatMap(objLit => monet.List.fromArray(objLit.properties.map(maybePropertyAssignment)).sequenceMaybe<ts.PropertyAssignment>())
        .map(props => props.filter(p => p.initializer !== undefined))
        .map(props => props.map(prop => prop.name.getText() + ": " + addScAccessors(prop.initializer.getText())))
        .map(props => "{" + props.toArray().join(", ") + "}")
        .orSome(normal);
}

/**
 * Set of angular filters supported out of the box. You can give this list in
 * [[ProjectSettings.ngFilters]], or you can add your own or provide your own
 * list entirely.
 */
export const defaultNgFilters = [
    new NgFilter("translate", "(key: string) => string"),
    new NgFilter("linky", "(text:string | null, target: '_blank'|'_self'|'_parent'|'_top') => string"),
    new NgFilter("orderBy", "<T, K extends keyof T>(input:T[], field: K) => T[]"),
    new NgFilter("filter", "<T>(input:T[], v: string | { [P in keyof T]?: T[P]; }) => T[]", filterFilterParams),
    new NgFilter("limitTo", "<T>(input: T[] | string | number, limit: string|number, begin?: string|number) => T[] | string"),
    new NgFilter("date", "(date:Date|string|number, format?: string, timezone?: string)=>string")
];
