import * as assert from 'assert'
import {normalizeTagAttrName} from '../src/view-parser'

describe("normalizeTagAttrName", () => {
    it("should normalize names properly", () => {
        const assertNorm = (expected:string, input:string) =>
            assert.equal(expected, normalizeTagAttrName(input));
        assertNorm("ng-bind", "ng-bind");
        assertNorm("ng-bind", "x-ng-bind");
        assertNorm("ng-bind", "data-ng-bind");
        assertNorm("ng-bind", "data_ng:bind");
        assertNorm("ng-bind", "ngBind");
    });
});
