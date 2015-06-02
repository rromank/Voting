angular.module('votings')

.controller('VotingCtrl', function($scope, $http, $stateParams, $rootScope, $state) {   
    var user = $rootScope.getUser();
    var maskingFactorBean = {};
    var maskingFactor;
    
    // get keys from server
    $http.get("http://localhost:8080/api/blind/" + user.id + "/" + $stateParams.id)
    .success(function(response) {
        $rootScope.keys = {};
        $rootScope.keys.exponent = bigIntFromString(response.exponent);
        $rootScope.keys.publicKey = bigIntFromString(response.publicKey);
            maskingFactorBean.maskingFactor = getMaskingFactor($rootScope.keys.publicKey).toString();
    
    $http.post('http://localhost:8080/api/blind/maskingFactor/' + user.id + "/" + $stateParams.id, maskingFactorBean).
        success(function(data, status, headers, config) {
            maskingFactor = bigIntFromString(data.maskingFactor);
        }).
        error(function(data, status, headers, config) {
            console.log("answer not sended");
        });

    });
    
    $http.get("http://localhost:8080/api/voting/id/" + $stateParams.id)
    .success(function(response) {
        $scope.voting = response;
    });

    $http.get("http://localhost:8080/api/item/" + $stateParams.id)
    .success(function(response) {
        $scope.items = response;
    });
    
    $scope.confirm = function(group) {
        var answer = {};
        answer.votingId = $stateParams.id;
//        answer.userId = "654283331384697";
        answer.userId = user.id;
        answer.items = [];
        for (i = 0; i < group.length; i++) {
            answer.items[i] = {};
            answer.items[i].id = group[i].id;
            answer.items[i].enabled = group[i].enabled;
        }
        sendAnswer(answer, user.id, $stateParams.id, maskingFactor);
    }
    
    $scope.clearInputs = function(group, item) {
        for (i = 0; i < group.length; i++) {
            group[i].enabled = false;
        }
        item.enabled = true;
    }
    
    function sendAnswer(answer, userId, votingId, maskingFactor) {
        console.log(answer);
        var blindedAnswer = blindAnswer(answer, maskingFactor);
        var message = {};
        message.blindedMessage = blindedAnswer;
        $http.post('http://localhost:8080/api/blind/sign/' + userId + "/" + votingId, message).
            success(function(data, status, headers, config) {
                var unblindedAnswer = unblindAnswer(data.signedBlindedMessage, maskingFactor);
                console.log("unblinded signed = " + unblindedAnswer.toString());
            
                var signedMessage = {};
                signedMessage.signedMessage = unblindedAnswer.toString();
                sendUnblindedSignedMessage(userId, votingId, signedMessage);
                $state.go('app.result', {id: $stateParams.id});
            });
    }
    
    function sendUnblindedSignedMessage(userId, votingId, signedMessage) {
        $http.post('http://localhost:8080/api/blind/signed/' + userId + "/" + votingId, signedMessage).
            success(function(data, status, headers, config) {
                console.log("Message = " + data.message);
            });
    }
    
    function blindAnswer(answer, maskingFactor) {
        var json = JSON.stringify(answer);
        json = json.replace(/"/g , "'");
        var message = bigIntFromMessage(json);
        var blindedMessage = blindMessage(message, maskingFactor, $rootScope.keys.exponent, $rootScope.keys.publicKey);
        return blindedMessage.toString();
    }
    
    function unblindAnswer(blindedSignedMessage, maskingFactor) {
        var signedMessage = unblindMessage(bigIntFromString(blindedSignedMessage), maskingFactor, $rootScope.keys.publicKey);
        return signedMessage;
    }

})