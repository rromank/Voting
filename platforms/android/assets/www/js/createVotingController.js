angular.module('votings')

.controller('CreateVotingCtrl', function($scope, $location, $state, $http, $rootScope, $ionicPopup) {
    var user = $rootScope.getUser();
    
    $scope.url = function() {
        currentUrl = window.location.href;
        console.log(window.location.href);
                    $ionicPopup.alert({
              title: 'Success',
              content: currentUrl
            }).then(function(res) {
              console.log('Test Alert Box');
            });
        
    }
    var size = 0;
    
    $scope.voting = {
        startDate : new Date(2015, 4, 15),
        finishDate : new Date(2015, 6, 26),
        array : {},
        current : "",
        name : ""
    }
    
    $scope.createVotingStepOne = function(voting) {
        $rootScope.voting = {};
        $rootScope.voting.name = voting.name;
        $rootScope.voting.startDate = voting.startDate;
        $rootScope.voting.finishDate = voting.finishDate;
        $rootScope.voting.isMultiple = voting.isMultiple;
        $rootScope.voting.userId = user.id;
        
        clearInputs(voting);
        $state.go("app.add_items");
    }
    
    function clearInputs(voting) {
        voting.name = "";
        voting.isMultiple = false;
    }
    
    $scope.creteItem = function(voting) {
        if (voting.current != "") {
            voting.array[size++] = voting.current;
            voting.current = "";            
        }
        $rootScope.voting.items = voting.array;
    }
    
    $scope.createVoting = function(voting) {
        console.log($rootScope.voting);
        $http.post('http://localhost:8080/api/voting', $rootScope.voting).
            success(function(data, status, headers, config) {
                $scope.voting.name = "";
                $state.go("app.votings");
            }).
            error(function(data, status, headers, config) {
                console.log(2);
            });
    }
})