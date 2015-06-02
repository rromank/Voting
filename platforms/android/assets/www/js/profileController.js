angular.module('votings')

.controller('ProfileCtrl', function($scope, $rootScope) {
    openFB.api({
        path: '/me',
        params: {fields: 'id,name'},
        success: function(user) {
            $scope.$apply(function() {
                $scope.user = user;
                $rootScope.user = user;
                console.log($rootScope.user);
            });
        },
        error: function(error) {
            alert('Facebook error: ' + error.error_description);
        }
    });
})