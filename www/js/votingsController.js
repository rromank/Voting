angular.module('votings')

.controller('VotingsCtrl', function($scope, $http) {
    $http.get("http://localhost:8080/api/voting")
    .success(function(response) {$scope.votings = response;});
    
    $scope.doRefresh = function() {
        $http.get('http://localhost:8080/api/voting')
            .success(function(response) {
                $scope.votings = response;
                console.log($scope.votings);
            })
            .finally(function() {
                $scope.$broadcast('scroll.refreshComplete');
        });
    };
    
    $scope.open = function(id) {
        console.log(id);
    }
})