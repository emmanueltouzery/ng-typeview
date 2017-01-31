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
        boolean1: boolean;
        boolean2: boolean;
        boolean3: boolean;
    }

function ___f($scope: Scope, f__translate:(key: string) => string,
    f__linky:(text:string, target: '_blank'|'_self'|'_parent'|'_top') => string,
    f__orderBy:<T, K extends keyof T>(input:T[], field: K) => T[],
    f__filter:<T>(input:T[], v: string | { [P in keyof T]?: T[P]; }) => T[],
    f__formatNumber:(input: string, formatType: 'hex'|'dec') => string) {
    const ___x0: boolean = $scope.data.showText['five'].function() === 6;
    if ($scope.data.showText['five'].function() === 6) {
        const ___x1: boolean = !$scope.user.wantsData();
        const ___x2: boolean = $scope.showDiv;
        if ($scope.showDiv) {
            const ___x3: any = $scope.triggerAction('six');
            f__translate('CLICK_ME');
            f__translate('CLICK_ME');
            
        }
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
                const ___x10: any = $index + 1;
                const ___x11: any = $first ? "first" : "not first!";
                
            });
            f__formatNumber($scope.maxlength, 'hex');
            
        });
        const ___x12: any = $scope.boolean1 && !$scope.boolean2 || $scope.boolean3;
        const ___x13: any = 'a' + 2 + 'b';
        const ___x14: any = $scope.user + '/' + $scope.user;
        const ___x15: any = 'a' === $scope.user.wantsData() ? 'equal' : 'not equal';
        const ___x16: any = $scope.boolean1 ? 'str a' : $scope.boolean2 ? 'str b' : 'str c';
        const ___x17: any = !$scope.boolean1 ? $scope.boolean2 ? 'str b' : 'str c' : 'str a';
        const ___x18: any = ($scope.card.storedValue / 100).toFixed(2);
        angular.forEach(f__orderBy($scope.data.groups, 'field'), group => {
            let $index = 0;
            let $first = true;
            let $middle = true;
            let $last = true;
            let $even = true;
            let $odd = false;
            f__translate(f__linky($scope.maintenanceTask.instructions, '_blank'));
            const ___x19: any = group;
            
        });
        const ___x20: any = $scope.group;
        f__filter(f__orderBy($scope.data.groups, 'field'), {
            field: $scope.user
        });
        
    }
    while (1) {
        let $select = {
            search:'', selected: $scope.data
        };
        const ___x21: any = $scope.data;
        const ___x22: any = $select.selected.firstname;
        f__orderBy($scope.data.groups, 'nameAndCountry').forEach(subtype => {
            const ___x23: any = subtype.name;
            
        });
        
    }
    angular.forEach(f__orderBy($scope.data.groups, 'labelSort'), item => {
        const ___x24: any = item.subItem;
        const ___x25: any = item.label;
        
    });
    const ___x26: any = $scope.user;
    angular.forEach($scope.data.groups, item => {
        f__translate(item.subItem);
        const ___x27: any = item.id;
        
    });
    const ___x28: any = $scope.user;
    switch ($scope.showDiv) {
        case $scope.data.firstname: break;
        case $scope.maxlength: break;
        case $scope.user: break;
        
    }
}
}

