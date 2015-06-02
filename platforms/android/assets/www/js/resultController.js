angular.module('votings')

.controller('ResultCtrl', function($scope, $http, $stateParams, $rootScope) {
    var user = $rootScope.getUser();
    var userId = user.id;
    var items;
    
    // get voting
    $http.get("http://localhost:8080/api/voting/id/" + $stateParams.id)
    .success(function(response) {
        $scope.voting = response;
    });

    // get items
    $http.get("http://localhost:8080/api/item/" + $stateParams.id)
    .success(function(response) {
        $scope.items = response;
        $http.get("http://localhost:8080/api/answer/" + $stateParams.id + "/" + userId)
            .success(function(answer_response) {
                $scope.answers = answer_response;
                for (i = 0; i < $scope.items.length; i++) {
                    $scope.items[i].select = "false";
                    for (j = 0; j < $scope.answers.itemIds.length; j++) {
                        if ($scope.items[i].id == $scope.answers.itemIds[j]) {
                            $scope.items[i].select = "true";
                        }
                    }
                }            
            });
            // get percents
            $http.get("http://localhost:8080/api/answer/percent/" + $stateParams.id)
            .success(function(response) {
                for (i = 0; i < $scope.items.length; i++) {
                    for (var k in response.percents) {
                        if ($scope.items[i].id == k) {
                            $scope.items[i].percent = response.percents[k];
                            break;
                        }
                        $scope.items[i].percent = 0;
                    }
                }
            });
    });
    
    $http.get("http://localhost:8080/api/answer/votersNumber/" + $stateParams.id)
    .success(function(response) {
        $scope.votersNumber = response.number;
    });
       
    $scope.doRefresh = function() {
        $scope.$broadcast('scroll.refreshComplete');
    };
    
})