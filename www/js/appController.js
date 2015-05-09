angular.module('votings')

.controller('AppCtrl', function($scope, $state, $timeout) {    
    $scope.logout = function () {
        openFB.logout(function(response) {
            $state.go('app.login');
        });
    };
 
    $scope.goVotings = function() {
        $state.go('app.votings');    
    };
});