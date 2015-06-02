// user - global user storage
angular.module('votings')

.controller('AppCtrl', function($scope, $state, $timeout, $rootScope) {    
    $scope.logout = function () {
        openFB.logout(function(response) {
            $state.go('app.login');
        });
        window.localStorage['user'] = {};
    };
 
    $scope.goVotings = function() {
        $state.go('app.votings');    
    };
        
    $rootScope.getUser = function() {
        var user = JSON.parse(window.localStorage['user'] || '{}');
        console.log(user);
        return user;
    }
    
});