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
class NotScopeClass {
        field?: number;
        constructor(public f2: number);
    }
interface Scope extends ng.IScope {
        showDiv?: string;
        showText: (x:string)=>boolean;
        data: {groups: any[], firstname: string}
        triggerAction: boolean
        user: string;
        maxlength: number;
    }

function ___f($scope: Scope, f__translate:(key: string) => string, f__formatNumber:(input: string, formatType: 'hex'|'dec') => string) {
    const ___x0: boolean = $scope.data.showText['five'].function() === 6;
    const ___x1: boolean = !$scope.user.wantsData();
    const ___x2: boolean = $scope.showDiv;
    const ___x3: any = $scope.triggerAction('six');
    f__translate('CLICK_ME');
    const ___x4: any = $scope.data.firstname;
    const ___x5: any = $scope.maxlength;
    angular.forEach($scope.data.groups, group => {
        let $index = 0;
        let $first = true;
        let $middle = true;
        let $last = true;
        let $even = true;
        let $odd = false;
        const ___x6: any = group.id;
        angular.forEach(group, item => {
            let $index = 0;
            let $first = true;
            let $middle = true;
            let $last = true;
            let $even = true;
            let $odd = false;
            const ___x7: any = $index;
            const ___x8: any = item.name + ' ' + $scope.user.wantsData();
            const ___x9: any = $scope.triggerAction('five');
            
        });
        f__formatNumber($scope.maxlength, 'hex');
        
    });
    angular.forEach($scope.data.groups, group => {
        let $index = 0;
        let $first = true;
        let $middle = true;
        let $last = true;
        let $even = true;
        let $odd = false;
        
    });
    
}
}

