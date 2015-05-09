angular.module('votings')

.controller('MyVotingsCtrl', function($scope, $http, $ionicPopup, $rootScope) {
    //$http.get("http://localhost:8080/api/voting/" + $rootScope.user.id)
    $http.get("http://localhost:8080/api/voting/654283331384697")
    .success(function(response) {$scope.votings = response;});
    
    $scope.doRefresh = function() {
//        $http.get("http://localhost:8080/api/voting/" + $rootScope.user.id)
        $http.get("http://localhost:8080/api/voting/654283331384697")
            .success(function(response) {
                $scope.votings = response;
            })
            .finally(function() {
                $scope.$broadcast('scroll.refreshComplete');
        });
    };
    
    $scope.onHold = function(title, id) {
        $ionicPopup.alert({
          title: 'Delete voting',
          content: 'Delete voting <b>' + title + '</b>?',
            buttons: [
                { text: 'Cancel' },
                {
                    text: '<b>Delete</b>',
                    type: 'button-positive',
                    onTap: function(e) {
                        deleteVoting(id)
                    }
                }
            ]
        });
    }
    
    function deleteVoting(id) {
        $http.delete("http://localhost:8080/api/voting/" + id)
            .success(function(response) {
                console.log(1);
            });
    }
})