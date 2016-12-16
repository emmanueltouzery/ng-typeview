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

function ___f($scope: Scope) {
    const ___x0: boolean = $scope.data.showText['five'].function() === 6;
    const ___x1: boolean = !$scope.user.wantsData();
    const ___x2: boolean = $scope.showDiv;
    const ___x3: any = $scope.triggerAction('six');
    const ___x4: any = $scope.data.firstname;
    for (group in data.groups) {
        for (item in group) {
            const ___x5: any = item.name + ' ' + $scope.user.wantsData();
        }
    }
}

}
