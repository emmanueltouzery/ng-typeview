import {writeFile} from "fs";

import {parseView, ParsedExpression} from "./view-parser"
import {extractScopeInterface} from "./controller-parse"
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

processViewController(process.argv[2], process.argv[3]);
