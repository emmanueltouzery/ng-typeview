# ng-typeview
[![NPM version][npm-image]][npm-url]

## Purpose

ng-typeview aims to enable type-checking of `angular1` views. Normally, angular1 views
are html files with special purpose markers (special tags & annotations) which are
registered as angular directives and filters, which cooperate with the matching
controller(s) which are written in javascript.

It is possible to use `typescript` instead of javascript for angular applications;
in that case you get type-checking for the controllers and the remaining
client-side code, but still no type-checking for the views, which are exercised
only at runtime.

ng-typeview allows to extract the code from the views in new 'viewtest' typescript
files, which can then get type-checked against the controllers.

## Operation mode

ng-typeview is not an application, but a library. The reason is that it is
expected that each real-world angular1 application will have enough customizations
to require special handling, which will be better managed through custom code than
options of an executable.

ng-typeview expects that in the controllers you define an interface for the scope:

```typescript
interface Scope extends ng.IScope {
    modal: {title: string};
    showTitle: boolean;
}
```

(ng-typeview searches for an interface named `Scope` in the controller)

In the matching view, ng-typeview searches for expressions like `{{title}}`,
or `ng-if='showTitle'`, and similar.

Then it generates a new 'viewtest' typescript file containing the scope definition,
and also expressions extracted from the view. A bit more complex expressions
such as `ng-repeat`, `ng-switch` are also supported. Filters such as
`myList | orderBy: 'name'` as well. The generated typescript code is not meant
to be executed, only to be used for type-checking.

In addition you can also let ng-typeview know about your own directives and
filters so they'll get extracted from the views & properly converted to
typescript code for type-checking.

You can view an example of the operation by looking in the ng-typeview source, in the
`test/data` subfolder, there is a controller, a view, and the expected generated
typescript code, that can confirm whether the view type-checks or not.

## API docs

You can see the full API documentation [by clicking here.](http://emmanueltouzery.github.io/ng-typeview/globals.html)

The main entry point is the [processProject](http://emmanueltouzery.github.io/ng-typeview/globals.html#processproject) function.
You must prepare a [ProjectSettings](http://emmanueltouzery.github.io/ng-typeview/interfaces/projectsettings.html)
object and `processProject` will go through your source and generate the 'viewtest'
files. Each field of `ProjectSettings` allows you to customize an aspect of the
integration with your angular1 application.

## Getting started

You need to create an application depending on ng-typeview. And basically you
just need to call `processProject`. Then ng-typeview will generate the 'testview'
files in the folder of your application. Then try to compile your application.
The typescript compiler will warn you in case some code from the views doesn't
match code from the controllers.

You can look at `test/ng-typeview.ts` for a sample set-up.

That's good for a first run, but then you probably have to customize ng-typeview
for your application.

ng-typeview leaves the generated 'testview' files in your source code directory; it's
probably best not to commit them to source control. If you minify your javascript,
they won't be included since nothing links to them. If you don't, they might be
copied to your server, but since noone links to them and they have no side-effects
they shouldn't pose any problem. That said, deleting them is trivial, as they have
a clear filename pattern.

## Customizations

ng-typeview uses the [typescript compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
to parse the javascript and typescript code, [htmlparser2](https://github.com/fb55/htmlparser2)
to parse the views, and the [parsimmon](https://github.com/jneen/parsimmon) parser
combinator library to parse angular expressions (such as "for .. in .. track by ..").

### ProjectSettings.ctrlViewConnectors
To begin with, ng-typeview must be able to connect controllers and views.
It must find out that the controller `app/core/user-list-ctrl.ts` matches the view
`app/core/user-list-view.html`. ng-typeview makes no assumption on files layout
or naming conventions (especially since the controller-view connection may not
be 1:1).
By default ng-typeview can detect `$modal.open()` calls, which connect controllers and views,
and also module state declarations (the `ng-controller` directive is ignored though for now).
You can register new ways of connecting controllers and views, for instance if your
app wraps these calls through helper functions, preventing ng-typeview from spotting them.

Since this is typescript parsing, this part is tied to the
[typescript compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API).

### ProjectSettings.ngFilters
If you define your own angular filters, you can let ng-typeview know about them
and the parameters they expect through `ngFilters`. You just need to give a name
and parameter types.

### ProjectSettings.attributeDirectives & tagDirectives
You can also register your directives. There you must generate typescript code
(as string), used to check the type-safety of the expressions found in the views.
You implement either a [AttributeDirectiveHandler](http://emmanueltouzery.github.io/ng-typeview/interfaces/attributedirectivehandler.html),
or a [TagDirectiveHandler](http://emmanueltouzery.github.io/ng-typeview/interfaces/tagdirectivehandler.html).

As input you get the contents of tags & attributes from the view.
You are given some API to assist with the code generation,
[CodegenHelper](http://emmanueltouzery.github.io/ng-typeview/classes/codegenhelper.html);
in fact you must use it, because ng-typeview must know when you declare new
variables.

The directives that ng-typeview supports out of the box are developed using that
mechanism, so you can also look at `src/ng-directives.ts` for examples of use.


## Caveats

* the API is still changing very often
* was tested only against two projects from a single company for now
* incomplete mapping of standard directives & filters (ng-typeview does not support
  all of the syntaxes of `ng-repeat` for instance.. Pull requests welcome :-) )
* probably incomplete in just about all the aspects, as angular is huge
* angular1 only

## Commands

    npm install

    npm test

    npm run-script docgen

[npm-image]: https://img.shields.io/npm/v/ng-typeview.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/ng-typeview
