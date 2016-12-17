import * as assert from 'assert'
import {Maybe} from "monet";
import {extractControllerScopeInfo, ControllerScopeInfo, extractModalOpenAngularModule} from '../src/controller-parser'

describe("extractModalOpenAngularModule", () => {
    it("should recognize the statements", async () => {
        const modalModuleInfo = await extractModalOpenAngularModule("test/data/test-ctrl.ts", "webapp");
        assert.equal("test/data/test-ctrl.ts", modalModuleInfo.fileName);
        assert.deepEqual(Maybe.Some("ControllerName"), modalModuleInfo.ngModuleName);
        assert.deepEqual([
            {
                controllerName: "ControllerName",
                viewPath: "webapp/test-view.html"
            },
            {
                controllerName: "AnotherControllerName",
                viewPath: "webapp/path/to/another/view.html"
            }], modalModuleInfo.controllerViewInfos);
    });
});

describe("extractControllerScopeInfo", () => {
    it("should parse the scope info", async () => {
        const scopeInfo = await extractControllerScopeInfo("test/data/test-ctrl.ts");
        assert.equal("multipart.module.name", scopeInfo.tsModuleName.some());
        assert.equal("interface Scope extends ng.IScope {\n" +
                     "        showDiv?: string;\n" +
                     "        showText: (x:string)=>boolean;\n" +
                     "        data: {groups: any[], firstname: string}\n" +
                     "        triggerAction: boolean\n" +
                     "        user: string;\n" +
                     "        maxlength: number;\n" +
                     "    }", scopeInfo.scopeInfo.some().contents);
        assert.deepEqual(
            ["showDiv", "showText", "data", "triggerAction", "user", "maxlength"],
            scopeInfo.scopeInfo.some().fieldNames);
        assert.deepEqual(["type STR = string;", "type INT = number;"], scopeInfo.typeAliases);
        assert.deepEqual(["import Aa = api.Aa;", "import Bb = api.Bb;"], scopeInfo.imports);
        assert.deepEqual(
            [
                "interface NotScope extends SomethingElse {\n        intField: number;\n    }",
                "interface NotScope2 extends NotScope {\n        f1: (x:string)=>boolean;\n    }"
            ],
            scopeInfo.interfaces);
    });
});
