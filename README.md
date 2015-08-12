# intern-yadda-loader

> [Yadda](https://github.com/acuminous/yadda) loader for [Intern](https://theintern.github.io)

[Yadda](https://github.com/acuminous/yadda) is a plain-language [BDD](https://en.wikipedia.org/wiki/Behavior-driven_development) system for Javascript. [Intern](https://theintern.github.io) is a flexible Javascript test runner. This package loads Yadda features/scenarios/steps as Intern suites/tests.

## Features

* [Context tracking](http://acuminous.gitbooks.io/yadda-user-guide/content/en/usage/managing-state.html) across scenario steps (unique per-scenario) using `this.ctx`.
* Single, global step library similar to [Cucumber](https://cucumber.io) and [moonraker](https://github.com/LateRoomsGroup/moonraker).
* Promise-based step definitions (or use the Intern [`this.async()`](https://theintern.github.io/intern/#test-object) api).
* AMD syntax for better Intern integration.

## Installation

See the [Intern User Guide](https://theintern.github.io/intern/) for information on setting up an intern project. Then install `yadda` and `intern-yadda-loader`:

```console
$ npm install yadda intern-yadda-loader --save-dev
```

**NOTE:** Yadda is a [peer dependency](https://docs.npmjs.com/files/package.json#peerdependencies) of `intern-yadda-loader`.

## Configuration

```js
// `test/conf.js`
define({
  environments: [{browserName: 'phantomjs'}],
  loaderOptions: {
    packages: [
      // Load `intern-yadda-loader` as `yadda`
      { name: 'yadda', location: './node_modules/intern-yadda-loader' },
      // Load package containing step definitions
      { name: 'steps', location: './test/steps' }
    ]
  },
  functionalSuites: [
    // Specify features to load
    'yadda!test/features/bottles.feature',
    'yadda!test/features/google.feature'
    // Also accepts directories, e.g. `yadda!test/features`
  ],
  // Yadda configuration
  yadda: {
    // An array or string specifying step definition packages to load
    steps: [
      'steps/bottles-library',
      'steps/google-library'
    ],
    // The language to use when parsing the features (default: `English`)
    lang: 'English'
  }
});
```

## Examples

```gherkin
# `test/features/bottles.feature`

Feature: 100 Green Bottles

Scenario: Should fall from the wall

  Given 100 green bottles are standing on the wall
  When 1 green bottle accidentally falls
  And another falls
  Then there are 98 green bottles standing on the wall
```

```js
// `test/steps/bottles-library.js`
define(function (require) {
  var expect = require('intern/chai!expect');

  return function (library) {
    library
      .given("$NUM green bottles are standing on the wall", function (number) {
        // The context is reused only within the current scenario.
        expect(this.ctx.bottles).to.be.undefined;
        this.ctx.bottles = parseInt(number);
      })
      .when("$NUM green bottle accidentally falls", function (number, next) {
        // Async using `next` callback.
        var ctx = this.ctx;
        setTimeout(function () {
          ctx.bottles--;
          next();
        }, 200);
      })
      .define("And another falls", function () {
        // Async using Intern `this.async()` convention.
        var ctx = this.ctx;
        var deferred = this.async();
        setTimeout(function () {
          ctx.bottles--;
          deferred.resolve();
        }, 200);
      })
      .then("there are $NUM green bottles standing on the wall", function (number) {
        expect(this.ctx.bottles).to.equal(parseInt(number));
      });
  };
});
```

```gherkin
# `test/features/google.feature`

Feature: Multilingual Google Search

Scenario: Searching Google For The First Time

  When I open Google's fr search page
  then the title is Google
  and the search form exists

  When I search for foo
  then the title is foo - Recherche Google
  and the search for foo was made
  and 10 or more results were returned

Scenario: Searching Google Again

  When I open Google's ie search page
  then the title is Google
  and the search form exists

  When I search for bar
  then the title is bar - Google Search
  and the search for bar was made
  and 10 or more results were returned  
```

```js
// `test/steps/google-library.js`
define(function (require) {
  var expect = require('intern/chai!expect');

  return function (library, dictionary) {
    // Access to dictionary for custom definitions.
    dictionary
      .define('LOCALE', /(fr|es|ie)/)
      .define('NUM', /(\d+)/);

    library
      .when("I open Google's $LOCALE search page", function(locale) {
        return this.remote.get("http://www.google." + locale + "/");
      })
      .then("the title is $TITLE", function(title) {
        return this.remote
          .sleep(500)
          .getPageTitle()
          .then(function (pageTitle) {
            expect(pageTitle).to.equal(title);
          });
      })
      .then("the $ACTION form exists", function(action) {
        return this.remote
          .findByCssSelector('form[action="/' + action + '"]');
      })
      .when("I search for $TERM", function(term) {
        return this.remote
          .findByName('q')
          .click()
          .type(term + '\n');
      })
      .then("the search for $TERM was made", function(term) {
        var regex = new RegExp('q=' + term);
        return this.remote
          .sleep(500)
          .getCurrentUrl()
          .then(function (url) {
            expect(url).to.match(new RegExp('q=' + term));
          });
      })
      .then("$NUM or more results were returned", function(number) {
        return this.remote
          .findAllByCssSelector('h3.r')
          .then(function (elements) {
            expect(elements).to.have.length.of.at.least(parseInt(number));
          });
      });
  };
});
```

## TODO

* Docs
* Tests
