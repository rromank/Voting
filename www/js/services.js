angular.module('votings')

.factory('LoginService', function() {
    var isLogin = false;
    var i = 1;
    return {
        isLogin: function() {
            console.log("isLogin " + i++);
            return isLogin;
        },
        setLogin: function(loginState) {
            console.log("setLogin " + i++);
            isLogin = loginState;
        }
    }     
});