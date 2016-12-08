import {writeFile, readdirSync, statSync} from "fs";
import {sync} from "glob";

import {parseView, ParsedExpression} from "./view-parser"
import {extractScopeInterface, extractModalOpenAngularModule} from "./controller-parse"
import {addScopeAccessors} from "./view-ngexpression-parser"

var i: number = 0;

function formatViewExpr(viewExpr: ParsedExpression): string {
    return "    const ___x" + (i++) + " = " + addScopeAccessors(viewExpr.expr) + ";"
}

async function processViewController(controllerPath: string, viewPath: string) {
    const scopeContents = await extractScopeInterface(controllerPath);
    const viewExprs = await parseView(viewPath);
    writeFile("out.ts", scopeContents +
              "\n\nfunction ___f($scope: Scope) {\n" +
              viewExprs.map(formatViewExpr).join("\n") +
             "\n}\n");
}

// processViewController(process.argv[2], process.argv[3]);

async function readProjectFiles(path: string) {
    console.log(path);
    const files = sync(path + "/**/*.@(js|ts)", {nodir:true});
    console.log(files.length);
    try {
        const viewInfos = (await Promise.all(files.map(extractModalOpenAngularModule)))
            // TODO parameter destructuring possible here?
            .filter(viewInfo => viewInfo.ngModuleName !== null || viewInfo.controllerViewInfos.length > 0);
        console.log(viewInfos.length);
        console.log(viewInfos);
    } catch (e) {
        console.log(e);
    }
}

readProjectFiles(process.argv[2]);
