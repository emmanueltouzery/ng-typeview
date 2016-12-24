import * as assert from 'assert'
import {addScopeAccessors} from '../src/view-ngexpression-parser'
import {ScopeInfo} from "../src/controller-parser"

describe("addScopeAccessors", () => {
    it ("should add $scope properly", () => {
        const fakeScopeInfo: ScopeInfo = {
            contents: "",
            fieldNames: ["data", "wasProvidedWorkbook", "info", "movieInfo",
                         "selectedScreen", "getSelectedImage", "fType", "idx"]
        };
        const assertScopeAcc = (expected:string,input:string) => assert.equal(expected, addScopeAccessors(input, fakeScopeInfo));
        assertScopeAcc("$scope.data.value", "data.value");
        assertScopeAcc("!$scope.wasProvidedWorkbook()", "!wasProvidedWorkbook()");
        assertScopeAcc("$scope.info.subscribedEmails.length > 0", "info.subscribedEmails.length > 0");
        assertScopeAcc("$scope.movieInfo.legendEnabled && $scope.movieInfo.legend.length > 0",
                       "movieInfo.legendEnabled && movieInfo.legend.length > 0");
        assertScopeAcc("$scope.selectedScreen.images[$scope.idx - 1] !== null",
                       "selectedScreen.images[idx - 1] !== null");
        assertScopeAcc("$scope.selectedScreen.images[$scope.idx - 1].name",
                       "selectedScreen.images[idx - 1].name");
        assertScopeAcc("$scope.getSelectedImage($scope.selectedScreen.images[$scope.idx - 1])",
                       "getSelectedImage(selectedScreen.images[idx - 1])");
        assertScopeAcc("$scope.fType === 'test' || $scope.fType === 'test1'",
                       "fType === 'test' || fType === 'test1'");
        assertScopeAcc("$scope.wasProvidedWorkbook ? '' : 'ng-invalid'",
                       "wasProvidedWorkbook ? '' : 'ng-invalid'");
    });
});
