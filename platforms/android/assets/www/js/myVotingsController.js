angular.module('votings')

.controller('MyVotingsCtrl', function($scope, $http, $ionicPopup, $rootScope) {
    var user = $rootScope.getUser();
    $http.get("http://localhost:8080/api/voting/" + user.id)
        .success(function(response) {$scope.votings = response;});
    
    $scope.doRefresh = function() {
        $http.get("http://localhost:8080/api/voting/" + user.id)
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