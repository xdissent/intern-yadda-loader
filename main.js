define(function (require) {

  var fs = require('intern/dojo/node!fs');
  var path = require('intern/dojo/node!path');
  var Yadda = require('intern/dojo/node!yadda');
  var Promise = require('intern/dojo/Promise');
  var Suite = require('intern/lib/Suite');
  var Test = require('intern/lib/Test');
  var intern = require('intern');

  function StepContext (test) {
    this.test = test;
    this.isAsync = false;
  }

  StepContext.prototype = {
    constructor: StepContext,
    get ctx() {
      return this.test.parent.context;
    },
    get name() {
      return this.test.name;
    },
    get remote() {
      return this.test.remote;
    },
    get sessionId() {
      return this.test.sessionId;
    },
    get timeout() {
      return this.test.timeout;
    },
    set timeout(value) {
      this.test.timeout = value;
    },
    async: function () {
      return this.test.async.apply(this, arguments);
    },
    get skipped() {
      return this.test.skipped;
    },
    skip: function () {
      return this.test.skip.apply(this.test, arguments);
    },
    toJSON: function () {
      return this.test.toJSON();
    }
  };

  // Tracks the only/pending status of features and scenarios to determine
  // which tests to skip and for what reason.
  var onlyScenarios = [];
  var onlyFeatures = [];
  var pendingScenarios = [];
  var pendingFeatures = [];

  return {
    load: function (resourceId, require, done) {

      // Set up yadda environment
      var config = loadConfig(intern.config.yadda);
      var language = loadLanguage(config.lang);
      var features = loadFeatures(resourceId, language);
      var dictionary = new Yadda.Dictionary();
      var library = loadLibrary(language, dictionary);
      var yadda = Yadda.createInstance(library);

      // Load steps packages and register feature suites.
      return require(config.steps, function () {
        [].slice.call(arguments).forEach(function (step) {
          step(library, dictionary);
        });
        intern.executor.register(function (suite) {
          features.forEach(featureSuite.bind(null, language, suite));
          done();
        });
      }, done);

      function loadConfig (config) {
        var config = config || {};
        config.lang = config.lang || 'default';
        config.steps = config.steps ? [].concat(config.steps) : ['steps'];
        return config;
      }

      function loadLanguage (lang) {
        return Yadda.localisation[lang];
      }

      function loadLibrary (language, dictionary) {
        var library = language.library(dictionary);

        // Hijack define to wrap step definitions in an intern-like context.
        var define = library.define;
        library.define = function (signatures, fn, macro_context) {
          return define.call(library, signatures, wrappedFn, macro_context);
          function wrappedFn () {
            var args = [].slice.apply(arguments);
            // Bail early if the step want a next callback explicitly.
            if (args.length === fn.length) return fn.apply(this, args);
            // Remove the real callback from args.
            var next = args.pop();
            try {
              // Run the step function.
              var result = fn.apply(this, args);
            } catch (err) {
              return next(err);
            }
            // If the test called async then force result into a promise.
            if (this.isAsync && !(result && result.then)) {
              result = this.async().promise;
            }
            // Handle promise-like return from step definition.
            if (result && result.then) {
              return result.then(function () {
                next();
              }, function (err) {
                next(err);
              });
            }
            next();
          }
        };
        return library;
      }

      function featureSuite (language, parent, feature) {
        var suite = new Suite({
          name: feature.title,
          parent: parent
        });
        parent.tests.push(suite);
        if (hasAnnotation(language, feature.annotations, 'only')) {
          onlyFeatures.push(suite);
        }
        if (hasAnnotation(language, feature.annotations, 'pending')) {
          pendingFeatures.push(suite);
        }
        feature.scenarios.forEach(scenarioSuite.bind(null, language, suite));
      }

      function scenarioSuite (language, parent, scenario) {
        var suite = new Suite({
          name: scenario.title,
          parent: parent,
          context: {}
        });
        parent.tests.push(suite);
        if (hasAnnotation(language, scenario.annotations, 'only')) {
          onlyScenarios.push(suite);
        }
        if (hasAnnotation(language, scenario.annotations, 'pending')) {
          pendingScenarios.push(suite);
        }
        scenario.steps.forEach(stepTest.bind(null, language, suite));
      }

      function stepTest (language, parent, step) {
        var test = new Test({
          name: step,
          parent: parent,
          test: function () {
            var reason = testSkipReason(this.parent);
            if (reason) return this.skip(reason);
            var context = new StepContext(this);
            return new Promise(function (resolve, reject) {
              yadda.run(step, context, function (err) {
                if (err) return reject(err);
                resolve();
              });
            });
          }
        });
        parent.tests.push(test);
      }

      function loadFeatures (resourceId, language) {
        var featurePath = require.toUrl(resourceId);
        var features = [];
        try {
          fs.readdirSync(featurePath);
          features = new Yadda.FeatureFileSearch(featurePath).list();
        } catch (err) {
          if (err.code !== 'ENOTDIR') throw err;
          features = [featurePath];
        }
        var parser = new Yadda.parsers.FeatureFileParser(language);
        return features.reduce(function (features, feature) {
          return features.concat(parser.parse(feature));
        }, []);
      }

      function hasAnnotation (language, annotations, name) {
        var regexp = new RegExp('^' + language.localise(name) + '$', 'i');
        for (var key in annotations) {
          if (regexp.test(key)) return true;
        }
      }

      function testSkipReason (suite) {
        if (onlyFeatures.length > 0 && onlyFeatures.indexOf(suite.parent) < 0) {
          return 'only';
        }
        if (pendingFeatures.indexOf(suite.parent) >= 0) {
          return 'pending';
        }
        if (onlyScenarios.length > 0 && onlyScenarios.indexOf(suite) < 0) {
          return 'only';
        }
        if (pendingScenarios.indexOf(suite) >= 0) {
          return 'pending';
        }
      }
    }
  };
});