import * as assert from 'assert'
import {addScopeAccessors} from '../src/view-ngexpression-parser'

describe("addScopeAccessors", () => {
    it ("should add $scope properly", () => {
        assert.equal("$scope.data.value", addScopeAccessors("data.value"));
        assert.equal("!$scope.wasProvidedWorkbook()", addScopeAccessors("!wasProvidedWorkbook()"));
        assert.equal("$scope.info.subscribedEmails.length > 0", addScopeAccessors("info.subscribedEmails.length > 0"));
        assert.equal("$scope.movieInfo.legendEnabled && $scope.movieInfo.legend.length > 0",
                     addScopeAccessors("movieInfo.legendEnabled && movieInfo.legend.length > 0"));
        assert.equal("$scope.selectedScreen.images[$scope.idx - 1] !== null",
                     addScopeAccessors("selectedScreen.images[idx - 1] !== null"));
        assert.equal("$scope.selectedScreen.images[$scope.idx - 1].name",
                     addScopeAccessors("selectedScreen.images[idx - 1].name"));
        assert.equal("$scope.getSelectedImage($scope.selectedScreen.images[$scope.idx - 1])",
                     addScopeAccessors("getSelectedImage(selectedScreen.images[idx - 1])"));
        assert.equal("$scope.fType === 'test' || $scope.fType === 'test1'",
                     addScopeAccessors("fType === 'test' || fType === 'test1'"));
    });
});
