angular.module('votings')

.controller('LoginCtrl', function($scope, $stateParams, LoginService, $rootScope, $cordovaOauth, $location) {
    
    
    $scope.login = function() {
        $cordovaOauth.facebook("1400243013631390", ["email", "read_stream", "user_website", "user_location", "user_relationships"]).then(function(result) {
            $localStorage.accessToken = result.access_token;
            init();
        }, function(error) {
            alert(error);
            console.log(error);
        });
    };
    
    function init() {
        if($localStorage.hasOwnProperty("accessToken") === true) {
            $http.get("https://graph.facebook.com/v2.2/me", { params: { access_token: $localStorage.accessToken, fields: "id,name,gender,location,website,picture,relationship_status", format: "json" }}).then(function(result) {
                $scope.profileData = result.data;
                console.log(result.data);
                $rootScope.user = result.data;
                saveUserIntoLocalStorage(result.data);
            }, function(error) {
                alert("There was a problem getting your profile.  Check the logs for details.");
                console.log(error);
            });
        } else {
            alert("Not signed in");
            $location.path("/login");
        }
    };
    
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
                    saveUserIntoLocalStorage(user);
                    console.log("User successfully retrieved from facebook");
                });
            },
            error: function(error) {
                alert('Facebook error: ' + error.error_description);
            }
        });
    }
    
    function saveUserIntoLocalStorage(user) {
        window.localStorage['user'] = JSON.stringify(user);
    }
    
})