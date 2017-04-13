module multipart.module.name2 {

    interface Scope extends ng.IScope {
        showDiv: boolean;
    }

    angular.module('ng.module').directive('myDirective', (dep1, dep2: ng.IRootScopeService) => {
        return {
            replace: true,
            restrict: 'AE',
            scope: {
                showDiv: true
            } as Scope,
            templateUrl: 'directive-template.html'
        }
    });
}
