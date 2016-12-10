import {writeFile, readdirSync, statSync} from "fs";
import {sync} from "glob";
import {Map, List, Seq, Iterable} from "immutable";
import {parse} from "path";

import {parseView, ParsedExpression} from "./view-parser"
import {extractScopeInterface, extractModalOpenAngularModule, ViewInfo, ControllerViewInfo, ControllerScopeInfo} from "./controller-parse"
import {addScopeAccessors} from "./view-ngexpression-parser"

var i: number = 0;

function formatViewExpr(viewExpr: ParsedExpression): string {
    return "    const ___x" + (i++) + " = " + addScopeAccessors(viewExpr.expr) + ";"
}

async function processControllerView(controllerPath: string, viewPath: string):void {
    console.log(`Processing view controller ${controllerPath} ${viewPath}`);
    const scopeContents: ControllerScopeInfo = await extractScopeInterface(controllerPath);
    if (!scopeContents.scopeContents) {
        // no point of writing anything if there is no scope block
        return;
    }
    const viewExprs = await parseView(viewPath);
    const pathInfo = parse(controllerPath);
    const outputFname = pathInfo.dir + "/" + pathInfo.name + "_viewtest.ts";
    const moduleWrap = scopeContents.tsModuleName === null
        ? (x:string) => x
        : (x:string) => "module " + scopeContents.tsModuleName + " {\n" + x + "\n}";
    writeFile(outputFname, moduleWrap(
        scopeContents.scopeContents +
            "\n\nfunction ___f($scope: Scope) {\n" +
            viewExprs.map(formatViewExpr).join("\n") +
            "\n}\n"));
}

async function readProjectFiles(path: string, blacklist: string[]) {
    // console.log(path);
    const files = sync(path + "/**/*.@(js|ts)", {nodir:true, ignore: blacklist});
    // console.log(files.length);
    try {
        const viewInfos = await Promise.all(files.map(f => extractModalOpenAngularModule(f, path)));
        const viewFilenameToControllerNames: Seq.Keyed<string,Iterable<number,ControllerViewInfo>> =
            List(viewInfos)
            .flatMap<number,ControllerViewInfo>(vi => vi.controllerViewInfos)
            .groupBy(cvi => cvi.viewPath);
        const controllerNameToFilename =
            Map<string,string>(viewInfos
                               .filter(vi => vi.ngModuleName)
                               .map(vi => [vi.ngModuleName, vi.fileName]));
        const viewFilenameToCtrlFilenames =
            viewFilenameToControllerNames
            .mapEntries<string,Iterable<number,string>>(
                ([viewFname,ctrlViewInfos]) =>
                    [viewFname, ctrlViewInfos.map(
                        (cvi: ControllerViewInfo) => controllerNameToFilename.get(cvi.controllerName))]);
        viewFilenameToCtrlFilenames.forEach(
            (ctrlNames, viewName) => ctrlNames.forEach(
                ctrlName => processControllerView(ctrlName, viewName)));
        // console.log(viewInfos.length);
        // console.log(viewInfos);
    } catch (e) {
        console.log(e);
    }
}

readProjectFiles(process.argv[2], process.argv.slice(3));
