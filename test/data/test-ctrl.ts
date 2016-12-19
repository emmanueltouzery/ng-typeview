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
    export interface IDontCopy {
        whatever: number;
    }

    class NotScopeClass {
        field?: number;
        constructor(public f2: number);
    }

    export class DontCopy {
        field: string;
    }

    interface Scope extends ng.IScope {
        showDiv?: string;
        showText: (x:string)=>boolean;
        data: {groups: any[], firstname: string}
        triggerAction: boolean
        user: string;
        maxlength: number;
    }

    $scope.register =
        ($stateProvider: ng.ui.IStateProvider) =>
    $stateProvider.state('my.first.state', <ng.ui.IState>{
        abstract: true,
        url: '/config',
        template: '<div data-ui-view style="padding: 0px"></div>'
    }).state('my.second.state', <ng.ui.IState>{
        url: '/list',
        templateUrl: 'app/view/url1.html',
        controller: 'CtrlState1'
    }).state('my.third.state', <ng.ui.IState>{
        url: '/:id/details/?id/:back',
        templateUrl: 'app/view/url2.html',
        controller: 'CtrlState2',
        resolve: {
            source: ['myService',
                     (myService: any) => {
                         if (_.isEmpty(myService.tasks))
                             myService.query();
                     }
                    ]
        }
    });

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
        return this.$modal.open({
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

    $scope.onViewEventNotifications = () => core.displayDialog<any>(
        $modal, 'YupYetAnotherCtrl',
        'and/yet/another/view.html', { isEvent: () => true });

    angular.module('my.ng.module.name')
        .controller('ControllerName', ['param1', 'param2', Ctor]);
}
