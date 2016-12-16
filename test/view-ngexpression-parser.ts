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
        assert.equal("$scope.data.value", addScopeAccessors("data.value", fakeScopeInfo));
        assert.equal("!$scope.wasProvidedWorkbook()", addScopeAccessors("!wasProvidedWorkbook()", fakeScopeInfo));
        assert.equal("$scope.info.subscribedEmails.length > 0", addScopeAccessors("info.subscribedEmails.length > 0", fakeScopeInfo));
        assert.equal("$scope.movieInfo.legendEnabled && $scope.movieInfo.legend.length > 0",
                     addScopeAccessors("movieInfo.legendEnabled && movieInfo.legend.length > 0", fakeScopeInfo));
        assert.equal("$scope.selectedScreen.images[$scope.idx - 1] !== null",
                     addScopeAccessors("selectedScreen.images[idx - 1] !== null", fakeScopeInfo));
        assert.equal("$scope.selectedScreen.images[$scope.idx - 1].name",
                     addScopeAccessors("selectedScreen.images[idx - 1].name", fakeScopeInfo));
        assert.equal("$scope.getSelectedImage($scope.selectedScreen.images[$scope.idx - 1])",
                     addScopeAccessors("getSelectedImage(selectedScreen.images[idx - 1])", fakeScopeInfo));
        assert.equal("$scope.fType === 'test' || $scope.fType === 'test1'",
                     addScopeAccessors("fType === 'test' || fType === 'test1'", fakeScopeInfo));
    });
});
