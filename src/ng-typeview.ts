import {writeFileSync, unlinkSync} from "fs";
import {sync} from "glob";
import {HashMap, Vector} from "prelude-ts";
import {parse} from "path";

import {parseView, collectionKeepDefined } from "./view-parser"
import {AttributeDirectiveHandler, TagDirectiveHandler,
        defaultTagDirectiveHandlers, defaultAttrDirectiveHandlers} from "./ng-directives"
export {AttributeDirectiveHandler, TagDirectiveHandler,
        defaultTagDirectiveHandlers, defaultAttrDirectiveHandlers} from "./ng-directives"
import {extractControllerScopeInfo, extractCtrlViewConnsAngularModule,
        ControllerViewInfo, ControllerScopeInfo,
        ControllerViewConnector, defaultCtrlViewConnectors,
        CtrlViewFragmentExtractor, defaultCtrlViewFragmentExtractors,
        ModelViewConnector, defaultModelViewConnectors} from "./controller-parser"
import {NgFilter, defaultNgFilters} from "./filters"

export {ControllerViewInfo} from "./controller-parser";

// we only repeat the imports, type synonyms and custom interfaces
// if there is a module, because otherwise those are dumped in the
// global namespace anyway
function wrapInModule(moduleName: string, scopeInfo: ControllerScopeInfo,
                      contents: string): string {
    return "module " + moduleName + " {\n" +
        scopeInfo.imports.join("\n") + "\n" +
        scopeInfo.typeAliases.join("\n") + "\n" +
        scopeInfo.nonExportedDeclarations.join("\n") + "\n" +
        contents +
        "}\n";
}

function getViewTestFilename(ctrlFname: string, viewFname: string): string {
    return `${ctrlFname}_${viewFname}_viewtest.ts`;
}

async function processControllerView(prjSettings: ProjectSettings,
    controllerPath: string, viewPath: string, ngFilters: NgFilter[],
    tagDirectives: TagDirectiveHandler[],
    attributeDirectives: AttributeDirectiveHandler[]) {
    const scopeContents: ControllerScopeInfo = await extractControllerScopeInfo(
        controllerPath, prjSettings.ctrlViewFragmentExtractors);
    if (scopeContents.scopeInfo.isNone()) {
        // no point of writing anything if there is no scope block
        return;
    }
    const viewExprs = await parseView(
        prjSettings.resolveImportsAsNonScope || false,
        viewPath, scopeContents.viewFragments, scopeContents.importNames,
        Vector.ofIterable(tagDirectives),
        Vector.ofIterable(attributeDirectives),
        Vector.ofIterable(ngFilters));
    const pathInfo = parse(controllerPath);
    const viewPathInfo = parse(viewPath);
    // putting both controller & view name in the output, as one controller
    // may be used for several views.
    const outputFname = pathInfo.dir + "/" +
        getViewTestFilename(pathInfo.name, viewPathInfo.name);
    const moduleWrap = (x:string) => scopeContents.tsModuleName
        .map(n => wrapInModule(n, scopeContents, x))
        .getOrElse(x);
    const filterParams = ngFilters.map(f => `f__${f.name}:${f.type}`).join(",\n    ")
    const typeParams = scopeContents.scopeTypeParams.getOrElse("");
    writeFileSync(outputFname, moduleWrap(
            scopeContents.scopeInfo.getOrThrow() +
            `\n\nfunction ___f${typeParams}($scope: Scope${
                typeParams}, ${filterParams}) {\n` +
            viewExprs +
            "\n}\n") + "\n");
}

/**
 * Configuration for a ng-typeview project.
 */
export interface ProjectSettings {
    /**
     * The path for the project on disk (root folder)
     */
    path: string;
    /**
     * Folders within the project to exclude from analysis
     * (for instance external JS libraries, the folder where
     * your typescript is compiled to javascript, and so on).
     */
    blacklistedPaths: string[];
    /**
     * List of angular filters to handle during the analysis.
     * You can use [[defaultNgFilters]], add to that list, or specify your own.
     */
    ngFilters: NgFilter[];
    /**
     * List of controller-view connectors to use.
     * [[defaultCtrlViewConnectors]] contains a default list; you can use
     * that, add to that list, or specify your own.
     */
    ctrlViewConnectors: ControllerViewConnector[];
    /**
     * Hardcoded controller/view connections that'll be added
     * to the ones which were autodetected through ctrlViewConnectors.
     * Useful in case it's too hard to parse some connections
     * from source.
     */
    extraCtrlViewConnections: ControllerViewInfo[];
    /**
     * List of model-view connectors to use.
     * These tie model files to views.
     * This allows to express non-controller models, such
     * as directive models for instance.
     * [[defaultModelViewConnectors]] contains a default list; you can use
     * that, add to that list, or specify your own.
     */
    modelViewConnectors: ModelViewConnector[];
    /**
     * List of tag-bound angular directives to handle during the analysis.
     * [[defaultTagDirectiveHandlers]] contains a default list; you can use
     * that, add to that list, or specify your own.
     */
    tagDirectives: TagDirectiveHandler[];
    /**
     * List of attribute-bound angular directives to handle during the analysis.
     * [[defaultAttrDirectiveHandlers]] contains a default list; you can use
     * that, add to that list, or specify your own.
     */
    attributeDirectives: AttributeDirectiveHandler[];
    /**
     * Controller view fragment extractors. For instance, you may have
     * view fragments present in your controllers, for instance ng-grid has
     * 'cell templates' which typeview can also type-check through this mechanism.
     * Extractors allows you to tell ng-typeview about those.
     */
    ctrlViewFragmentExtractors: CtrlViewFragmentExtractor[];
    /**
     * When resolving the scope for variables in the view, we prefix "$scope."
     * for all variables except those defined in the view. For instance, a
     * `ng-repeat` will define local variables. For these, we do not prefix with
     * "$scope.". 99% of the time, that works great.
     * One issue that can come up though, is if you have static fields for
     * instance. If you read `MyClass.MY_STATIC_FIELD`... That'll work in javascript
     * and angular, due to the TS->JS transpilation. But in ng-typeview, we
     * can't declare on the scope a field of type [class of MyClass], so that
     * field.MY_STATIC_FIELD would work.
     * So a workaround is to specify in your controller:
     * `import MyClass = api.MyClass;`
     * In that case, if you enable this `resolveImportsAsNonScope` option
     * (disabled by default), ng-typeview will not resolve
     * `MyClass.MY_STATIC_FIELD` as `$scope.MyClass.MY_STATIC_FIELD` anymore,
     * but as `MyClass.MY_STATIC_FIELD`. And since we copy the imports in the
     * viewtest, it should work.
     * But it's pretty messy, so we rather encourage you to avoid statics if
     * at all possible.
     */
    resolveImportsAsNonScope?: boolean;
}

function deletePreviouslyGeneratedFiles(prjSettings: ProjectSettings): void {
    const files = sync(prjSettings.path + "/**/" + getViewTestFilename("*", "*"),
                       {nodir:true, ignore: prjSettings.blacklistedPaths});
    files.forEach(f => unlinkSync(f));
}

/**
 * Will go through the views and controllers in the project folder and
 * generate viewtest typescript files to ascertain type-safety of the views.
 * NOTE: The function returns a promise but is not fully async: a good part of its
 * runtime is spend running synchronous functions.
 */
export async function processProject(prjSettings: ProjectSettings): Promise<any> {
    deletePreviouslyGeneratedFiles(prjSettings);
    const files = sync(prjSettings.path + "/**/*.@(js|ts)",
                       {nodir:true, ignore: prjSettings.blacklistedPaths});
    const viewInfos = await Promise.all(
        files.map(f => extractCtrlViewConnsAngularModule(
            f, prjSettings.path,
            prjSettings.ctrlViewConnectors, prjSettings.modelViewConnectors)));
    const viewFilenameToControllerNames: HashMap<string,Vector<ControllerViewInfo>> =
        Vector.ofIterable(viewInfos)
        .flatMap(vi => Vector.ofIterable(vi.controllerViewInfos))
        .appendAll(prjSettings.extraCtrlViewConnections)
        .groupBy(cvi => cvi.viewPath);
    const controllerNameToFilename =
        Vector.ofIterable(viewInfos)
        .filter(vi => vi.controllerName.isSome())
     		// JS files are not going to have a scope interface
     		// definition so they're not helpful. Also, we can
     		// get twice the same file: original TS & compiled JS.
     		// => keep only the original TS in that case.
			  .filter(vi => vi.fileName.toLowerCase().endsWith(".ts"))
        .toMap(vi => [vi.controllerName.getOrThrow(), vi.fileName]);
    const viewFilenameToCtrlFilenamesViewConns =
        viewFilenameToControllerNames
        .map<string,Vector<string>>(
            (viewFname,ctrlViewInfos) =>
                [viewFname, collectionKeepDefined(
                    ctrlViewInfos.map(cvi => controllerNameToFilename.get(cvi.controllerName).getOrUndefined()))]);
    const viewFilenameToCtrlFilenamesModelConns =
        Vector.ofIterable(viewInfos)
        .flatMap(vi => Vector.ofIterable(vi.modelViewInfos))
        .groupBy(mvi => mvi.viewPath)
        .mapValues(mvis => mvis.map(mvi => mvi.modelPath));
    const viewFilenameToCtrlFilenames = viewFilenameToCtrlFilenamesViewConns.mergeWith(
        viewFilenameToCtrlFilenamesModelConns, (views1, views2) => views1.appendAll(views2));
    return Promise.all(viewFilenameToCtrlFilenames.toVector().map(
        ([viewName, ctrlNames]) => Promise.all(ctrlNames.map(
            ctrlName => processControllerView(prjSettings,
                ctrlName, prjSettings.path + "/" + viewName, prjSettings.ngFilters,
                prjSettings.tagDirectives,
                prjSettings.attributeDirectives)).toArray())).toArray());
}

try {
    processProject({
        path: process.argv[2],
        blacklistedPaths: process.argv.slice(3),
        ngFilters: defaultNgFilters,
        ctrlViewConnectors: defaultCtrlViewConnectors,
        modelViewConnectors: defaultModelViewConnectors,
        extraCtrlViewConnections: [],
        tagDirectives: defaultTagDirectiveHandlers,
        attributeDirectives: defaultAttrDirectiveHandlers,
        ctrlViewFragmentExtractors: defaultCtrlViewFragmentExtractors
    });
} catch (e) {
    console.log(e);
}
