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
    f__linky:(text:string | null, target: '_blank'|'_self'|'_parent'|'_top') => string,
    f__orderBy:<T, K extends keyof T>(input:T[], field: K) => T[],
    f__filter:<T>(input:T[], p: ((v:T,idx:number,array:T[])=>boolean | string | { [P in keyof T]?: T[P]; })) => T[],
    f__limitTo:<T>(input: T[] | string | number, limit: string|number, begin?: string|number) => T[] | string,
    f__date:(date:Date|string|number, format?: string, timezone?: string)=>string,
    f__formatNumber:(input: string, formatType: 'hex'|'dec') => string) {
    const ___x4: boolean = $scope.data.showText['five'].function() === 6;
    if ($scope.data.showText['five'].function() === 6) {
        const ___x5: boolean = !$scope.user.wantsData();
        const ___x6: boolean = $scope.showDiv;
        if ($scope.showDiv) {
            const ___x7: any = ($event: any) => $scope.triggerAction('six');
            f__translate('CLICK_ME');
            f__translate('CLICK_ME');
            
        }
        const ___x8: any = $scope.url;
        const ___x9: any = $scope.hash;
        const ___x10: any = $scope.data.firstname;
        const ___x11: any = $scope.maxlength;
        angular.forEach($scope.data.groups, group => {
            let $index = 0;
            let $first = true;
            let $middle = true;
            let $last = true;
            let $even = true;
            let $odd = false;
            const ___x12: any = group.id;
            angular.forEach(group, item => {
                let $index = 0;
                let $first = true;
                let $middle = true;
                let $last = true;
                let $even = true;
                let $odd = false;
                const ___x13: any = $index;
                const ___x14: any = item.name + ' ' + $scope.user.wantsData();
                const ___x15: any = $scope.triggerAction('five');
                const ___x16: any = $index + 1;
                const ___x17: any = $first ? "first" : "not first!";
                
            });
            f__formatNumber($scope.maxlength, 'hex');
            
        });
        const ___x18: any = $scope.boolean1 && !$scope.boolean2 || $scope.boolean3;
        const ___x19: any = 'a' + 2 + 'b';
        const ___x20: any = $scope.user + '/' + $scope.user;
        const ___x21: any = 'a' === $scope.user.wantsData() ? 'equal' : 'not equal';
        const ___x22: any = $scope.boolean1 ? 'str a' : $scope.boolean2 ? 'str b' : 'str c';
        const ___x23: any = !$scope.boolean1 ? $scope.boolean2 ? 'str b' : 'str c' : 'str a';
        const ___x24: any = ($scope.card.storedValue / 100).toFixed(2);
        f__limitTo("brown fox jumps over the lazy dog", 10);
        f__limitTo($scope.data.groups, 3);
        angular.forEach(f__orderBy($scope.data.groups, 'field'), group => {
            let $index = 0;
            let $first = true;
            let $middle = true;
            let $last = true;
            let $even = true;
            let $odd = false;
            f__translate(f__linky($scope.maintenanceTask.instructions, '_blank'));
            const ___x25: any = group;
            
        });
        const ___x26: any = $scope.group;
        f__filter(f__orderBy($scope.data.groups, 'field'), {
            field: $scope.user
        });
        
    }
    while (1) {
        const $select = {
            search:'', selected: $scope.data[0]
        };
        let $item = null;
        const ___x27: any = $scope.data;
        $item = f__orderBy($scope.data.groups, 'nameAndCountry')[0];
        f__orderBy($scope.data.groups, 'nameAndCountry').forEach(subtype => {
            const ___x28: any = subtype.name;
            
        });
        const ___x29: any = $select.selected.firstname;
        const ___x30: any = $item.firstname;
        
    }
    angular.forEach(f__orderBy($scope.data.groups, 'labelSort'), item => {
        const ___x31: any = item.subItem;
        const ___x32: any = item.label;
        
    });
    const ___x33: any = $scope.user;
    angular.forEach($scope.data.groups, item => {
        f__translate(item.subItem);
        const ___x34: any = item.id;
        
    });
    const ___x35: any = $scope.user;
    switch ($scope.showDiv) {
        case $scope.data.firstname: break;
        case $scope.maxlength: break;
        case $scope.user: break;
        
    }
    angular.forEach($scope.data.groups, curGrp => {
        let $index = 0;
        let $first = true;
        let $middle = true;
        let $last = true;
        let $even = true;
        let $odd = false;
        const ___x36: any = curGrp.name;
        
    });
    while (1) {
        const $select = {
            search:'', selected: $scope.editObject.assignedUserTypes[0]
        };
        let $item = null;
        const ___x37: any = $scope.editObject.assignedUserTypes;
        $item = f__filter($scope.itemsData.activeUserTypes, {
            desc: $select.search, combinedUser: false
        })[0];
        f__filter($scope.itemsData.activeUserTypes, {
            desc: $select.search, combinedUser: false
        }).forEach(user => {
            const ___x38: any = user.typeId;
            const ___x39: any = user.desc;
            
        });
        const ___x40: any = $scope.item.desc;
        
    }
    angular.forEach($scope.adminStatusList, status => {
        const ___x41: any = status.name;
        f__translate(status.name);
        
    });
    const ___x42: any = $scope.actualConfigs[$scope.cfg.type] === "1" ? $scope.cfg.configs.test : ($scope.actualConfigs[$scope.cfg.type] === "0" ? $scope.cfg.configs.fleet : '');
    
}
}

