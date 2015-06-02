angular.module('votings')

.controller('VotingsCtrl', function($scope, $http, $state, $rootScope) {
    $http.get("http://localhost:8080/api/voting/current")
    .success(function(response) {$scope.current_votings = response;});

    $http.get("http://localhost:8080/api/voting/notStarted")
    .success(function(response) {$scope.not_started_votings = response;});

    $http.get("http://localhost:8080/api/voting/finished")
    .success(function(response) {$scope.finished_votings = response;});
    
    $scope.doRefresh = function() {
        $http.get('http://localhost:8080/api/voting/current')
            .success(function(response) {
                $scope.current_votings = response;
                $http.get("http://localhost:8080/api/voting/notStarted")
                    .success(function(response) {$scope.not_started_votings = response;});

                $http.get("http://localhost:8080/api/voting/finished")
                    .success(function(response) {$scope.finished_votings = response;});
            })
            .finally(function() {
                $scope.$broadcast('scroll.refreshComplete');
        });
    };
    
    $scope.open = function(id) {
        console.log(id);
        $http.get("http://localhost:8080/api/answer/hasAnswer/" + id + "/" + $rootScope.user.id)
            .success(function(response) {
                if (response.value) {
                    $state.go('app.result', {id: id});
                } else {
                    $state.go('app.voting', {id: id});                
                }
            }); 
    }
})