import * as assert from 'assert'
import {extractControllerScopeInfo, ControllerScopeInfo, extractModalOpenAngularModule} from '../src/controller-parser'

describe("extractModalOpenAngularModule", () => {
    it("should recognize the statements", async () => {
        const modalModuleInfo = await extractModalOpenAngularModule("test/data/test-ctrl.ts", "webapp");
        assert.equal("test/data/test-ctrl.ts", modalModuleInfo.fileName);
        assert.equal("MyNgControllerName", modalModuleInfo.ngModuleName);
        assert.deepEqual([
            {
                controllerName: "ControllerName",
                viewPath: "webapp/path/to/the/view.html"
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
        assert.equal("multipart.module.name", scopeInfo.tsModuleName);
        assert.equal("interface Scope extends ng.IScope {\n" +
                     "        intField: number;\n" +
                     "        date?: string;\n" +
                     "        f1: (x:string)=>boolean;\n    }", scopeInfo.scopeContents);
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
