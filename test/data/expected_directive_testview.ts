module multipart.module.name2 {



interface Scope extends ng.IScope {
        showDiv: boolean;
    }

function ___f($scope: Scope, f__translate:(key: string) => string,
    f__linky:(text:string | null, target: '_blank'|'_self'|'_parent'|'_top') => string,
    f__orderBy:<T, K extends keyof T>(input:T[], field: K) => T[],
    f__filter:<T>(input:T[], p: (((v:T,idx:number,array:T[])=>boolean) | string | { [P in keyof T]?: T[P]; })) => T[],
    f__limitTo:<T>(input: T[] | string | number, limit: string|number, begin?: string|number) => T[] | string,
    f__date:(date:Date|string|number, format?: string, timezone?: string)=>string,
    f__currency:(amount:number|string, symbol?: string, fractionSize?:number)=>string,
    f__formatNumber:(input: string, formatType: 'hex'|'dec') => string) {
    const ___x0: any = {
        active: $scope.showDiv
    };
    
}
}

