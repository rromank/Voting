angular.module('votings')

.controller('VotingCtrl', function($scope, $http, $stateParams) {

    $http.get("http://localhost:8080/api/voting/id/" + $stateParams.id)
    .success(function(response) {
        $scope.voting = response;
    });

    
    $http.get("http://localhost:8080/api/item/" + $stateParams.id)
    .success(function(response) {
        $scope.items = response;
    });
    
    $scope.confirm = function(group) {
        console.log(group);
    }

})