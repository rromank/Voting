angular.module('votings', ['ionic', 'ngCordova'])

.run(function($ionicPlatform, $ionicPopup) {
  $ionicPlatform.ready(function() {
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      StatusBar.styleDefault();
    }
      if(window.Connection) {
          console.log("inet");
        if(navigator.connection.type == Connection.NONE) {
            $ionicPopup.confirm({
                title: "Internet Disconnected",
                content: "The internet is disconnected on your device."
            })
            .then(function(result) {
                if(!result) {
                    ionic.Platform.exitApp();
                }
            });
        }
    }
  });
})
.config(['$httpProvider', function($httpProvider) {
    $httpProvider.defaults.headers.common["X-Requested-With"] = 'XMLHttpRequest';
    $httpProvider.defaults.headers.common['Content-Type'] = 'application/json; charset=utf-8';
}])

.config(function($stateProvider, $urlRouterProvider) {
    openFB.init({appId: '1400243013631390'});
    
    $stateProvider.state('app.profile', {
        url: "/profile",
        views: {
            'menuContent' :{
                templateUrl: "templates/profile.html",
                controller: "ProfileCtrl"
            }
        }
    })

  .state('app', {
    url: "/app",
    abstract: true,
    templateUrl: "templates/menu.html",
    controller: 'AppCtrl'
  })
  
  .state('app.login', {
      url: "/login",
      views: {
        'menuContent': {
            templateUrl: "templates/login.html",
            controller: "LoginCtrl"
        }
      }
  })
  
  .state('app.votings', {
      url: "/votings",
      views: {
          'menuContent': {
              templateUrl: "templates/votings.html",
              controller: "VotingsCtrl"
          }
      }
  })

  .state('app.voting', {
      url: "/voting/{id}",
      views: {
          'menuContent': {
              templateUrl: "templates/voting.html",
              controller: "VotingCtrl"
          }
      }
  })
    
  .state('app.result', {
      url: "/result/{id}",
      views: {
          'menuContent': {
              templateUrl: "templates/result.html",
              controller: "ResultCtrl"
          }
      }
  })
    
  .state('app.my_votings', {
      url: "/my_votings",
      views: {
          'menuContent': {
              templateUrl: "templates/my_votings.html",
              controller: "MyVotingsCtrl"
          }
      }
  })
  
  .state('app.create_voting', {
      url: "/create_voting",
      views: {
        'menuContent': {
            templateUrl: "templates/create_voting.html",
            controller: "CreateVotingCtrl"
        }
      }
  })
  
  .state('app.add_items', {
      url: "/add_items",
      views: {
        'menuContent': {
            templateUrl: "templates/add_items.html",
            controller: "CreateVotingCtrl"
        }
      }
  });
    
    $urlRouterProvider.otherwise('/app/login');
});