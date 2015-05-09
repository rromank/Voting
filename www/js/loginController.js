angular.module('votings')

.controller('LoginCtrl', function($scope, $stateParams, LoginService, $rootScope) {
    $scope.fbLogin = function() {
    openFB.login(
        function(response) {
            if (response.status === 'connected') {
                console.log('Facebook login succeeded');
                LoginService.setLogin(true);
                getUser();
                $scope.goVotings();
            } else {
                alert('Facebook login failed');
            }
            
        },
        {scope: 'email,publish_actions'});
    };
    
    function getUser() {
        openFB.api({
            path: '/me',
            params: {fields: 'id, name'},
            success: function(user) {
                $scope.$apply(function() {
                    $rootScope.user = user;
                    console.log("User successfully retrieved from facebook");
                });
            },
            error: function(error) {
                alert('Facebook error: ' + error.error_description);
            }
        });
    }
})