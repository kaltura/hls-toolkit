/**
 * Created by itayk on 4/19/15.
 */
angular.module('hlsManager', [])
	.controller('hlsManagerController', function($http,$scope) {
		var hlsManager = this;
		hlsManager.captureLogs=false;
		hlsManager.progress = true;
		hlsManager.reset = function(){
			$http.get('/reset' );
		};
		hlsManager.add = function(){
			var hlsURL = encodeURIComponent(hlsManager.hlsURL);
			var streamName = hlsManager.streamName;
			var isLive = hlsManager.isLive === true?true:false;
			hlsManager.progressInterval = setInterval(function(){
				hlsManager.isProgress();
			},1000);
			$http.get('/add/'+streamName+'/'+hlsURL +'/'+isLive);
		};
		hlsManager.isProgress = function(){
			$http.get('/progress' ).success(function(data){
				if (!data){
					clearInterval(hlsManager.progressInterval);
					getStreams();
				}
				hlsManager.progress = data;
			})
		};
		hlsManager.kill = function(){
			$http.get('/kill');
		};
		hlsManager.clearLogs = function(){
			hlsManager.logs = '';

		}
		hlsManager.streams = [
			{name: "Stream1" , url: "http://xxxx/1.m3u8"} ,
			{name: "Stream2" , url: "http://xxxx/2.m3u8"}
		];
		hlsManager.playVOD = function(){
			$http.get('/playVOD') ;
		};
		hlsManager.playLive = function(){
			$http.get('/playLive') ;
		};
		hlsManager.disableBitrate = function(stream){
			var streamName = stream.stream.name;
			var bitrate = this.selectedBitRate;
			$http.get('/disableTrack/'+streamName+'/' + bitrate);
		};
		hlsManager.resetBitRates = function(stream){

			$http.get('/resetDisableTrack');
		};
		var getStreams = function() {
			$http.get( '/list' ).success( function ( data ) {
				hlsManager.streams = data;
			} );
		};
		setInterval(function(){
			if( hlsManager.captureLogs) {
				$http.get( '/logs' ).success( function ( data ) {
					hlsManager.logs = data +hlsManager.logs ;
				} );
			}
		},1000);
		getStreams();
		hlsManager.isProgress();
	});

