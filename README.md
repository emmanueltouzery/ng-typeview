# ng-typeview

## Purpose

ng-typeview aims to enable type-checking of `angular1` views. Normally, angular1 views
are html files with special purpose markers (special tags & annotations) which are
registered as angular directives and filters, which cooperate with the matching
controller(s) which are written in javascript.

It is possible to use `typescript` instead of javascript; in that case you get
type-checking for the controllers and the remaining client-side code, but still
no type-checking for the views, which are exercised only at runtime.

ng-typeview allows to extract the code from the views in new 'viewtest' typescript
files, which can then get type-checked against the controllers.

## Operation mode

ng-typeview is not an application, but a library. The reason is that it is
expected that each real-world angular1 application will have enough customizations
to require special handling, which will be better managed through custom code than
options of an executable.

ng-typeview expects that in the controllers you define an interface for the scope:

    interface Scope extends ng.IScope {
        modal: {title: string};
        showTitle: boolean;
    }

In the matching view, ng-typeview searches for expressions like `{{title}}`,
or `ng-if='showTitle'`, and similar.

Then it generates a new 'viewtest' typescript file containing the scope definition,
and also expressions extracted from the view. A bit more complex expressions
such as `ng-repeat`, `ng-switch` are also supported. Filters such as
`myList | orderBy: 'name'` as well. The generated typescript code is not meant
to be executed, only to be used for type-checking.

In addition you can also define your own directives and filters so they'll get
extracted from the views & properly converted to typescript code for type-checking.

## API docs

You can see the full API documentation [by clicking here.](http://emmanueltouzery.github.io/ng-typeview/)

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
That's good for a first run, but then you probably have to customize ng-typeview
for your application.

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
by default ng-typeview can detect `$modal.open()` calls, which connect controllers and views,
and also module state declarations.
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

## Caveats

* won't detect scopes with inheritance (the `Scope` in the controller must inherit
  from `ng.IScope`, if you use inheritance with your scopes, ng-typeview won't work,
  for now)
* incomplete mapping of standard directives & filters (ng-typeview does not support
  all of the syntaxes of `ng-repeat` for instance.. Pull requests welcome :-) )

## Commands

    npm install

    npm test

    npm run-script docgen
