module multipart.module.name {

    import Aa = api.Aa;
    import Bb = api.Bb;

    type STR = string;
    type INT = number;

    interface NotScope extends SomethingElse {
        intField: number;
    }
    interface NotScope2 extends NotScope {
        f1: (x:string)=>boolean;
    }

    interface Scope extends ng.IScope {
        intField: number;
        date?: string;
        f1: (x:string)=>boolean;
    }

    $scope.f1 = function () {
        return $modal.open({
            templateUrl: 'test-view.html',
            controller: 'ControllerName',
            param2: 'something',
            param3: 'something else',
            resolve: {
                something: () => x,
                somethingElse: function() { return y}
            }
        });
    }

    $scope.f2 = function () {
        return $modal.open({
            templateUrl: 'path/to/another/view.html',
            controller: 'AnotherControllerName',
            param2: 'something',
            param3: 'something else',
            resolve: {
                something: () => x,
                somethingElse: function() { return y}
            }
        });
    }

    angular.module('my.ng.module.name')
        .controller('ControllerName', ['param1', 'param2', Ctor]);
}
