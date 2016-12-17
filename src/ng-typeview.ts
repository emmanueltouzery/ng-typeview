import {writeFileSync, readdirSync, statSync} from "fs";
import {sync} from "glob";
import {Map, List, Seq, Iterable} from "immutable";
import {parse} from "path";

import {parseView, ParsedExpression, ParsedVariable,
        LoopStart, LoopEnd, FilterExpression} from "./view-parser"
import {extractControllerScopeInfo, extractModalOpenAngularModule,
        ViewInfo, ControllerViewInfo, ControllerScopeInfo, ScopeInfo} from "./controller-parser"
import {addScopeAccessors} from "./view-ngexpression-parser"

let i: number = 0;

declare global {
    // tested working on node.
    interface String {
        repeat(c: number): string;
    }
}

function formatViewExpr(scopeInfo: ScopeInfo): (viewExprIndex: [ParsedExpression, number]) => string {
    return viewExprIndex => {
        const [viewExpr, indentLevel] = viewExprIndex;
        const spaces = " ".repeat((1+indentLevel)*4);
        if (viewExpr instanceof ParsedVariable) {
            return spaces + "const ___x" + (i++) + ": " + viewExpr.type +
                " = " + addScopeAccessors(viewExpr.expr, scopeInfo) + ";"
        } else if (viewExpr instanceof FilterExpression) {
            const fParams = [addScopeAccessors(viewExpr.filterInput, scopeInfo)]
                .concat(viewExpr.filterParams).join(", ")
            return `${spaces}f__${viewExpr.filterName}(${fParams});`;
        } else if (viewExpr instanceof LoopStart) {
            const [lhs, rhs] = viewExpr.loopExpr.split(" in ");
            return  [`${addScopeAccessors(rhs, scopeInfo)}.forEach(${lhs} => {`,
                "let $index = 0; let $first = true; let $middle=true;",
                "let $last = true; let $even = true; let $odd = false;"]
                .map((x,i) => " ".repeat((indentLevel+(i>0?1:0))*4) + x)
                .join("\n");
        } else if (viewExpr instanceof LoopEnd) {
            return spaces + "});";
        } else {
            throw `unknown parsed expression type: ${viewExpr}`;
        }
    };
}

function indentChange(expr: ParsedExpression): number {
    if (expr instanceof LoopStart) {
        return 1;
    } else if (expr instanceof LoopEnd) {
        return -1;
    }
    return 0;
}

// we only repeat the imports, type synonyms and custom interfaces
// if there is a module, because otherwise those are dumped in the
// global namespace anyway
function wrapInModule(moduleName: string, scopeInfo: ControllerScopeInfo,
                      contents: string): string {
    return "module " + moduleName + " {\n" +
        scopeInfo.imports.join("\n") + "\n" +
        scopeInfo.typeAliases.join("\n") + "\n" +
        scopeInfo.interfaces.join("\n") + "\n" +
        contents +
        "}\n";
}

async function processControllerView(controllerPath: string, viewPath: string, ngFilters: NgFilter[]) {
    console.log(`Processing view controller ${controllerPath} ${viewPath}`);
    const scopeContents: ControllerScopeInfo = await extractControllerScopeInfo(controllerPath);
    if (scopeContents.scopeInfo.isNone()) {
        // no point of writing anything if there is no scope block
        return;
    }
    const viewExprs = List(await parseView(viewPath));
    const viewLevels = viewExprs.reduce(
        (soFar: List<number>, cur: ParsedExpression) => soFar.push((soFar.last() || 0) + indentChange(cur)), List([]));
    const pathInfo = parse(controllerPath);
    const viewPathInfo = parse(viewPath);
    // putting both controller & view name in the output, as one controller
    // may be used for several views.
    const outputFname = `${pathInfo.dir}/${pathInfo.name}_${viewPathInfo.name}_viewtest.ts`;
    const moduleWrap = (x:string) => scopeContents.tsModuleName
        .map(n => wrapInModule(n, scopeContents, x))
        .orSome(x);
    const filterParams = ngFilters.map(f => `f__${f.name}:${f.type}`).join(", ");
    writeFileSync(outputFname, moduleWrap(
            scopeContents.scopeInfo.some().contents +
            `\n\nfunction ___f($scope: Scope, ${filterParams}) {\n` +
            viewExprs.zip(viewLevels).map(formatViewExpr(scopeContents.scopeInfo.some())).join("\n") +
            "\n}\n") + "\n");
}

export class NgFilter {
    constructor(public readonly name: string, public readonly type: string) {}
}

export async function processProjectFolder(path: string, blacklist: string[], ngFilters: NgFilter[]): Promise<any> {
    const files = sync(path + "/**/*.@(js|ts)", {nodir:true, ignore: blacklist});
    const viewInfos = await Promise.all(files.map(f => extractModalOpenAngularModule(f, path)));
    const viewFilenameToControllerNames: Seq.Keyed<string,Iterable<number,ControllerViewInfo>> =
        List(viewInfos)
        .flatMap<number,ControllerViewInfo>(vi => vi.controllerViewInfos)
        .groupBy(cvi => cvi.viewPath);
    const controllerNameToFilename =
        Map<string,string>(viewInfos
                           .filter(vi => vi.ngModuleName.isSome())
                           .map(vi => [vi.ngModuleName.some(), vi.fileName]));
    const viewFilenameToCtrlFilenames =
        viewFilenameToControllerNames
        .mapEntries<string,Iterable<number,string>>(
            ([viewFname,ctrlViewInfos]) =>
                [viewFname, ctrlViewInfos
                 .map((cvi: ControllerViewInfo) => controllerNameToFilename.get(cvi.controllerName))
                 .filter((name:string) => name)]);
    return Promise.all(viewFilenameToCtrlFilenames.map(
        (ctrlNames, viewName) => Promise.all(ctrlNames.map(
            ctrlName => processControllerView(ctrlName, viewName, ngFilters)).toArray())).toArray());
}

export const basicFilters = [new NgFilter("translate", "(key: string) => string")];
try {
    processProjectFolder(process.argv[2], process.argv.slice(3), basicFilters);
} catch (e) {
    console.log(e);
}
