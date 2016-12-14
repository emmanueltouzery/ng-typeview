import {writeFileSync, readdirSync, statSync} from "fs";
import {sync} from "glob";
import {Map, List, Seq, Iterable} from "immutable";
import {parse} from "path";

import {parseView, ParsedExpression} from "./view-parser"
import {extractControllerScopeInfo, extractModalOpenAngularModule, ViewInfo, ControllerViewInfo, ControllerScopeInfo} from "./controller-parser"
import {addScopeAccessors} from "./view-ngexpression-parser"

var i: number = 0;

function formatViewExpr(viewExpr: ParsedExpression): string {
    return "    const ___x" + (i++) + ": " + viewExpr.type +
        " = " + addScopeAccessors(viewExpr.expr) + ";"
}

async function processControllerView(controllerPath: string, viewPath: string) {
    console.log(`Processing view controller ${controllerPath} ${viewPath}`);
    const scopeContents: ControllerScopeInfo = await extractControllerScopeInfo(controllerPath);
    if (scopeContents.scopeContents.isNone()) {
        // no point of writing anything if there is no scope block
        return;
    }
    const viewExprs = await parseView(viewPath);
    const pathInfo = parse(controllerPath);
    const viewPathInfo = parse(viewPath);
    // putting both controller & view name in the output, as one controller
    // may be used for several views.
    const outputFname = `${pathInfo.dir}/${pathInfo.name}_${viewPathInfo.name}_viewtest.ts`;
    const moduleWrap = (x:string) => scopeContents.tsModuleName
        .map(n => `module ${n} {\n${x}\n}`)
        .orSome(x);
    writeFileSync(outputFname, moduleWrap(
        scopeContents.imports.join("\n") + "\n" +
            scopeContents.typeAliases.join("\n") + "\n" +
            scopeContents.interfaces.join("\n") + "\n" +
            scopeContents.scopeContents.some() +
            "\n\nfunction ___f($scope: Scope) {\n" +
            viewExprs.map(formatViewExpr).join("\n") +
            "\n}\n") + "\n");
}

export async function processProjectFolder(path: string, blacklist: string[]): Promise<any> {
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
            ctrlName => processControllerView(ctrlName, viewName)).toArray())).toArray());
}

try {
    processProjectFolder(process.argv[2], process.argv.slice(3));
} catch (e) {
    console.log(e);
}
