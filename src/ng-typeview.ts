import {writeFileSync, readdirSync, statSync} from "fs";
import {sync} from "glob";
import {Map, List, Seq, Iterable} from "immutable";
import {parse} from "path";
import * as ts from "typescript";

import {parseView} from "./view-parser"
import {defaultAttrDirectiveHandlers, defaultTagDirectiveHandlers} from "./ng-directives"
import {extractControllerScopeInfo, extractCtrlViewConnsAngularModule,
        ViewInfo, ControllerViewConnector, ControllerViewInfo,
        ControllerScopeInfo, ScopeInfo} from "./controller-parser"
import {addScopeAccessors} from "./view-ngexpression-parser"

export {ControllerViewInfo} from "./controller-parser";

declare global {
    // tested working on node.
    interface String {
        repeat(c: number): string;
        endsWith(t: string): boolean;
        startsWith(t: string): boolean;
    }
}

// we only repeat the imports, type synonyms and custom interfaces
// if there is a module, because otherwise those are dumped in the
// global namespace anyway
function wrapInModule(moduleName: string, scopeInfo: ControllerScopeInfo,
                      contents: string): string {
    return "module " + moduleName + " {\n" +
        scopeInfo.imports.join("\n") + "\n" +
        scopeInfo.typeAliases.join("\n") + "\n" +
        scopeInfo.nonExportedDeclarations.join("\n") + "\n" +
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
    const addScope = (js: string) => addScopeAccessors(js, scopeContents.scopeInfo.some());
    const viewExprs = await parseView(
        viewPath, addScope, defaultTagDirectiveHandlers, defaultAttrDirectiveHandlers);
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
            viewExprs +
            "\n}\n") + "\n");
}

export class NgFilter {
    constructor(public readonly name: string, public readonly type: string) {}
}

export interface ProjectSettings {
    path: string;
    blacklist: string[];
    ngFilters: NgFilter[];
    ctrlViewConnectors: ControllerViewConnector[];
}

export async function processProjectFolder(prjSettings: ProjectSettings): Promise<any> {
    const files = sync(prjSettings.path + "/**/*.@(js|ts)",
                       {nodir:true, ignore: prjSettings.blacklist});
    const viewInfos = await Promise.all(
        files.map(f => extractCtrlViewConnsAngularModule(
            f, prjSettings.path, prjSettings.ctrlViewConnectors)));
    const viewFilenameToControllerNames: Seq.Keyed<string,Iterable<number,ControllerViewInfo>> =
        List(viewInfos)
        .flatMap<number,ControllerViewInfo>(vi => vi.controllerViewInfos)
        .groupBy(cvi => cvi.viewPath);
    const controllerNameToFilename =
        Map<string,string>(
            viewInfos
                .filter(vi => vi.controllerName.isSome())
			          // JS files are not going to have a scope interface
			          // definition so they're not helpful. Also, we can
			          // get twice the same file: original TS & compiled JS.
			          // => keep only the original TS in that case.
			          .filter(vi => vi.fileName.toLowerCase().endsWith(".ts"))
                .map(vi => [vi.controllerName.some(), vi.fileName]));
    const viewFilenameToCtrlFilenames =
        viewFilenameToControllerNames
        .mapEntries<string,Iterable<number,string>>(
            ([viewFname,ctrlViewInfos]) =>
                [viewFname, ctrlViewInfos
                 .map((cvi: ControllerViewInfo) => controllerNameToFilename.get(cvi.controllerName))
                 .filter((name:string) => name)]);
    return Promise.all(viewFilenameToCtrlFilenames.map(
        (ctrlNames, viewName) => Promise.all(ctrlNames.map(
            ctrlName => processControllerView(
                ctrlName, viewName, prjSettings.ngFilters)).toArray())).toArray());
}

export const basicFilters = [new NgFilter("translate", "(key: string) => string"),
                             new NgFilter("linky", "(text:string, target: '_blank'|'_self'|'_parent'|'_top') => string"),
                             new NgFilter("orderBy", "<T, K extends keyof T>(input:T, field: K) => T[]")];
try {
    processProjectFolder({
        path: process.argv[2],
        blacklist: process.argv.slice(3),
        ngFilters: basicFilters,
        ctrlViewConnectors: []
    });
} catch (e) {
    console.log(e);
}
